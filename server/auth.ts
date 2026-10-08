import type { ServerResponse } from 'node:http';
import publicConfig from '../supabase.public.json' with { type: 'json' };
import { ApiError } from './integration-security.js';
import { errorResponse, jsonResponse, type Request } from './workspace-http.js';

const methods: Record<string, string[]> = {
  '/token': ['POST'], '/user': ['GET', 'PUT'], '/recover': ['POST'],
  '/logout': ['POST'], '/verify': ['POST'], '/resend': ['POST'], '/settings': ['GET'],
};

async function authBody(request: Request) {
  if (Number(request.headers['content-length']) > 16_384) throw new ApiError(413, 'The authentication request is too large.');
  let body = request.body;
  if (body === undefined) {
    let text = '';
    for await (const chunk of request) {
      text += chunk.toString();
      if (Buffer.byteLength(text) > 16_384) throw new ApiError(413, 'The authentication request is too large.');
    }
    body = text;
  }
  if (body === undefined || body === '') return undefined;
  if (!request.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'Send authentication details as JSON.');
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  if (Buffer.byteLength(serialized) > 16_384) throw new ApiError(413, 'The authentication request is too large.');
  try {
    const value = JSON.parse(serialized);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
  } catch { throw new ApiError(400, 'Invalid authentication request.'); }
  return serialized;
}

export function createAuthHandler(env: NodeJS.ProcessEnv = process.env) {
  return async (request: Request, response: ServerResponse) => {
    try {
      const params = new URL(request.url || '/', 'http://localhost').searchParams;
      const path = params.get('path') || '';
      const allowed = methods[path];
      if (!allowed) throw new ApiError(404, 'Unknown authentication operation.');
      if (!allowed.includes(request.method || '')) {
        response.setHeader('Allow', allowed.join(', '));
        throw new ApiError(405, 'Use the supported authentication method.');
      }
      // The destination and API key are fixed server configuration. Never proxy
      // admin endpoints or forward the Supabase service-role/secret key.
      const project = new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL || publicConfig.url);
      const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || publicConfig.publishableKey;
      if (key.startsWith('sb_secret_')) throw new ApiError(503, 'Configure a public authentication API key.');
      try {
        if (JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString()).role === 'service_role') throw new ApiError(503, 'Configure a public authentication API key.');
      } catch (cause) { if (cause instanceof ApiError) throw cause; }
      params.delete('path');
      const upstreamUrl = new URL(`/auth/v1${path}`, project);
      upstreamUrl.search = params.toString();
      const headers = new Headers({ apikey: key });
      for (const name of ['authorization', 'x-client-info', 'x-supabase-api-version']) {
        const value = request.headers[name];
        if (typeof value === 'string') headers.set(name, value);
      }
      const body = request.method === 'GET' ? undefined : await authBody(request);
      if (body) headers.set('Content-Type', 'application/json');
      let upstream: Response;
      try {
        upstream = await fetch(upstreamUrl, { method: request.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(20_000) });
      } catch { throw new ApiError(503, 'The authentication service could not be reached. Please retry shortly.'); }
      const result = await upstream.text();
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      if (upstream.status === 204) { response.statusCode = 204; response.end(); return; }
      try { jsonResponse(response, JSON.parse(result), upstream.status); }
      catch { throw new ApiError(502, 'The authentication service returned an invalid response.'); }
    } catch (cause) { errorResponse(response, cause); }
  };
}
