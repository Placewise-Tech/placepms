import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

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
