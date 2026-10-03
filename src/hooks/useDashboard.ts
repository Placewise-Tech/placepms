import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { loadDashboard } from '../lib/dashboard-api';
import { emptyDashboard } from '../lib/dashboard-data';
import { configurationError, supabase } from '../lib/supabase';

export function useDashboard(user: User) {
  const [data, setData] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const request = useRef(0);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    if (!supabase) { setError(configurationError); setLoading(false); return; }
    const current = ++request.current;
    setRefreshing(true);
    try {
      const next = await loadDashboard(supabase, user);
      if (!mounted.current || current !== request.current) return;
      setData(next);
      setUpdatedAt(new Date());
      setError('');
    } catch (cause) {
      if (!mounted.current || current !== request.current) return;
      setError(cause instanceof Error ? cause.message : 'Unable to load your workspace. Please try again.');
    } finally {
      if (mounted.current && current === request.current) { setLoading(false); setRefreshing(false); }
    }
  }, [user]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const handleFocus = () => { void refresh(); };
    window.addEventListener('focus', handleFocus);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 60_000);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(interval);
    };
  }, [refresh]);

  return { data, loading, refreshing, error, updatedAt, refresh };
}
