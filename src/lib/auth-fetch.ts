// Keep the normal Supabase connection, but route Auth through our own origin
// when an ISP/DNS resolver or browser extension blocks the project hostname.
export function createAuthFetch(projectUrl: string, fetcher: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  const project = new URL(projectUrl);
  return async (input, init) => {
    const request = input instanceof Request ? input.clone() : null;
    const url = new URL(request?.url || String(input));
    if (url.origin !== project.origin || !url.pathname.startsWith('/auth/v1/')) return fetcher(input, init);
    const callerSignal = init?.signal || request?.signal;
    const primaryTimeout = AbortSignal.timeout(8_000);
    try {
      return await fetcher(input, { ...init, signal: callerSignal ? AbortSignal.any([callerSignal, primaryTimeout]) : primaryTimeout });
    } catch (cause) {
      if (callerSignal?.aborted || (!(cause instanceof TypeError) && !primaryTimeout.aborted)) throw cause;
      const params = new URLSearchParams(url.search);
      params.set('path', url.pathname.slice('/auth/v1'.length));
      const timeout = AbortSignal.timeout(25_000);
      try {
        return await fetcher(`/api/auth?${params}`, {
          ...(request ? { method: request.method, headers: request.headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text() } : {}),
          ...init,
          signal: callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout,
        });
      } catch (fallbackError) {
        if (callerSignal?.aborted) throw fallbackError;
        if (!(fallbackError instanceof TypeError) && !timeout.aborted) throw fallbackError;
        return Response.json({ message: 'Unable to reach the authentication service. Check your connection and try again.' }, { status: 503 });
      }
    }
  };
}
