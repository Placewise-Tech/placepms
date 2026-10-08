// Read workspace data through our origin so a blocked Supabase hostname does
// not delay the dashboard. Auth and writes retain their normal primary path.
export function createAuthFetch(projectUrl: string, fetcher: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  const project = new URL(projectUrl);
  return async (input, init) => {
    const request = input instanceof Request ? input.clone() : null;
    const url = new URL(request?.url || String(input));
    if (url.origin !== project.origin || (!url.pathname.startsWith('/auth/v1/') && !url.pathname.startsWith('/rest/v1/'))) return fetcher(input, init);
    const callerSignal = init?.signal || request?.signal;
    const method = (init?.method || request?.method || 'GET').toUpperCase();
    const rest = url.pathname.startsWith('/rest/v1/');
    const proxyInit = { ...(request ? {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
    } : {}), ...init };

    // A healthy direct connection remains fastest and keeps local provider
    // fixtures working. A short network timeout switches blocked REST reads to
    // the same-origin proxy instead of making the dashboard wait eight seconds.
    const primaryTimeout = AbortSignal.timeout(rest && ['GET', 'HEAD'].includes(method) ? 1_500 : 8_000);
    try {
      return await fetcher(input, { ...init, signal: callerSignal ? AbortSignal.any([callerSignal, primaryTimeout]) : primaryTimeout });
    } catch (cause) {
      if (callerSignal?.aborted || (!(cause instanceof TypeError) && !primaryTimeout.aborted)) throw cause;
      const auth = url.pathname.startsWith('/auth/v1/');
      const params = new URLSearchParams(auth ? url.search : '');
      params.set('path', auth ? url.pathname.slice('/auth/v1'.length) : `${url.pathname}${url.search}`);
      const timeout = AbortSignal.timeout(25_000);
      try {
        return await fetcher(`${auth ? '/api/auth' : '/api/supabase'}?${params}`, {
          ...proxyInit,
          signal: callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout,
        });
      } catch (fallbackError) {
        if (callerSignal?.aborted) throw fallbackError;
        if (!(fallbackError instanceof TypeError) && !timeout.aborted) throw fallbackError;
        return Response.json({ message: `Unable to reach the ${auth ? 'authentication service' : 'workspace database'}. Check your connection and try again.` }, { status: 503 });
      }
    }
  };
}
