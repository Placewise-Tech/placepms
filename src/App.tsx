import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Preloader, { AnimatePresence } from './components/Preloader';
import HomePage from './components/HomePage';
import PasswordRecovery from './components/PasswordRecovery';
import RecoveryHelp from './components/RecoveryHelp';
import { useAuth } from './hooks/useAuth';

const Dashboard = lazy(() => import('./components/dashboard/Dashboard'));
const AuthInterface = lazy(() => import('./components/AuthInterface'));

type AuthMode = 'signin' | 'signup';
type AuthRole = 'student' | 'faculty' | 'college' | 'recruiter';

function WorkspaceLoading() {
  return <div className="workspace-gate" role="status"><img src="/PlacePMS-Logo-White.svg" alt="PlacePMS" width="140" /><p>Opening your workspace…</p></div>;
}

export default function App() {
  const { session, loading: authLoading, error: sessionError, passwordRecovery, recoveryError, finishPasswordRecovery } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const isAuthOpen = location.pathname === '/login' || location.pathname === '/signup';
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [authRole, setAuthRole] = useState<AuthRole>('student');
  const mustChangePassword = session?.user.app_metadata.must_change_password === true;
  useEffect(() => {
    if (passwordRecovery || recoveryError || location.pathname === '/reset-password') document.title = 'Reset password | PlacePMS';
    else if (!session) document.title = `${isAuthOpen ? location.pathname === '/signup' ? 'Create account' : 'Sign in' : 'Your Connected Academic Project Workspace'} | PlacePMS`;
  }, [session, isAuthOpen, passwordRecovery, recoveryError, location.pathname]);

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
      if (mustChangePassword && location.pathname !== '/set-password') navigate('/set-password', { replace: true });
      else if (!mustChangePassword && !passwordRecovery && !location.pathname.startsWith('/dashboard')) navigate('/dashboard', { replace: true });
    } else if (location.pathname.startsWith('/dashboard') || location.pathname === '/set-password') {
      navigate('/login', { replace: true });
    }
  }, [session, authLoading, passwordRecovery, recoveryError, mustChangePassword, location.pathname, location.search, location.hash, navigate]);

  const openAuth = (mode: AuthMode, role: AuthRole = 'student') => {
    setAuthMode(mode);
    setAuthRole(role);
    navigate(mode === 'signin' ? '/login' : '/signup');
  };

  if (authLoading) return <WorkspaceLoading />;
  if (recoveryError || (location.pathname === '/reset-password' && !passwordRecovery && !mustChangePassword)) return <RecoveryHelp message={recoveryError || 'Open the password-reset link from your email. If your reset session has ended, request a new link below.'} signedIn={Boolean(session)} onBack={() => { finishPasswordRecovery(); navigate(session ? '/dashboard' : '/login', { replace: true }); }} />;
  if ((passwordRecovery || mustChangePassword) && session) return <PasswordRecovery requiredSetup={mustChangePassword} email={session.user.email} onComplete={() => { finishPasswordRecovery(); navigate('/dashboard', { replace: true }); }} onSignOut={() => navigate('/login', { replace: true })} />;
  if (session) return <Suspense fallback={<WorkspaceLoading />}><Dashboard key={session.user.id} user={session.user} /></Suspense>;

  return <div className="app-nebula min-h-full flex flex-col flex-1 relative font-sans">
    {sessionError && <div className="auth-feedback auth-feedback-error" role="alert">{sessionError}</div>}
    {isAuthOpen && <Suspense fallback={<WorkspaceLoading />}><AuthInterface
      key={authRole}
      isOpen={isAuthOpen}
      onClose={() => navigate('/')}
      initialMode={location.pathname === '/signup' ? 'signup' : location.pathname === '/login' ? 'signin' : authMode}
      initialRole={authRole}
    /></Suspense>}
    <AnimatePresence mode="wait">
      {isLoading && <Preloader onComplete={() => setIsLoading(false)} />}
    </AnimatePresence>
    <HomePage onOpenAuth={openAuth} />
  </div>;
}
