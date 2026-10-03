import { useState, useEffect } from 'react';
import { configurationError, setSessionPersistence, supabase } from '../lib/supabase';

interface AuthInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
  initialRole?: 'student' | 'faculty' | 'college' | 'recruiter';
}

type RoleType = 'student' | 'faculty' | 'college' | 'recruiter';

export default function AuthInterface({
  isOpen,
  onClose,
  initialMode = 'signin',
  initialRole = 'student'
}: AuthInterfaceProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [role, setRole] = useState<RoleType>(initialRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [year] = useState(() => new Date().getFullYear());

  const switchMode = (newMode: 'signin' | 'signup') => {
    setMode(newMode);
    setError('');
    setNotice('');
    setIsSuccess(false);
    setPassword('');
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { setError(configurationError); return; }
    setError('');
    setNotice('');
    setIsLoading(true);
    try {
      setSessionPersistence(rememberMe);
      if (mode === 'signin') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      } else {
        const response = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), fullName: fullName.trim(), organization: organization.trim(), role, agreeTerms }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.message) throw new Error(result?.error || 'Account email delivery is unavailable. Please try again later.');
        setPassword('');
        setIsSuccess(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to authenticate. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!supabase) { setError(configurationError); return; }
    if (!email.trim()) { setError('Enter your email address first to receive a password reset link.'); return; }
    setIsLoading(true);
    setError('');
    setNotice('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (resetError) throw resetError;
      setNotice('If an account exists for this email, a password reset link has been sent.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send the reset email.');
    } finally { setIsLoading(false); }
  };

  const roles = [
    {
      id: 'student',
      label: 'Student',
      desc: 'Practice DSA, build roadmaps & portfolio',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
        </svg>
      )
    },
    {
      id: 'faculty',
      label: 'Faculty',
      desc: 'Proctored lab exams & testcases',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      )
    },
    {
      id: 'college',
      label: 'College / TPO',
      desc: 'Department analytics & batch readiness',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      )
    },
    {
      id: 'recruiter',
      label: 'Recruiter',
      desc: 'Direct hiring & candidate shortlisting',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )
    }
  ];

  return (
    <div className="auth-interface fixed inset-0 z-[100000] w-full min-h-[100dvh] flex bg-[#F8FAFC] text-[#0F172A] font-sans overflow-y-auto" role="dialog" aria-modal="true" aria-label={mode === 'signin' ? 'Sign in' : 'Create account'}>
      {/* LEFT HALF (Desktop Split Hero Banner matching zip) */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 xl:p-16 bg-[#0B0F19] text-white overflow-hidden select-none">
        {/* Background Joyful Banner Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30 scale-105 transition-transform duration-1000"
          style={{ backgroundImage: "url('/joyful_banner.png')" }}
        />
        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#0B0F19]/40 to-[#0B0F19]" />

        {/* Top Logo */}
        <div className="relative z-10">
          <button 
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D7F62] rounded-lg"
          >
            <img 
              src="/PlacePMS-Logo-Vector.svg" 
              alt="PlacePMS Platform" 
              className="h-8 object-contain brightness-125 transition-transform group-hover:scale-105" 
            />
          </button>
        </div>

        {/* Middle Feature Highlights */}
        <div className="relative z-10 max-w-lg space-y-5 mb-8 text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2D7F62]/20 border border-[#2D7F62]/40 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Your institutional workspace</span>
          </div>

          <h2 className="text-4xl xl:text-5xl font-black tracking-tight leading-tight text-white">
            Welcome to <span className="text-[#2D7F62]">PlacePMS</span>
          </h2>

          <p className="text-base text-slate-300 leading-relaxed font-normal">
            Connecting student practice sandboxes, faculty proctored examinations, capstone project management (PMS), and verified industry talent discovery under one unified architecture.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10 text-xs text-slate-300">
            <div className="space-y-1">
              <span className="font-bold text-white block">Multi-Portal Access</span>
              <span className="text-slate-400">Student • Faculty • Admin</span>
            </div>
            <div className="space-y-1">
              <span className="font-bold text-white block">Security Standards</span>
              <span className="text-slate-400">Supabase authenticated access</span>
            </div>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="relative z-10 text-xs text-slate-400 font-medium">
          © {year} PlacePMS Inc. All rights reserved.
        </div>
      </div>

      {/* RIGHT HALF (Form Area) */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-10 xl:p-14 bg-white relative min-h-screen">
        {/* Top Navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Home</span>
          </button>

          <div className="lg:hidden">
            <img src="/PlacePMS-Logo-Vector.svg" alt="PlacePMS" className="h-7 object-contain" />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => switchMode('signin')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => switchMode('signup')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-[#2D7F62] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>
        </div>

        {/* Center Form Card */}
        <div className="max-w-md w-full mx-auto my-auto py-8">
          {isSuccess ? (
            <div className="text-center space-y-5 py-6">
              <div className="w-16 h-16 bg-emerald-100 text-[#2D7F62] rounded-2xl mx-auto flex items-center justify-center shadow-inner">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-slate-900">
                  Check your email
                </h3>
                <p className="text-sm text-slate-600">
                  For a new account, we have sent a temporary password to <strong>{email}</strong>. Sign in with your email and temporary password, then choose a new password to open your workspace. Check your spam folder too.
                </p>
                <p className="text-xs text-slate-500">Already registered? Use your existing password or select Forgot password on the sign-in screen.</p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="px-6 py-2.5 rounded-xl bg-[#2D7F62] hover:bg-[#23634d] text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-left">
              {/* Heading */}
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                  {mode === 'signin' ? 'Sign In to Your Workspace' : 'Create Your PlacePMS Account'}
                </h1>
                <p className="text-sm text-slate-600 font-normal">
                  {mode === 'signin'
                    ? 'Enter your email and password. New here? Use the temporary password sent to your email.'
                    : 'Enter your details and we will email your temporary login credentials. You will choose your own password after signing in.'}
                </p>
              </div>

              {/* Form */}
              {error && <div className="auth-feedback auth-feedback-error" role="alert">{error}</div>}
              {notice && <div className="auth-feedback" role="status">{notice}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Role Selector (Sign Up Mode) */}
                {mode === 'signup' && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                      Select Your Persona
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {roles.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => setRole(item.id as RoleType)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            role === item.id
                              ? 'border-[#2D7F62] bg-[#2D7F62]/5 ring-2 ring-[#2D7F62]/20'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                            <span className={role === item.id ? 'text-[#2D7F62]' : 'text-slate-400'}>
                              {item.icon}
                            </span>
                            <span>{item.label}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 leading-tight pt-1">
                            {item.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Name (Sign Up Mode) */}
                {mode === 'signup' && (
                  <div className="w-full space-y-1.5 text-left">
                    <label htmlFor="signup-full-name" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Full Name <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      id="signup-full-name"
                      autoComplete="name"
                      maxLength={120}
                      required
                      placeholder="e.g. Alex Sharma"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full py-2.5 px-3.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#2D7F62]/20 focus:border-[#2D7F62]"
                    />
                  </div>
                )}

                {/* Email Input */}
                <div className="w-full space-y-1.5 text-left">
                  <label htmlFor="auth-email" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Institutional Email <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <input
                    type="email"
                    id="auth-email"
                    autoComplete="username"
                    maxLength={254}
                    required
                    placeholder="student@college.edu or teacher@placepms.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full py-2.5 px-3.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#2D7F62]/20 focus:border-[#2D7F62]"
                  />
                </div>

                {/* Organization / College (Sign Up Mode) */}
                {mode === 'signup' && (
                  <div className="w-full space-y-1.5 text-left">
                    <label htmlFor="signup-organization" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      {role === 'recruiter' ? 'Company Name' : 'College / University Name'} <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      id="signup-organization"
                      autoComplete="organization"
                      maxLength={200}
                      required
                      placeholder={role === 'recruiter' ? 'e.g. Google, Microsoft' : 'e.g. National Institute of Technology'}
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      className="w-full py-2.5 px-3.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#2D7F62]/20 focus:border-[#2D7F62]"
                    />
                  </div>
                )}

                {/* Password Input */}
                {mode === 'signin' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="auth-password" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Password <span aria-hidden="true" className="text-rose-500 font-bold">*</span>
                    </label>
                    {mode === 'signin' && (
                      <button type="button" disabled={isLoading} onClick={() => void resetPassword()} className="text-xs font-semibold text-[#2D7F62] hover:text-[#236850] hover:underline transition-colors cursor-pointer">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="auth-password"
                      required
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full py-2.5 pl-3.5 pr-11 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#2D7F62]/20 focus:border-[#2D7F62]"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                    >
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                )}

                {/* Checkbox Options */}
                {mode === 'signin' ? (
                  <div className="flex items-center justify-between text-xs pt-1">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-600 hover:text-slate-900 select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-[#2D7F62] focus:ring-[#2D7F62] cursor-pointer"
                      />
                      <span>Keep me signed in on this device</span>
                    </label>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="signup-agree"
                      required
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#2D7F62] focus:ring-[#2D7F62] cursor-pointer"
                    />
                    <label htmlFor="signup-agree" className="text-xs text-slate-600 leading-tight">
                      I agree to the PlacePMS <a href="/terms" className="text-[#2D7F62] underline">Terms of Service</a> and <a href="/privacy" className="text-[#2D7F62] underline">Privacy Policy</a>.
                    </label>
                  </div>
                )}

                {/* Submit Primary CTA */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 rounded-xl bg-[#2D7F62] hover:bg-[#236850] text-white font-bold text-xs tracking-wide shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.99]"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>{mode === 'signin' ? 'Verifying Credentials...' : 'Creating Workspace...'}</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                        </svg>
                        <span>{mode === 'signin' ? 'Sign In to Workspace' : 'Create PlacePMS Account'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Mode Switcher */}
              <div className="text-center pt-1 text-xs text-slate-600">
                {mode === 'signin' ? (
                  <span>
                    Don't have an institutional account yet?{' '}
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => switchMode('signup')}
                      className="font-bold text-[#2D7F62] hover:underline cursor-pointer"
                    >
                      Create Account
                    </button>
                  </span>
                ) : (
                  <span>
                    Already have an account?{' '}
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => switchMode('signin')}
                      className="font-bold text-[#2D7F62] hover:underline cursor-pointer"
                    >
                      Sign In
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Footer Info */}
        <div className="border-t border-slate-100 pt-6 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 font-medium">
            <svg className="w-4 h-4 text-[#2D7F62]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Your account is authenticated with Supabase</span>
          </div>
          <p className="text-[11px] text-slate-400 font-normal">
            Need institutional credentials?{' '}
            <a href="/contact" className="text-slate-600 hover:text-slate-900 font-semibold underline">
              Contact your campus IT coordinator
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
