import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let authEventReceived = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      authEventReceived = true;
      setSession(nextSession);
      setLoading(false);
      setError('');
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
    });

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || authEventReceived) return;
      setSession(data.session);
      setError(sessionError?.message ?? '');
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError('Unable to restore your session. Please sign in again.');
      setLoading(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  return { session, loading, error, passwordRecovery, finishPasswordRecovery: () => setPasswordRecovery(false) };
}
