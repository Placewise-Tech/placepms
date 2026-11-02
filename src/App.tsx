import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Preloader, { AnimatePresence } from './components/Preloader';
import PasswordRecovery from './components/PasswordRecovery';
import RecoveryHelp from './components/RecoveryHelp';
import { useAuth } from './hooks/useAuth';
import { managedPath, workspaceRole, workspaceRootForRole, WorkspaceRootContext, type WorkspaceRole } from './lib/workspace-roles';
import { workspaceRequest } from './lib/workspace-api';
import { supabase } from './lib/supabase';

const HomePage = lazy(() => import('./components/HomePage'));
const Dashboard = lazy(() => import('./components/dashboard/Dashboard'));
const AdminDashboard = lazy(() => import('./components/dashboard/AdminDashboard'));
const AuthInterface = lazy(() => import('./components/AuthInterface'));

type AuthMode = 'signin' | 'signup';

function WorkspaceLoading() {
  return <div className="workspace-gate" role="status"><img src="/placewise-logo.png" alt="placewise" width="140" /><p>Opening your workspace…</p></div>;
}
function WorkspaceAccessError({ message }: { message: string }) {
  return <div className="workspace-gate"><img src="/placewise-logo.png" alt="placewise" width="140" /><div className="workspace-gate-card"><span className="dash-eyebrow">WORKSPACE ACCESS</span><h1>We couldn’t open this workspace</h1><p>{message}</p>{/workspace management migration/i.test(message) && <p>Apply <code>supabase/migrations/202610050001_workspace_management.sql</code> in the production Supabase SQL editor, then apply the administrator monitoring migrations if needed.</p>}<button className="dash-button dash-button-primary" onClick={() => window.location.reload()}>Retry connection</button></div></div>;
}

function MfaChallenge({ factorId, onComplete }: { factorId: string; onComplete: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="workspace-gate auth-recovery"><form className="workspace-gate-card dash-form" onSubmit={async event => {
    event.preventDefault();
    if (!supabase || !/^\d{6}$/.test(code)) { setError('Enter the six-digit code from your authenticator app.'); return; }
    setBusy(true); setError('');
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (result.error) throw result.error;
      onComplete();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The authenticator code could not be verified.'); }
    finally { setBusy(false); }
  }}><img src="/placewise-logo.png" alt="placewise" width="120" /><h1>Verify your identity</h1><p>Enter the current code from your authenticator app to open this workspace.</p>{error && <div role="alert" className="auth-feedback auth-feedback-error">{error}</div>}<label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} /></label><button className="dash-button dash-button-primary" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify and continue'}</button></form></div>;
}

export default function App() {
  const { session, loading: authLoading, error: sessionError, passwordRecovery, recoveryError, finishPasswordRecovery } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const isAuthOpen = location.pathname === '/login' || location.pathname === '/signup' || /^\/(admin|teacher|staff)\/login$/.test(location.pathname);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const accessRole = location.pathname.match(/^\/(admin|teacher|staff)\/login$/)?.[1] as 'admin' | 'teacher' | 'staff' | undefined;
  const mustChangePassword = session?.user.app_metadata.must_change_password === true;
  const [mfaState, setMfaState] = useState<'checking' | 'ready' | 'required' | 'error'>('checking');
  const [mfaFactorId, setMfaFactorId] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaCheckedToken, setMfaCheckedToken] = useState('');
  const [authoritativeAccess, setAuthoritativeAccess] = useState<{ token: string; role: WorkspaceRole } | null>(null);
  const mfaChecked = Boolean(!session || mfaCheckedToken === session.access_token);
  const mfaReady = Boolean(!session || (mfaState === 'ready' && mfaChecked));
  const accessLoading = Boolean(session && (!mfaReady || authoritativeAccess?.token !== session.access_token));
  const [accessError, setAccessError] = useState<{ token: string; message: string } | null>(null);
  const effectiveRole = session && authoritativeAccess?.token === session.access_token ? authoritativeAccess.role : session ? workspaceRole(session.user) : 'student';
  const workspaceUser = useMemo(() => session ? { ...session.user, app_metadata: { ...session.user.app_metadata, workspace_role: effectiveRole } } : null, [session, effectiveRole]);
  const root = session ? workspaceRootForRole(effectiveRole) : '/dashboard';
  const accessUserId = session?.user.id;
  const accessToken = session?.access_token;
  const accessFallbackRole = session ? workspaceRole(session.user) : 'student';
  useEffect(() => {
    if (passwordRecovery || recoveryError || location.pathname === '/reset-password') document.title = 'Reset password | PlacePMS';
    else if (!session) document.title = `${isAuthOpen ? location.pathname === '/signup' ? 'Create account' : 'Sign in' : 'Your Connected Academic Project Workspace'} | PlacePMS`;
  }, [session, isAuthOpen, passwordRecovery, recoveryError, location.pathname]);

  useEffect(() => {
    let active = true;
    if (!session || mustChangePassword || passwordRecovery || !supabase) {
      queueMicrotask(() => { if (active) { setMfaState('ready'); setMfaFactorId(''); setMfaCheckedToken(''); } });
      return () => { active = false; };
    }
    void (async () => {
      if (active) setMfaError('');
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      const factor = factors.data.totp.find(item => item.status === 'verified');
      if (!factor) { if (active) { setMfaState('ready'); setMfaCheckedToken(session.access_token); } return; }
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) throw assurance.error;
      if (active) {
        setMfaFactorId(factor.id);
        setMfaState(assurance.data.currentLevel === 'aal2' ? 'ready' : 'required');
        setMfaCheckedToken(session.access_token);
      }
    })().catch(cause => {
      if (active) { setMfaError(cause instanceof Error ? cause.message : 'Multi-factor authentication could not be checked.'); setMfaState('error'); setMfaCheckedToken(session.access_token); }
    });
    return () => { active = false; };
  }, [session, mustChangePassword, passwordRecovery]);

  useEffect(() => {
    if (!accessUserId || !accessToken || mustChangePassword || passwordRecovery || !mfaReady) return;
    let active = true;
    void workspaceRequest<{ role: WorkspaceRole }>('management', { action: 'access' })
      .then(result => { if (active) setAuthoritativeAccess({ token: accessToken, role: ['student', 'admin', 'teacher', 'staff'].includes(result.role) ? result.role : accessFallbackRole }); })
      .catch(cause => { if (active) setAccessError({ token: accessToken, message: cause instanceof Error ? cause.message : 'Unable to verify workspace access. Please retry.' }); });
    return () => { active = false; };
  }, [accessUserId, accessToken, accessFallbackRole, mustChangePassword, passwordRecovery, mfaReady]);

  useEffect(() => {
    if (authLoading) return;
    if (recoveryError) {
      if (location.pathname !== '/reset-password' || location.search || location.hash) navigate('/reset-password', { replace: true });
      return;
    }
    if (passwordRecovery && session) {
      if (location.pathname !== '/reset-password' || location.search || location.hash) navigate('/reset-password', { replace: true });
      return;
    }
    if (session && !mfaReady) return;
    if (location.pathname === '/reset-password' && !mustChangePassword) return;
    if (session) {
      if (accessLoading && !mustChangePassword) return;
      if (mustChangePassword && location.pathname !== '/set-password') navigate('/set-password', { replace: true });
      else if (!mustChangePassword && !passwordRecovery) {
        const target = managedPath.test(location.pathname) && !isAuthOpen ? location.pathname.replace(managedPath, `${root}${location.pathname.match(managedPath)?.[0].endsWith('/') ? '/' : ''}`) : root;
        if (target !== location.pathname) navigate(`${target}${location.search}${location.hash}`, { replace: true });
      }
    } else if ((!isAuthOpen && managedPath.test(location.pathname)) || location.pathname === '/set-password') {
      navigate('/login', { replace: true });
    }
  }, [session, authLoading, passwordRecovery, recoveryError, mustChangePassword, mfaReady, accessLoading, root, isAuthOpen, location.pathname, location.search, location.hash, navigate]);

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    navigate(mode === 'signin' ? '/login' : '/signup');
  };

  if (authLoading) return <WorkspaceLoading />;
  if (recoveryError || (location.pathname === '/reset-password' && !passwordRecovery && !mustChangePassword)) return <RecoveryHelp message={recoveryError || 'Open the password-reset link from your email. If your reset session has ended, request a new link below.'} signedIn={Boolean(session)} onBack={() => { finishPasswordRecovery(); navigate(session ? root : '/login', { replace: true }); }} />;
  if ((passwordRecovery || mustChangePassword) && session) return <PasswordRecovery requiredSetup={mustChangePassword} email={session.user.email} onComplete={() => { finishPasswordRecovery(); navigate(root, { replace: true }); }} onSignOut={() => navigate('/login', { replace: true })} />;
  if (session && mfaState === 'error' && mfaChecked) return <WorkspaceAccessError message={mfaError || 'Multi-factor authentication could not be checked. Please retry.'} />;
  if (session && mfaState === 'required' && mfaChecked && mfaFactorId) return <MfaChallenge factorId={mfaFactorId} onComplete={() => { setMfaState('ready'); setMfaCheckedToken(session.access_token); }} />;
  if (session && !mfaReady) return <WorkspaceLoading />;
  const currentAccessError = accessToken && accessError?.token === accessToken ? accessError.message : '';
  if (session && currentAccessError && !mustChangePassword && !passwordRecovery) return <WorkspaceAccessError message={currentAccessError} />;
  if (session && accessLoading) return <WorkspaceLoading />;
  if (session && workspaceUser) return <WorkspaceRootContext.Provider value={root}><Suspense fallback={<WorkspaceLoading />}>{effectiveRole === 'admin' ? <AdminDashboard key={session.user.id} user={workspaceUser} /> : <Dashboard key={session.user.id} user={workspaceUser} />}</Suspense></WorkspaceRootContext.Provider>;

  return <div className="app-nebula min-h-full flex flex-col flex-1 relative font-sans">
    {sessionError && <div className="auth-feedback auth-feedback-error" role="alert">{sessionError}</div>}
    {isAuthOpen && <Suspense fallback={<WorkspaceLoading />}><AuthInterface
      isOpen={isAuthOpen}
      onClose={() => navigate('/')}
      initialMode={location.pathname === '/signup' ? 'signup' : location.pathname.endsWith('/login') ? 'signin' : authMode}
      accessRole={accessRole}
    /></Suspense>}
    <AnimatePresence mode="wait">
      {isLoading && <Preloader onComplete={() => setIsLoading(false)} />}
    </AnimatePresence>
    <Suspense fallback={null}><HomePage onOpenAuth={openAuth} /></Suspense>
  </div>;
}
