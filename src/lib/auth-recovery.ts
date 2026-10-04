// Capture the callback intent before the SDK removes its credentials from the URL.
// The intent controls routing only; Supabase must verify the session first.
export function readAuthCallback(href: string) {
  const url = new URL(href);
  const params = new URLSearchParams();
  new URLSearchParams(url.hash.slice(1)).forEach((value, key) => params.set(key, value));
  // Match Supabase's parser: query parameters override fragment parameters.
  url.searchParams.forEach((value, key) => params.set(key, value));
  return {
    recovery: params.get('type') === 'recovery',
    hasCallback: ['access_token', 'refresh_token', 'code', 'error', 'error_code', 'error_description'].some(key => params.has(key)),
    hasCredentials: Boolean(params.get('access_token') && params.get('refresh_token') && params.get('expires_in') && params.get('token_type')),
    hasCode: Boolean(params.get('code')),
    hasError: ['error', 'error_code', 'error_description'].some(key => params.has(key)),
  };
}

export function recoveryFailureMessage(cause?: { status?: number } | null) {
  return cause?.status && cause.status >= 500
    ? 'We could not verify your password-reset link. Please try opening the email link again, or request a new one.'
    : 'This password-reset link is invalid, has expired, or has already been used. Request a new link and open the latest email.';
}
