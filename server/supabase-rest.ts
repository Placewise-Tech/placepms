import type { ServerResponse } from 'node:http';
import publicConfig from '../supabase.public.json' with { type: 'json' };
import { ApiError } from './integration-security.js';
import { errorResponse, type Request } from './workspace-http.js';

const forwardedHeaders = ['accept', 'accept-profile', 'content-profile', 'content-type', 'if-match', 'if-none-match', 'prefer', 'range', 'x-client-info'];

async function body(request: Request) {
  if (['GET', 'HEAD'].includes(request.method || 'GET')) return undefined;
  let value = '';
  for await (const chunk of request) {
    value += chunk.toString();
    if (Buffer.byteLength(value) > 2_000_000) throw new ApiError(413, 'The Supabase request is too large.');
  }
  return value || undefined;
}

export function createSupabaseRestProxy(env: NodeJS.ProcessEnv = process.env) {
  return async (request: Request, response: ServerResponse) => {
    try {
      if (!['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method || '')) throw new ApiError(405, 'Use a supported Supabase REST method.');
      const incoming = new URL(request.url || '/', 'http://localhost');
      const path = incoming.searchParams.get('path');
      if (!path || !/^\/rest\/v1(?:\/|$)/.test(path) || path.includes('..')) throw new ApiError(400, 'Only Supabase REST paths are available through this proxy.');
      const target = new URL(path, env.SUPABASE_URL || env.VITE_SUPABASE_URL || publicConfig.url);
      const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || publicConfig.publishableKey;
      const headers = new Headers({ apikey: publicKey });
      for (const name of forwardedHeaders) { const value = request.headers[name]; if (typeof value === 'string') headers.set(name, value); }
      if (request.headers.authorization) headers.set('authorization', request.headers.authorization);
      const upstream = await fetch(target, { method: request.method, headers, body: await body(request), redirect: 'error', signal: AbortSignal.timeout(20_000) });
      response.statusCode = upstream.status;
      for (const name of ['content-type', 'content-range', 'access-control-expose-headers', 'etag', 'location']) { const value = upstream.headers.get(name); if (value) response.setHeader(name, value); }
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (cause) { errorResponse(response, cause); }
  };
}
