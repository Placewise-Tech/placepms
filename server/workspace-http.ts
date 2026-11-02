import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import publicConfig from '../supabase.public.json' with { type: 'json' };
import { ApiError } from './integration-security.js';

export type Request = IncomingMessage & { body?: unknown };
const adminClientCache = new Map<string, { secret: string; client: SupabaseClient }>();
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function header(request: Request, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function clientAddress(request: Request, env: NodeJS.ProcessEnv) {
  if (env.VERCEL === '1') return header(request, 'x-forwarded-for')?.split(',')[0].trim() || 'vercel-unknown';
  return request.socket.remoteAddress || 'local';
}

function sameOrigin(request: Request, env: NodeJS.ProcessEnv) {
  const origin = header(request, 'origin');
  if (!origin) return;
  if (origin === 'null') throw new ApiError(403, 'This request origin is not allowed.');
  let expected = '';
  try { expected = new URL(env.APP_URL || '').origin; } catch { /* Fall back to the request host below. */ }
  const forwardedHost = header(request, 'x-forwarded-host') || header(request, 'host');
  const forwardedProto = header(request, 'x-forwarded-proto') || (env.APP_URL?.startsWith('https://') ? 'https' : 'http');
  const requestOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost.split(',')[0].trim()}` : '';
  if (origin !== expected && origin !== requestOrigin) throw new ApiError(403, 'Cross-site requests are not allowed.');
}

/** Same-origin enforcement plus a bounded per-IP request bucket for every API. */
export function protectRequest(request: Request, env: NodeJS.ProcessEnv, scope: string, limit = 120) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method || '')) sameOrigin(request, env);
  const now = Date.now();
  const key = `${scope}:${clientAddress(request, env)}`;
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
  else {
    current.count += 1;
    if (current.count > limit) {
      throw new ApiError(429, 'Too many requests. Please wait and try again.');
    }
  }
  // Prevent an abandoned IP map from growing forever in a long-lived process.
  if (rateBuckets.size > 10_000 && Math.random() < 0.02) {
    for (const [bucketKey, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
  }
}

export function securityHeaders(response: ServerResponse) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://api.openalex.org; worker-src 'self' blob:");
}

function serverFetch(input: Parameters<typeof fetch>[0], init?: RequestInit) {
  const timeout = AbortSignal.timeout(20_000);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

export function serverClients(env: NodeJS.ProcessEnv, token?: string) {
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new ApiError(503, 'The workspace server is not configured.');
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || publicConfig.url;
  const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || publicConfig.publishableKey;
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: serverFetch } };
  let cached = adminClientCache.get(url);
  if (!cached || cached.secret !== secret) {
    cached = { secret, client: createClient(url, secret, options) };
    adminClientCache.set(url, cached);
    // A key rotation should not retain an unbounded collection of clients if
    // a process serves several environments over its lifetime.
    while (adminClientCache.size > 4) adminClientCache.delete(adminClientCache.keys().next().value!);
  }
  return {
    admin: cached.client,
    client: createClient(url, publicKey, { ...options, global: { ...options.global, headers: token ? { Authorization: `Bearer ${token}` } : {} } }),
  };
}

export function databaseError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code || '')) throw new ApiError(503, 'Apply the workspace integrations migration in Supabase to enable this feature.');
  throw new ApiError(503, 'The workspace database could not complete this request. Please try again.');
}

export async function authenticate(request: Request, env: NodeJS.ProcessEnv) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'Sign in to use your workspace.');
  const token = header.slice(7);
  if (token.length > 8192 || token.split('.').length !== 3) throw new ApiError(401, 'Your session is invalid. Please sign in again.');
  let sessionId = '';
  try { sessionId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).session_id; } catch { /* The provider will reject a malformed token. */ }
  if (!/^[a-f0-9-]{36}$/i.test(sessionId)) throw new ApiError(401, 'Please sign in again to start a valid session.');
  const clients = serverClients(env, token);
  const { data, error } = await clients.admin.auth.getUser(token);
  if (error && ![400, 401, 403].includes(error.status || 0)) throw new ApiError(503, 'Authentication is temporarily unavailable. Please retry shortly.');
  if (error || !data.user) throw new ApiError(401, 'Your session has ended. Please sign in again.');
  if (data.user.app_metadata.must_change_password === true) throw new ApiError(403, 'Set your own password before connecting your tools.');
  const verifiedFactor = data.user.factors?.some(factor => factor.status === 'verified');
  if (verifiedFactor) {
    const assurance = await clients.client.auth.mfa.getAuthenticatorAssuranceLevel(token);
    if (assurance.error) throw new ApiError(503, 'Multi-factor authentication could not be verified. Please retry.');
    if (assurance.data.currentLevel !== 'aal2') throw new ApiError(401, 'Complete multi-factor authentication before accessing your workspace.');
  }
  const active = await clients.admin.rpc('workspace_session_active', { p_user_id: data.user.id, p_session_id: sessionId });
  databaseError(active.error);
  if (active.data !== true) throw new ApiError(401, 'This session has been revoked. Please sign in again.');
  return { ...clients, user: data.user, token, sessionId };
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (request.method !== 'POST') throw new ApiError(405, 'Use POST for workspace requests.');
  if (!request.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'Use a JSON request.');
  let value = request.body;
  if (value === undefined) {
    let text = '';
    for await (const chunk of request) { text += chunk.toString(); if (Buffer.byteLength(text) > 32_768) throw new ApiError(413, 'The request is too large.'); }
    value = text;
  }
  if (Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value)) > 32_768) throw new ApiError(413, 'The request is too large.');
  try { if (typeof value === 'string') value = JSON.parse(value); } catch { throw new ApiError(400, 'Invalid JSON request.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Provide a JSON object.');
  return value as Record<string, unknown>;
}

export function jsonResponse(response: ServerResponse, value: unknown, status = 200) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  securityHeaders(response);
  response.end(JSON.stringify(value));
}

export function errorResponse(response: ServerResponse, cause: unknown) {
  jsonResponse(response, { error: cause instanceof ApiError ? cause.message : 'The request could not be completed. Please try again.' }, cause instanceof ApiError ? cause.status : 502);
}
