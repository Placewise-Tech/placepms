import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Preloader, { AnimatePresence } from './components/Preloader';
import HomePage from './components/HomePage';
import PasswordRecovery from './components/PasswordRecovery';
import RecoveryHelp from './components/RecoveryHelp';
import { useAuth } from './hooks/useAuth';
import { managedPath, workspaceRole, workspaceRootForRole, WorkspaceRootContext, type WorkspaceRole } from './lib/workspace-roles';
import { workspaceRequest } from './lib/workspace-api';

const Dashboard = lazy(() => import('./components/dashboard/Dashboard'));
const AdminDashboard = lazy(() => import('./components/dashboard/AdminDashboard'));
const AuthInterface = lazy(() => import('./components/AuthInterface'));

type AuthMode = 'signin' | 'signup';

function WorkspaceLoading() {
  return <div className="workspace-gate" role="status"><img src="/PlacePMS-Logo-White.svg" alt="PlacePMS" width="140" /><p>Opening your workspace…</p></div>;
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
  const [authoritativeAccess, setAuthoritativeAccess] = useState<{ token: string; role: WorkspaceRole } | null>(null);
  const accessLoading = Boolean(session && authoritativeAccess?.token !== session.access_token);
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
    if (!accessUserId || !accessToken || mustChangePassword || passwordRecovery) return;
    let active = true;
    void workspaceRequest<{ role: WorkspaceRole }>('management', { action: 'access' })
      .then(result => { if (active) setAuthoritativeAccess({ token: accessToken, role: ['student', 'admin', 'teacher', 'staff'].includes(result.role) ? result.role : accessFallbackRole }); })
      .catch(() => { if (active) setAuthoritativeAccess({ token: accessToken, role: accessFallbackRole }); });
    return () => { active = false; };
  }, [accessUserId, accessToken, accessFallbackRole, mustChangePassword, passwordRecovery]);

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
  }, [session, authLoading, passwordRecovery, recoveryError, mustChangePassword, accessLoading, root, isAuthOpen, location.pathname, location.search, location.hash, navigate]);

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    navigate(mode === 'signin' ? '/login' : '/signup');
  };

  if (authLoading) return <WorkspaceLoading />;
  if (recoveryError || (location.pathname === '/reset-password' && !passwordRecovery && !mustChangePassword)) return <RecoveryHelp message={recoveryError || 'Open the password-reset link from your email. If your reset session has ended, request a new link below.'} signedIn={Boolean(session)} onBack={() => { finishPasswordRecovery(); navigate(session ? root : '/login', { replace: true }); }} />;
  if ((passwordRecovery || mustChangePassword) && session) return <PasswordRecovery requiredSetup={mustChangePassword} email={session.user.email} onComplete={() => { finishPasswordRecovery(); navigate(root, { replace: true }); }} onSignOut={() => navigate('/login', { replace: true })} />;
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
    <HomePage onOpenAuth={openAuth} />
  </div>;
}
