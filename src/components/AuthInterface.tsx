import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, Check, CheckCircle2, Eye, EyeOff, FolderKanban, GraduationCap, KeyRound, LoaderCircle, LockKeyhole, Mail, Orbit, Pause, Play, School, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { configurationError, setSessionPersistence, supabase } from '../lib/supabase';
import { requestPasswordReset } from '../lib/password-reset';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { trapDialogTab } from '../lib/dialog-focus';
import { roleLabels } from '../lib/workspace-roles';

type RoleType = 'student' | 'faculty' | 'college' | 'recruiter';
type AccessRole = 'admin' | 'teacher' | 'staff';
interface AuthInterfaceProps { isOpen: boolean; onClose: () => void; initialMode?: 'signin' | 'signup'; initialRole?: RoleType; accessRole?: AccessRole }
const roles = [{ id: 'student', label: 'Student', icon: GraduationCap }, { id: 'faculty', label: 'Faculty', icon: Users }, { id: 'college', label: 'College / TPO', icon: School }, { id: 'recruiter', label: 'Recruiter', icon: BriefcaseBusiness }] as const;

export default function AuthInterface({ isOpen, onClose, initialMode = 'signin', initialRole = 'student', accessRole }: AuthInterfaceProps) {
  const navigate = useNavigate();
  const mode = initialMode; const [role, setRole] = useState<RoleType>(initialRole);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(''); const [organization, setOrganization] = useState('');
  const [showPassword, setShowPassword] = useState(false); const [rememberMe, setRememberMe] = useState(true); const [agreeTerms, setAgreeTerms] = useState(true);
  const [isLoading, setIsLoading] = useState(false); const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion(); const [year] = useState(() => new Date().getFullYear());
  const heading = useRef<HTMLHeadingElement>(null);
  const interfaceDialog = useRef<HTMLDialogElement>(null);
  const switchMode = (value: 'signin' | 'signup') => {
    setError(''); setNotice(''); setIsSuccess(false); setPassword('');
    navigate(value === 'signin' ? '/login' : '/signup', { replace: true });
  };
  useEffect(() => { document.body.style.overflow = isOpen ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [isOpen]);
  useEffect(() => { const element = interfaceDialog.current; if (isOpen) element?.showModal(); return () => element?.close(); }, [isOpen]);
  useEffect(() => { if (isSuccess) heading.current?.focus(); }, [isSuccess]);
  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!supabase) { setError(configurationError); return; }
    setError(''); setNotice(''); setIsLoading(true);
    try {
      setSessionPersistence(rememberMe);
      if (mode === 'signin') {
        const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) throw result.error;
        // App resolves the live managed role before opening a workspace. Cached
        // auth metadata must not reject the installation owner's first login.
      }
      else {
        const response = await fetch('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), fullName: fullName.trim(), organization: organization.trim(), role, agreeTerms }) });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.message) throw new Error(result?.error || 'Account email delivery is unavailable. Please try again later.');
        setPassword(''); setIsSuccess(true);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to authenticate. Please try again.'); }
    finally { setIsLoading(false); }
  };
  const resetPassword = async () => {
    if (!supabase) { setError(configurationError); return; }
    if (!email.trim()) { setError('Enter your email address first to receive a password reset link.'); return; }
    setIsLoading(true); setError(''); setNotice('');
    try { await requestPasswordReset(email); setNotice('If an account exists for this email, a password reset link has been sent.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send the reset email.'); }
    finally { setIsLoading(false); }
  };

  return <dialog ref={interfaceDialog} className={`auth-interface auth-studio ${paused || reduced ? 'auth-motion-paused' : ''}`} aria-label={mode === 'signin' ? 'Sign in' : 'Create account'} onKeyDown={trapDialogTab} onCancel={event => { event.preventDefault(); if (!isLoading) onClose(); }}>
    <aside className="auth-showcase"><button className="auth-logo" aria-label="PlacePMS home" onClick={onClose}><img src="/PlacePMS-Logo-White.svg" alt="PlacePMS" /></button><div className="auth-showcase-glow" aria-hidden="true" /><div className="auth-showcase-copy"><span className="auth-eyebrow"><Sparkles size={13} /> YOUR NEXT CHAPTER</span><h2>Built for ideas.<br /><span>Made for impact.</span></h2><p>Your team. Your projects. Your next big move.</p><div className="auth-universe" aria-hidden="true"><i /><i /><i /><span className="auth-universe-core"><Orbit size={43} /></span><span className="auth-universe-node auth-universe-project"><FolderKanban size={22} /></span><span className="auth-universe-node auth-universe-team"><Users size={22} /></span><span className="auth-universe-node auth-universe-done"><CheckCircle2 size={22} /></span><div className="auth-universe-caption"><span /><span>Everything in your orbit.</span></div></div></div><div className="auth-showcase-bottom"><span>© {year} PlacePMS</span><button aria-label={paused || reduced ? 'Play sign-in animations' : 'Pause sign-in animations'} disabled={reduced} onClick={() => setPaused(!paused)}>{paused || reduced ? <Play size={12} /> : <Pause size={12} />}{reduced ? 'Reduced motion' : paused ? 'Motion paused' : 'Motion on'}</button></div></aside>
    <section className="auth-form-shell"><header className="auth-topbar"><button className="auth-back" disabled={isLoading} onClick={onClose}><ArrowLeft size={15} />Back to Home</button><span><ShieldCheck size={14} /> {accessRole ? `${roleLabels[accessRole]} access` : 'Secure workspace access'}</span></header>
      <div className="auth-card"><img className="auth-mobile-logo" src="/PlacePMS-Logo-White.svg" alt="PlacePMS" />
        {isSuccess ? <div className="auth-success"><span className="auth-success-icon"><Mail size={29} /></span><span className="auth-eyebrow">YOU’RE ONE STEP AWAY</span><h1 ref={heading} tabIndex={-1}>Check your email</h1><p>For a new account, we have sent a 6-digit login code to <strong>{email}</strong>.</p><ol>{['Sign in with the code in the Password field.', 'Choose your personal password.', 'Open your connected workspace.'].map((text, index) => <li key={text}><span>{index + 1}</span>{text}</li>)}</ol><button className="auth-submit" onClick={() => switchMode('signin')}>Back to Sign In <ArrowUpRight size={17} /></button><small>Check your spam folder too. Already registered? Use your existing password or Forgot password.</small></div> : <>
          <div className="auth-mode-tabs" aria-label="Account access"><button aria-pressed={mode === 'signin'} disabled={isLoading} onClick={() => switchMode('signin')}>Sign In</button><button aria-pressed={mode === 'signup'} disabled={isLoading} onClick={() => switchMode('signup')}>Create Account</button></div>
           <div className="auth-card-heading"><span className="auth-eyebrow">{mode === 'signin' ? accessRole ? `${roleLabels[accessRole].toUpperCase()} PORTAL` : 'WELCOME BACK' : 'A NEW BEGINNING'}</span><h1>{mode === 'signin' && accessRole ? `Sign in to your ${roleLabels[accessRole].toLowerCase()} workspace` : mode === 'signin' ? 'Sign In to Your Workspace' : 'Create Your PlacePMS Account'}</h1><p>{mode === 'signin' ? accessRole ? `Use your assigned ${roleLabels[accessRole].toLowerCase()} credentials to continue.` : 'Pick up where your next big idea left off.' : 'A connected home for your academic work.'}</p></div>
          {error && <div className="auth-feedback auth-feedback-error" role="alert">{error}</div>}{notice && <div className="auth-feedback" role="status">{notice}</div>}
          <form className="auth-form" onSubmit={handleSubmit}><fieldset disabled={isLoading}>
            {mode === 'signup' && <><div className="auth-role-field"><span>I’m joining as</span><div className="auth-role-grid">{roles.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={role === id} onClick={() => setRole(id)}><Icon size={15} />{label}{role === id && <Check size={12} />}</button>)}</div></div><label htmlFor="signup-full-name">Full Name<input id="signup-full-name" type="text" autoComplete="name" required maxLength={120} placeholder="Your full name" value={fullName} onChange={event => setFullName(event.target.value)} /></label></>}
            <label htmlFor="auth-email">Institutional Email<div className="auth-input-wrap"><Mail size={16} /><input id="auth-email" type="email" autoComplete="username" required maxLength={254} placeholder="you@university.edu" value={email} onChange={event => setEmail(event.target.value)} /></div></label>
            {mode === 'signup' ? <label htmlFor="signup-organization">{role === 'recruiter' ? 'Company Name' : 'College / University Name'}<input id="signup-organization" type="text" autoComplete="organization" required maxLength={200} placeholder={role === 'recruiter' ? 'Your organization' : 'Your institution'} value={organization} onChange={event => setOrganization(event.target.value)} /></label> : <div><div className="auth-password-label"><label htmlFor="auth-password">Password</label><button type="button" onClick={() => void resetPassword()}>Forgot password?</button></div><div className="auth-input-wrap"><LockKeyhole size={16} /><input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required placeholder="Enter your password" value={password} onChange={event => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>}
            {mode === 'signin' ? <label className="auth-check"><input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)} />Keep me signed in on this device</label> : <label className="auth-check"><input type="checkbox" required checked={agreeTerms} onChange={event => setAgreeTerms(event.target.checked)} /><span>I agree to the PlacePMS <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.</span></label>}
            <button className="auth-submit" type="submit">{isLoading ? <><LoaderCircle className="auth-spinner" size={17} />{mode === 'signin' ? 'Verifying credentials…' : 'Creating workspace…'}</> : <>{mode === 'signin' ? 'Sign In to Workspace' : 'Create PlacePMS Account'}<ArrowUpRight size={17} /></>}</button>
          </fieldset></form>
          <div className="auth-login-hint"><KeyRound size={14} /><p>{mode === 'signin' ? 'Admin, teacher, staff, and student accounts use this login. Your account opens the correct dashboard automatically. For a new account, enter your emailed 6-digit code in the Password field.' : 'We’ll email a 6-digit login code. Teacher and staff access is assigned by your administrator.'}</p></div>
        </>}
      </div><footer className="auth-form-footer"><ShieldCheck size={13} /><span>Your account, authenticated with Supabase.</span><span>Projects. People. Possibilities.</span></footer>
    </section>
  </dialog>;
}
