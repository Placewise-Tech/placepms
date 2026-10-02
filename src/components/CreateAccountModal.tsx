import { useState, useEffect } from 'react';

interface CreateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRole?: string;
}

type RoleType = 'student' | 'faculty' | 'college' | 'recruiter';

export default function CreateAccountModal({ isOpen, onClose, defaultRole = 'student' }: CreateAccountModalProps) {
  const [role, setRole] = useState<RoleType>((defaultRole as RoleType) || 'student');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSignInMode, setIsSignInMode] = useState(false);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setIsSuccess(false);
      setIsLoading(false);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
    }, 1000);
  };

  const roles = [
    {
      id: 'student',
      label: 'Student',
      desc: 'Learn DSA, roadmaps & build portfolio',
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
      desc: 'Manage labs, tests & student progress',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      )
    },
    {
      id: 'college',
      label: 'College / TPO',
      desc: 'Department analytics & placements',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      )
    },
    {
      id: 'recruiter',
      label: 'Recruiter',
      desc: 'Hire verified engineering candidates',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )
    }
  ];

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200/90 z-10 overflow-hidden transform transition-all duration-300 animate-in fade-in zoom-in-95 my-8">
        
        {/* Modal Header */}
        <div className="relative px-6 pt-6 pb-4 sm:px-8 border-b border-slate-100 flex items-start justify-between bg-gradient-to-b from-slate-50/60 to-white">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <img src="/PlacePMS-Logo-Vector.svg" alt="PlacePMS" className="h-6 w-auto" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#2D7F62] bg-[#2D7F62]/10 px-2 py-0.5 rounded-full border border-[#2D7F62]/20">
                {isSignInMode ? 'Portal Login' : 'Fast Onboarding'}
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight pt-1">
              {isSignInMode ? 'Sign In to PlacePMS' : 'Create Your Account'}
            </h3>
            <p className="text-xs text-slate-600 font-normal">
              {isSignInMode 
                ? 'Welcome back! Access your workspaces and dashboards.' 
                : 'Join the institutional platform for technical learning & evaluation.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0 ml-4 focus:outline-none focus:ring-2 focus:ring-[#2D7F62]/40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-5 sm:px-8 max-h-[calc(85vh-120px)] overflow-y-auto">
          {isSuccess ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-[#2D7F62] rounded-full mx-auto flex items-center justify-center shadow-inner">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-1">
                <h4 className="text-xl font-bold text-slate-900">
                  {isSignInMode ? 'Signed In Successfully!' : 'Account Created Successfully!'}
                </h4>
                <p className="text-xs text-slate-600 max-w-sm mx-auto">
                  Welcome to PlacePMS, <span className="font-semibold text-slate-800">{fullName || 'Student'}</span>! Redirecting you to your {role} portal workspace...
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-[#2D7F62] hover:bg-[#23634d] text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  Continue to Workspace
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isSignInMode && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Select Your Role
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

              {/* Full Name */}
              {!isSignInMode && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="e.g. Alex Sharma"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-[#2D7F62] focus:ring-2 focus:ring-[#2D7F62]/20 outline-none transition-all text-slate-800 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              )}

              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {role === 'student' ? 'College / Personal Email' : 'Institutional / Work Email'}
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-[#2D7F62] focus:ring-2 focus:ring-[#2D7F62]/20 outline-none transition-all text-slate-800 placeholder:text-slate-400"
                />
              </div>

              {/* Institution / College Name */}
              {!isSignInMode && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {role === 'recruiter' ? 'Company / Firm Name' : 'College / University Name'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={role === 'recruiter' ? 'e.g. Google, Microsoft, Tech Corp' : 'e.g. National Institute of Technology'}
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-[#2D7F62] focus:ring-2 focus:ring-[#2D7F62]/20 outline-none transition-all text-slate-800 placeholder:text-slate-400"
                  />
                </div>
              )}

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Password</label>
                  {isSignInMode && (
                    <a href="#forgot" className="text-[11px] font-semibold text-[#2D7F62] hover:underline">
                      Forgot Password?
                    </a>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-[#2D7F62] focus:ring-2 focus:ring-[#2D7F62]/20 outline-none transition-all text-slate-800 placeholder:text-slate-400 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
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

              {/* Terms Checkbox */}
              {!isSignInMode && (
                <div className="flex items-start gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="terms-agree"
                    required
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#2D7F62] focus:ring-[#2D7F62] cursor-pointer"
                  />
                  <label htmlFor="terms-agree" className="text-[11px] text-slate-600 leading-tight">
                    I agree to the PlacePMS <a href="/terms" className="text-[#2D7F62] underline">Terms of Service</a> and <a href="/privacy" className="text-[#2D7F62] underline">Privacy Policy</a>.
                  </label>
                </div>
              )}

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-[#2D7F62] hover:bg-[#23634d] text-white font-bold text-xs tracking-wide shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.99]"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>{isSignInMode ? 'Signing In...' : 'Setting Up Account...'}</span>
                  </>
                ) : (
                  <span>{isSignInMode ? 'Sign In to Workspace' : 'Create PlacePMS Account'}</span>
                )}
              </button>

              {/* SSO Divider */}
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-[11px]">
                  <span className="bg-white px-2 text-slate-400 font-medium">Or continue with</span>
                </div>
              </div>

              {/* Google Button */}
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  setTimeout(() => {
                    setIsLoading(false);
                    setIsSuccess(true);
                  }, 800);
                }}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-2xs"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Institutional Google Account</span>
              </button>

              {/* Mode Switcher */}
              <div className="text-center pt-2 text-xs text-slate-600">
                {isSignInMode ? (
                  <span>
                    Don't have an account yet?{' '}
                    <button
                      type="button"
                      onClick={() => setIsSignInMode(false)}
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
                      onClick={() => setIsSignInMode(true)}
                      className="font-bold text-[#2D7F62] hover:underline cursor-pointer"
                    >
                      Sign In
                    </button>
                  </span>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
