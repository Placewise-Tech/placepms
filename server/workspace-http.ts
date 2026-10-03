import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import publicConfig from '../supabase.public.json' with { type: 'json' };
import { ApiError } from './integration-security.js';

export type Request = IncomingMessage & { body?: unknown };
export function serverClients(env: NodeJS.ProcessEnv, token?: string) {
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new ApiError(503, 'The workspace server is not configured.');
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || publicConfig.url;
  const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || publicConfig.publishableKey;
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }) } };
  return {
    admin: createClient(url, secret, options),
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
  const clients = serverClients(env, token);
  const { data, error } = await clients.admin.auth.getUser(token);
  if (error && ![400, 401, 403].includes(error.status || 0)) throw new ApiError(503, 'Authentication is temporarily unavailable. Please retry shortly.');
  if (error || !data.user) throw new ApiError(401, 'Your session has ended. Please sign in again.');
  if (data.user.app_metadata.must_change_password === true) throw new ApiError(403, 'Set your own password before connecting your tools.');
  let sessionId = '';
  try { sessionId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).session_id; } catch { /* Verified token still needs a session ID. */ }
  if (!/^[a-f0-9-]{36}$/i.test(sessionId)) throw new ApiError(401, 'Please sign in again to start a valid session.');
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
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(value));
}

export function errorResponse(response: ServerResponse, cause: unknown) {
  jsonResponse(response, { error: cause instanceof ApiError ? cause.message : 'The request could not be completed. Please try again.' }, cause instanceof ApiError ? cause.status : 502);
}
