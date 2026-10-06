import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { workspaceRequest, WorkspaceApiError } from '../lib/workspace-api';

export function useSessionMonitor(userId: string) {
  const location = useLocation();
  const route = `${location.pathname}${location.search}${location.hash}`.slice(0, 300);

  useEffect(() => {
    let active = true; let checking = false;
    const check = async (eventType: 'heartbeat' | 'page_view' = 'heartbeat') => {
      if (!active || checking || document.visibilityState !== 'visible') return;
      checking = true;
      try { await workspaceRequest('sessions', { action: 'heartbeat', event_type: eventType, route, visibility: document.visibilityState }); }
      catch (cause) {
        if (active && cause instanceof WorkspaceApiError && cause.status === 401) await supabase?.auth.signOut({ scope: 'local' });
      } finally { checking = false; }
    };
    void check('page_view');
    const interval = window.setInterval(() => void check(), 60_000);
    const onFocus = () => { void check(); };
    window.addEventListener('focus', onFocus);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [userId, route]);
}
