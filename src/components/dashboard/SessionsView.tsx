import { useCallback, useEffect, useState } from 'react';
import { LogOut, Monitor, RefreshCw, ShieldCheck } from 'lucide-react';
import type { LoginSession } from '../../lib/integration-types';
import { errorMessage, workspaceRequest } from '../../lib/workspace-api';
import { supabase } from '../../lib/supabase';

function deviceName(agent: string | null) {
  if (!agent) return 'Unidentified device';
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Browser';
  const os = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Windows/.test(agent) ? 'Windows' : /Mac OS/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : 'device';
  return `${browser} on ${os}`;
}

export default function SessionsView() {
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setSessions((await workspaceRequest<{ sessions: LoginSession[] }>('sessions', { action: 'list' })).sessions); }
    catch (cause) { setError(errorMessage(cause)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const revoke = async (session?: LoginSession) => {
    setBusy(session?.id || 'others'); setError(''); setNotice('');
    try {
      const result = await workspaceRequest<{ currentRevoked: boolean; revoked: number }>('sessions', { action: 'revoke', sessionId: session?.id, others: !session });
      if (result.currentRevoked) { await supabase?.auth.signOut({ scope: 'local' }); return; }
      setNotice(`${result.revoked} session${result.revoked === 1 ? '' : 's'} signed out.`); await load();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(''); }
  };
  return <section className="dash-panel"><div className="dash-panel-heading"><div><h2>Login & session security</h2><p>Live Supabase sessions. Revoked devices lose workspace access and must sign in again.</p></div><button className="dash-button" onClick={() => void load()} disabled={loading || !!busy}><RefreshCw size={15} />Refresh</button></div>
    <div className="workspace-content">
      {error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}{notice && <div className="dash-alert" role="status">{notice}</div>}
      <div className="workspace-callout"><ShieldCheck size={22} /><div><strong>You control your active sessions</strong><p>Activity is refreshed while PlacePMS is open. IP addresses are reported by Supabase; device names are inferred from the browser agent.</p></div><button className="dash-button" disabled={!!busy || !sessions.some(item => !item.current_session)} onClick={() => void revoke()}>Sign out other devices</button></div>
      {loading ? <p role="status">Loading active sessions…</p> : !sessions.length && !error ? <p>No active sessions found. Sign in again to refresh your session.</p> : <div className="workspace-list">{sessions.map(session => <article className="workspace-list-item" key={session.id}><Monitor size={24} /><div><h3>{deviceName(session.user_agent)} {session.current_session && <span className="dash-status is-complete">This device</span>}</h3><p>IP: {session.ip || 'Unavailable'}</p><p>Signed in {new Date(session.created_at).toLocaleString()} · Last active {new Date(session.last_active_at).toLocaleString()}</p></div><button className="dash-button" disabled={!!busy} onClick={() => void revoke(session)}><LogOut size={14} />{busy === session.id ? 'Signing out…' : 'Sign out device'}</button></article>)}</div>}
    </div></section>;
}
