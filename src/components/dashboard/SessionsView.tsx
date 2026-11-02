import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, Monitor, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import type { LoginSession } from '../../lib/integration-types';
import { errorMessage, workspaceRequest } from '../../lib/workspace-api';
import { supabase } from '../../lib/supabase';
import { DetailDialog, RecordPager, WorkspaceSections } from './WorkspaceUI';

type TotpFactor = { id: string; friendly_name?: string; factor_type: string; status: string; created_at: string };
type Enrollment = { id: string; qr: string; secret: string };

function deviceName(agent: string | null) {
  if (!agent) return 'Unidentified device';
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Browser';
  const os = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Windows/.test(agent) ? 'Windows' : /Mac OS/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : 'device';
  return `${browser} on ${os}`;
}
export default function SessionsView() {
  const [sessions, setSessions] = useState<LoginSession[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [tab, setTab] = useState('all'); const [page, setPage] = useState(1); const [detail, setDetail] = useState<LoginSession | null>(null);
  const [factors, setFactors] = useState<TotpFactor[]>([]); const [enrollment, setEnrollment] = useState<Enrollment | null>(null); const [mfaCode, setMfaCode] = useState(''); const [mfaBusy, setMfaBusy] = useState(false);
  const mounted = useRef(true); const requestId = useRef(0);
  const load = useCallback(async () => {
    const request = ++requestId.current; setRefreshing(true); setError('');
    try { const result = await workspaceRequest<{ sessions: LoginSession[] }>('sessions', { action: 'list' }); if (mounted.current && request === requestId.current) setSessions(result.sessions); }
    catch (cause) { if (mounted.current && request === requestId.current) setError(errorMessage(cause)); }
    finally { if (mounted.current && request === requestId.current) { setLoading(false); setRefreshing(false); } }
  }, []);
  useEffect(() => { mounted.current = true; const timer = setTimeout(() => void load(), 0); const interval = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000); const onFocus = () => { void load(); }; window.addEventListener('focus', onFocus); return () => { mounted.current = false; clearTimeout(timer); clearInterval(interval); window.removeEventListener('focus', onFocus); }; }, [load]);
  const loadFactors = useCallback(async () => {
    if (!supabase) return;
    const result = await supabase.auth.mfa.listFactors();
    if (result.error) throw result.error;
    setFactors((result.data.totp || []) as TotpFactor[]);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void loadFactors().catch(() => undefined), 0); return () => window.clearTimeout(timer); }, [loadFactors]);
  const startMfa = async () => {
    if (!supabase) return;
    setMfaBusy(true); setError(''); setNotice('');
    try {
      const result = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PlacePMS authenticator' });
      if (result.error || !result.data?.totp) throw result.error || new Error('Unable to start authenticator setup.');
      setEnrollment({ id: result.data.id, qr: result.data.totp.qr_code, secret: result.data.totp.secret });
      setMfaCode('');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setMfaBusy(false); }
  };
  const verifyMfa = async () => {
    if (!supabase || !enrollment || !/^\d{6}$/.test(mfaCode)) { setError('Enter the six-digit code from your authenticator app.'); return; }
    setMfaBusy(true); setError('');
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.id, code: mfaCode });
      if (result.error) throw result.error;
      setEnrollment(null); setMfaCode(''); setNotice('Multi-factor authentication is enabled for this account.'); await loadFactors();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setMfaBusy(false); }
  };
  const removeMfa = async (factorId: string) => {
    if (!supabase || !window.confirm('Remove this authenticator factor? You can add it again later.')) return;
    setMfaBusy(true); setError('');
    try { const result = await supabase.auth.mfa.unenroll({ factorId }); if (result.error) throw result.error; setNotice('Authenticator factor removed.'); await loadFactors(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setMfaBusy(false); }
  };
  const revoke = async (session?: LoginSession) => {
    setBusy(session?.id || 'others'); setError(''); setNotice('');
    try { const result = await workspaceRequest<{ currentRevoked: boolean; revoked: number }>('sessions', { action: 'revoke', sessionId: session?.id, others: !session }); if (result.currentRevoked) { await supabase?.auth.signOut({ scope: 'local' }); return; } setDetail(null); setNotice(`${result.revoked} session${result.revoked === 1 ? '' : 's'} signed out.`); await load(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(''); }
  };
  const current = sessions.find(item => item.current_session); const others = sessions.filter(item => !item.current_session);
  const list = (items: LoginSession[]) => { const currentPage = Math.min(page, Math.max(1, Math.ceil(items.length / 6))); return <>{loading ? <div className="studio-empty" role="status">Loading active sessions…</div> : items.length ? <div className="studio-card-grid">{items.slice((currentPage - 1) * 6, currentPage * 6).map(session => { const Icon = /Android|iPhone|iPad/.test(session.user_agent || '') ? Smartphone : Monitor; return <article className="studio-card" key={session.id}><div className="studio-card-top"><span className="studio-card-icon"><Icon size={23} /></span><span className={`dash-status ${session.current_session ? 'is-complete' : 'is-inactive'}`}>{session.current_session ? 'This device' : 'Active session'}</span></div><h3>{deviceName(session.user_agent)}</h3><p>IP: {session.ip || 'Unavailable'}</p><small className="studio-card-meta">Last active {new Date(session.last_active_at).toLocaleString()}</small><div className="studio-card-actions"><button className="dash-button" aria-label={`View ${deviceName(session.user_agent)} session details`} onClick={() => setDetail(session)}>Session details</button><button className="dash-button" disabled={!!busy} onClick={() => void revoke(session)}><LogOut size={13} />{busy === session.id ? 'Signing out…' : 'Sign out device'}</button></div></article>; })}</div> : !error && <div className="studio-empty"><ShieldCheck size={29} /><h3>{tab === 'others' ? 'Just this device.' : 'No active sessions found'}</h3><p>{tab === 'others' ? 'You have no other active devices connected to PlacePMS.' : 'Sign in again to refresh your session.'}</p></div>}<RecordPager page={currentPage} total={items.length} size={6} onChange={setPage} noun="sessions" /></>; };
  return <section className="dash-panel"><div className="dash-panel-heading"><div><h2>Login & session security</h2><p>Your connected devices. Clear activity. Account control.</p></div><button className="dash-button" onClick={() => void load()} disabled={refreshing || !!busy}><RefreshCw size={15} className={refreshing ? 'dash-spinning' : ''} />Refresh</button></div><div className="workspace-content">{error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}{notice && <div className="dash-alert" role="status">{notice}</div>}
     <div className="studio-security-card"><div><span className="dash-eyebrow"><ShieldCheck size={13} /> ACCOUNT PROTECTION</span><h3>Multi-factor authentication</h3><p>Protect this workspace with a time-based code from an authenticator app. The setup secret stays in this tab and is never saved to browser storage.</p></div>{factors.filter(factor => factor.status === 'verified').length ? <div className="studio-mfa-factors">{factors.filter(factor => factor.status === 'verified').map(factor => <div className="studio-mfa-factor" key={factor.id}><span className="dash-status is-complete">Enabled</span><strong>{factor.friendly_name || 'Authenticator app'}</strong><small>Added {new Date(factor.created_at).toLocaleDateString()}</small><button className="dash-button" disabled={mfaBusy} onClick={() => void removeMfa(factor.id)}>Remove</button></div>)}</div> : enrollment ? <div className="studio-mfa-setup"><img src={enrollment.qr} alt="Scan this QR code with your authenticator app" /><div><strong>Scan, then verify</strong><p>Scan the QR code, or enter this setup key manually:</p><code>{enrollment.secret}</code><label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, ''))} /></label><button className="dash-button dash-button-primary" disabled={mfaBusy || mfaCode.length !== 6} onClick={() => void verifyMfa()}>{mfaBusy ? 'Verifying…' : 'Verify and enable'}</button></div></div> : <button className="dash-button dash-button-primary" disabled={mfaBusy} onClick={() => void startMfa()}>{mfaBusy ? 'Preparing…' : 'Set up authenticator app'}</button>}</div>
     <div className="studio-session-current"><span className="studio-card-icon"><ShieldCheck size={28} /></span><div><span className="dash-eyebrow">CURRENT WORKSPACE SESSION</span><h3>{current ? deviceName(current.user_agent) : loading ? 'Connecting your device…' : 'Current device unavailable'}</h3><p>{current ? `Signed in ${new Date(current.created_at).toLocaleString()}` : 'Session information is provided by Supabase.'}</p></div><div className="studio-session-summary"><span><strong>{loading ? '…' : error ? '—' : sessions.length}</strong>active sessions</span><span><strong>{loading ? '…' : error ? '—' : others.length}</strong>other devices</span><button className="dash-button" disabled={!!busy || !others.length} onClick={() => void revoke()}>Sign out other devices</button></div></div>
    <WorkspaceSections label="Session views" value={tab} onChange={value => { setTab(value); setPage(1); }} sections={[{ id: 'all', label: 'All active devices', count: sessions.length, content: list(sessions) }, { id: 'others', label: 'Other devices', count: others.length, content: list(others) }]} />
    <details className="studio-section-note"><summary>How device activity is recorded</summary><p>These are live Supabase sessions. Revoked devices lose workspace access and must sign in again. IP addresses are provided by Supabase; device names are inferred from the browser agent. Activity refreshes while PlacePMS is open.</p></details>
  </div>{detail && <DetailDialog title={deviceName(detail.user_agent)} subtitle="Session activity and device information." busy={!!busy} onClose={() => setDetail(null)}><dl className="studio-facts">{[['Session', detail.current_session ? 'This device' : 'Other active device'], ['IP address', detail.ip || 'Unavailable'], ['Signed in', new Date(detail.created_at).toLocaleString()], ['Last active', new Date(detail.last_active_at).toLocaleString()], ['Session identifier', detail.id], ['Browser agent', detail.user_agent || 'Unavailable']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="dash-dialog-actions"><button className="dash-button" disabled={!!busy} onClick={() => setDetail(null)}>Close details</button><button className="dash-button" disabled={!!busy} onClick={() => void revoke(detail)}><LogOut size={14} />Sign out device</button></div></DetailDialog>}</section>;
}
