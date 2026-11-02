import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export type Provider = 'github' | 'figma' | 'miro';
export function providerName(value: unknown): Provider {
  if (value !== 'github' && value !== 'figma' && value !== 'miro') throw new ApiError(400, 'Choose GitHub, Figma, or Miro.');
  return value;
}

function encryptionKey(env: NodeJS.ProcessEnv) {
  if (env.INTEGRATION_ENCRYPTION_KEY) {
    const key = Buffer.from(env.INTEGRATION_ENCRYPTION_KEY, 'base64');
    if (key.length !== 32) throw new ApiError(503, 'The integration encryption key must contain 32 base64-encoded bytes.');
    return key;
  }
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new ApiError(503, 'Server integration settings are not configured.');
  return Buffer.from(hkdfSync('sha256', secret, 'placepms', 'integration-vault-v1', 32));
}

export function seal(value: string, owner: string, env: NodeJS.ProcessEnv) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  cipher.setAAD(Buffer.from(owner));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function unseal(value: string, owner: string, env: NodeJS.ProcessEnv) {
  try {
    const [version, iv, tag, body] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !body) throw new Error('Invalid envelope');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(env), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(owner));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch { throw new ApiError(409, 'This connection could not be decrypted. Disconnect it and connect again.'); }
}

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function secretsEqual(expected: string, received: string | undefined) {
  if (!received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function privateAddress(value: string) {
  const address = value.toLowerCase().replace(/^\[|\]$/g, '');
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split('.').map(Number);
    const [first, second] = parts;
    return first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 168)) || (first === 198 && second >= 18 && second <= 19);
  }
  if (version === 6) {
    const mapped = address.replace(/^::ffff:/, '');
    if (isIP(mapped) === 4) return privateAddress(mapped);
    return address === '::' || address === '::1' || address.startsWith('fc') || address.startsWith('fd') ||
      address.startsWith('fe8') || address.startsWith('fe9') || address.startsWith('fea') || address.startsWith('feb') ||
      address.startsWith('2001:db8:') || address.startsWith('2001:10:');
  }
  return false;
}

function publicHttpUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2000) throw new ApiError(400, 'The target URL is invalid or too long.');
  let url: URL;
  try { url = new URL(value); } catch { throw new ApiError(400, 'Enter a valid HTTP or HTTPS target URL.'); }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !hostname ||
      hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === 'metadata.google.internal' ||
      hostname === 'metadata.google' || privateAddress(hostname)) {
    throw new ApiError(400, 'Use a public HTTP or HTTPS URL without embedded credentials.');
  }
  return url;
}

/** Resolve the host before a server-side request so private-network SSRF targets are rejected. */
export async function publicHttpTarget(value: unknown) {
  const url = publicHttpUrl(value);
  try {
    const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw new Error('private address');
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw new ApiError(400, 'The target host could not be verified as public.');
  }
  return url;
}

export function repositoryPath(value: unknown) {
  if (typeof value !== 'string') throw new ApiError(400, 'Enter a GitHub repository URL or owner/repository.');
  let path = value.trim();
  if (/^https?:/i.test(path)) {
    const url = new URL(path);
    if (url.protocol !== 'https:' || !['github.com', 'www.github.com'].includes(url.hostname) || url.username || url.password || url.port) throw new ApiError(400, 'Use an HTTPS github.com repository URL.');
    path = url.pathname.replace(/^\/+|\/+$/g, '');
  }
  path = path.replace(/\.git$/, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(path) || ['.', '..'].includes(path.split('/')[1])) throw new ApiError(400, 'Use owner/repository or its GitHub URL, without a branch or file path.');
  return path;
}

export function providerResource(provider: 'figma' | 'miro', value: unknown) {
  if (typeof value !== 'string') throw new ApiError(400, 'Enter a file or board URL.');
  let key = value.trim();
  if (/^https?:/i.test(key)) {
    const url = new URL(key);
    const host = provider === 'figma' ? 'figma.com' : 'miro.com';
    if (url.protocol !== 'https:' || ![host, `www.${host}`].includes(url.hostname) || url.username || url.password || url.port) throw new ApiError(400, `Use a ${host} HTTPS URL.`);
    const match = provider === 'figma' ? url.pathname.match(/^\/(?:design|file|proto|board)\/([A-Za-z0-9_-]+)/) : url.pathname.match(/^\/app\/board\/([^/]+)/);
    if (!match) throw new ApiError(400, 'The file or board URL is not recognized.');
    key = decodeURIComponent(match[1]);
  }
  if (!/^[A-Za-z0-9_=-]{5,150}$/.test(key)) throw new ApiError(400, 'The resource ID is not valid.');
  return key;
}

export function filePath(value: unknown) {
  const path = typeof value === 'string' ? value : '';
  if (path.length > 1000 || path.includes('\\') || [...path].some(char => char.charCodeAt(0) < 32) || path.split('/').some(part => part === '..' || part === '.')) throw new ApiError(400, 'Choose a valid repository path.');
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}
