import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { workspaceRequest, WorkspaceApiError } from '../lib/workspace-api';

export function useSessionMonitor(userId: string) {
  useEffect(() => {
    let active = true; let checking = false;
    const check = async () => {
      if (!active || checking || document.visibilityState !== 'visible') return;
      checking = true;
      try { await workspaceRequest('sessions', { action: 'heartbeat' }); }
      catch (cause) {
        if (active && cause instanceof WorkspaceApiError && cause.status === 401) await supabase?.auth.signOut({ scope: 'local' });
      } finally { checking = false; }
    };
    void check();
    const interval = window.setInterval(() => void check(), 60_000);
    window.addEventListener('focus', check);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', check); };
  }, [userId]);
}
