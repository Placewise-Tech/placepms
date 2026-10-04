import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { clearPasswordRecovery, initialAuthCallback, isPasswordRecoverySession, rememberPasswordRecovery, supabase } from '../lib/supabase';
import { recoveryFailureMessage } from '../lib/auth-recovery';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    let restoring = true;
    let eventCount = 0;
    let latestSession: Session | null = null;
    const applySession = (nextSession: Session | null) => {
      setSession(nextSession);
      setPasswordRecovery(isPasswordRecoverySession(nextSession));
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      eventCount++;
      latestSession = nextSession;
      applySession(nextSession);
      if (!restoring) setLoading(false);
      setError('');
      if (event === 'SIGNED_OUT') setRecoveryError('');
    });

    void (async () => {
      try {
        // Wait for callback validation as well as stored-session restoration.
        // getSession alone can hide an initialization error behind an older session.
        const initialized = await client.auth.initialize();
        const beforeQuery = eventCount;
        const { data, error: sessionError } = await client.auth.getSession();
        if (!active) return;
        const current = eventCount === beforeQuery ? data.session : latestSession;
        const callbackError = initialized.error || sessionError;
        // A code alone is not proof of verification: the SDK may ignore it and
        // restore an older session when no matching PKCE verifier is available.
        const verifiedCodeRecovery = initialAuthCallback.hasCode && isPasswordRecoverySession(current);
        const failedRecovery = initialAuthCallback.hasError || (initialAuthCallback.hasCallback && callbackError) ||
          (initialAuthCallback.recovery && (!current || (!initialAuthCallback.hasCredentials && !verifiedCodeRecovery)));
        if (failedRecovery) {
          clearPasswordRecovery();
          setRecoveryError(recoveryFailureMessage(initialAuthCallback.hasError ? null : callbackError));
        } else if (initialAuthCallback.recovery && initialAuthCallback.hasCredentials && current) {
          rememberPasswordRecovery(current);
        }
        applySession(current);
        setError(failedRecovery ? '' : sessionError?.message ?? '');
      } catch {
        if (!active) return;
        if (initialAuthCallback.hasCallback || initialAuthCallback.recovery) setRecoveryError(recoveryFailureMessage());
        else setError('Unable to restore your session. Please sign in again.');
      } finally {
        restoring = false;
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  return { session, loading, error, passwordRecovery, recoveryError, finishPasswordRecovery: () => {
    clearPasswordRecovery(); setPasswordRecovery(false); setRecoveryError('');
  } };
}
