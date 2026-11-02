import { createClient, type Session } from '@supabase/supabase-js';
import { readAuthCallback } from './auth-recovery';
import { createAuthFetch } from './auth-fetch';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const initialAuthCallback = readAuthCallback(window.location.href);
const recoveryStorageKey = 'placepms:password-recovery-user';
if (url) {
  try {
    // Remove sessions written by older releases that allowed localStorage.
    localStorage.removeItem(`sb-${new URL(url).hostname.split('.')[0]}-auth-token`);
  } catch { /* Storage may be unavailable in privacy mode. */ }
}
let recoveryUserId = sessionStorage.getItem(recoveryStorageKey);

export function rememberPasswordRecovery(session: Session) {
  recoveryUserId = session.user.id;
  // Only store routing intent, bound to the authenticated account. No link tokens.
  sessionStorage.setItem(recoveryStorageKey, recoveryUserId);
}

export function clearPasswordRecovery() {
  recoveryUserId = null;
  sessionStorage.removeItem(recoveryStorageKey);
}

export function isPasswordRecoverySession(session: Session | null) {
  return Boolean(session && session.user.id === recoveryUserId);
}

export const supabase = url && key ? createClient(url, key, {
  global: { fetch: createAuthFetch(url) },
  auth: {
    // Browser storage is readable by every script running on the origin. Keep
    // access and refresh tokens in the tab session only; integrations are
    // encrypted server-side and never stored in browser storage.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: {
      getItem: name => sessionStorage.getItem(name),
      setItem: (name, value) => sessionStorage.setItem(name, value),
      removeItem: name => { sessionStorage.removeItem(name); localStorage.removeItem(name); },
    },
  },
}) : null;

// Register immediately: an email callback can finish before React mounts.
supabase?.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session) rememberPasswordRecovery(session);
  else if (event === 'SIGNED_OUT' || (session && recoveryUserId && session.user.id !== recoveryUserId)) clearPasswordRecovery();
});

export function setSessionPersistence(remember: boolean) {
  // Kept as a compatibility shim for the sign-in form. Tokens are never
  // persisted to localStorage, regardless of the checkbox value.
  sessionStorage.setItem('placepms:session-only', String(!remember));
}

export const configurationError = 'Add your Supabase project URL and publishable key to .env, then restart the development server.';
