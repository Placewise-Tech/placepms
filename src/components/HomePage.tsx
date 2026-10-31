import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useScroll } from 'framer-motion';
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  FileText,
  FolderKanban,
  GitFork as Github,
  Layers3,
  LayoutDashboard,
  Menu,
  Orbit,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import '../home.css';
import '../home-next.css';
import '../home-crystalline.css';
import { useReducedMotion } from '../hooks/useReducedMotion';
import CrystallineShader from './CrystallineShader';
import HomeAudience from './HomeAudience';
import HomeTeam from './HomeTeam';

type AuthMode = 'signin' | 'signup';
type Preview = 'overview' | 'tasks' | 'tools';
interface HomePageProps { onOpenAuth: (mode: AuthMode) => void }
const HomeMotionContext = createContext(false);

const HomeAutomation = lazy(() => import('./HomeAutomation'));
const HomeIdeaPlanner = lazy(() => import('./HomeIdeaPlanner'));

const navigation = [
  { id: 'idea-planner', label: 'Build your idea' },
  { id: 'features', label: 'Features' },
  { id: 'automation', label: 'Automation' },
  { id: 'how-it-works', label: 'The journey' },
  { id: 'team', label: 'Our team' },
  { id: 'faq', label: 'FAQ' }
];

const previews: Preview[] = ['overview', 'tasks', 'tools'];

const workflow = [
  {
    title: 'Start with a spark.',
    description: 'Create your project. Bring your people.',
    icon: FolderKanban,
    caption: 'A space for your next big idea',
    tags: ['Your team', 'Your mentor', 'Your plan']
  },
  {
    title: 'Build your momentum.',
    description: 'Set milestones. Get feedback. Keep moving.',
    icon: CheckCircle2,
    caption: 'Small steps. Visible progress.',
    tags: ['Plan', 'Submit', 'Review']
  },
  {
    title: 'Make it your story.',
    description: 'Turn your work into a report and portfolio.',
    icon: BookOpen,
    caption: 'From first idea to final presentation',
    tags: ['Research', 'Blackbook', 'Portfolio']
  }
];

const faq = [
  ['How do I get started?', 'Create your account. Your initial six-digit login code is emailed to you. Sign in, set a personal password, and start your first project.'],
  ['Can my team and mentor join?', 'Yes. Add teammates by email and assign a mentor from your project settings. Everyone signs in with their own account.'],
  ['Do I need to connect external tools?', 'Only when you need them. Planning and reports work on their own; connect GitHub, Figma, or Miro to explore your project evidence.'],
  ['Can I build a Blackbook report?', 'Yes. The Blackbook builder brings your saved project records, team, milestone evidence, research, and authored sections into an editable report. Save drafts and export Markdown, printable HTML, or a PDF through your browser.'],
  ['Can I take my deadlines into my calendar?', 'Yes. Export project milestones as an ICS calendar file from your workspace and import it into a compatible calendar. You can also export milestone evidence as CSV.'],
  ['How do teachers and administrators get access?', 'Your institution assigns teacher, staff, and administrator access. Sign in with your assigned account and PlacePMS opens the appropriate workspace automatically. Public registration does not assign administrator access.']
];

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  const paused = useContext(HomeMotionContext);
  return (
    <motion.div
      className={className}
      initial={reduced || paused ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: reduced || paused ? 0 : 0.65, delay: reduced || paused ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function HomePage({ onOpenAuth }: HomePageProps) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preview, setPreview] = useState<Preview>('overview');
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(() => {
    try { return localStorage.getItem('placepms-home-motion') === 'paused'; }
    catch { return false; }
  });
  const [tourPlaying, setTourPlaying] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const [hasScrolled, setHasScrolled] = useState(false);
  const [faqQuery, setFaqQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string } | null>(null);
  const [activeChartPoint, setActiveChartPoint] = useState<string | null>(null);
  const [newsletterEmail, setNewsletterEmail] = useState('');

  const menuRef = useRef<HTMLButtonElement>(null);
  const missionCardRef = useRef<HTMLDivElement>(null);
  const cursorGlowRef = useRef<HTMLDivElement>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const reduced = useReducedMotion();
  const frozen = paused || reduced;
  const { scrollYProgress } = useScroll();

  const showToast = useCallback((title: string, desc: string) => {
    setToastMessage({ title, desc });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3400);
  }, []);

  // Specular cursor glow interpolation
  useEffect(() => {
    if (frozen) return;
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let curX = mouseX;
    let curY = mouseY;
    let frameId: number;

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const loop = () => {
      curX += (mouseX - curX) * 0.12;
      curY += (mouseY - curY) * 0.12;
      if (cursorGlowRef.current) {
        cursorGlowRef.current.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;
      }
      frameId = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    frameId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(frameId);
    };
  }, [frozen]);

  // Mission control 3D tilt tracking
  const handleMissionCardMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const card = missionCardRef.current;
    if (!card || frozen) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -6.5;
    const rotateY = ((x - centerX) / centerX) * 6.5;
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01, 1.01, 1.01)`;
    card.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`);
    card.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`);
  };

  const handleMissionCardMouseLeave = () => {
    const card = missionCardRef.current;
    if (!card) return;
    card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
  };

  // Auto-tour tab cycler
  useEffect(() => {
    if (!tourPlaying || frozen) return;
    const interval = window.setInterval(() => {
      setPreview(curr => {
        const nextIdx = (previews.indexOf(curr) + 1) % previews.length;
        return previews[nextIdx];
      });
    }, 2800);
    return () => window.clearInterval(interval);
  }, [tourPlaying, frozen]);

  // Scroll detection for active sections & floating CTA
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setHasScrolled(window.scrollY > 600);
      let active = '';
      for (const item of navigation) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= 180) {
          active = item.id;
        }
      }
      setActiveSection(active);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  const openAuth = (mode: AuthMode) => {
    setMobileMenuOpen(false);
    onOpenAuth(mode);
  };

  const followAnchor = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    const target = link && document.getElementById(link.hash.slice(1));
    if (!link || !target) return;
    event.preventDefault();
    navigate(link.hash, { preventScrollReset: true });
    if (link.hash === '#home-main') {
      window.scrollTo({ top: 0, behavior: frozen ? 'instant' : 'smooth' });
    } else {
      target.scrollIntoView({ behavior: frozen ? 'instant' : 'smooth', block: 'start' });
    }
    if (link.classList.contains('home-skip')) target.focus({ preventScroll: true });
  };

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;
    showToast('Subscribed Successfully', `Briefings will be dispatched to ${newsletterEmail}`);
    setNewsletterEmail('');
  };

  const filteredFaq = faq.filter(item => item.join(' ').toLowerCase().includes(faqQuery.trim().toLowerCase()));
  const currentStep = workflow[step];
  const StepIcon = currentStep.icon;

  return (
    <HomeMotionContext.Provider value={frozen}>
      <div className={`home-page home-crystalline relative min-h-screen text-slate-900 selection:bg-cyan-100 selection:text-cyan-900 antialiased overflow-x-hidden ${frozen ? 'home-motion-paused' : ''}`} onClickCapture={followAnchor}>
        {/* 1. WebGL Crystalline Background Fluid Shader */}
        <CrystallineShader motionPaused={frozen} />

        {/* 2. Specular Spotlight Cursor Glow */}
        {!frozen && <div id="ambient-cursor-glow" ref={cursorGlowRef} />}

        {/* 3. Ambient Fluid Meshes & Cybernetic Drifting Grid */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10" aria-hidden="true">
          <div className="absolute -top-40 left-1/4 w-[780px] h-[780px] bg-gradient-to-br from-cyan-400/20 via-[#00f2fe]/15 to-transparent rounded-full blur-[140px] animate-glow" />
          <div className="absolute top-1/4 -right-32 w-[680px] h-[680px] bg-gradient-to-bl from-violet-400/15 via-fuchsia-300/10 to-transparent rounded-full blur-[140px] animate-float-slow" style={{ animationDelay: '1.5s' }} />
          <div className="absolute bottom-10 left-10 w-[720px] h-[720px] bg-gradient-to-tr from-emerald-400/15 via-teal-300/10 to-transparent rounded-full blur-[150px] animate-glow" style={{ animationDelay: '3.5s' }} />
          <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] cyber-grid-anim" />
        </div>

        {/* 4. Interactive Live Matrix / Cmd+K Micro-Toast */}
        <div className="fixed bottom-6 right-6 z-50 pointer-events-none" id="matrix-toast-wrap">
          <div className={`crystal-panel border border-cyan-300/80 shadow-[0_15px_40px_rgba(0,242,254,0.35)] px-4 py-3 rounded-2xl flex items-center gap-3 bg-white/95 ${toastMessage ? 'show' : ''}`} id="matrix-toast">
            <span className="relative flex h-3 w-3">
              <span className="radar-pulse-ring" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 shadow-[0_0_10px_#10b981]" />
            </span>
            <div className="flex flex-col">
              <span className="font-headline-sm text-xs font-bold text-slate-900" id="matrix-toast-title">
                {toastMessage?.title || 'Live Matrix Synchronized'}
              </span>
              <span className="font-body-sm text-[11px] text-slate-500" id="matrix-toast-desc">
                {toastMessage?.desc || 'Autonomous telemetry ping active across 240+ institutions'}
              </span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-cyan-600 ml-2">verified</span>
          </div>
        </div>

        {/* 5. Crystalline Floating Top Navigation */}
        <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300">
          <div className="max-w-7xl mx-auto px-5 lg:px-10 pt-4">
            <div className="h-16 px-6 rounded-2xl crystal-panel flex items-center justify-between gap-4 border border-white/90 shadow-[0_10px_35px_-5px_rgba(15,23,42,0.06),0_0_15px_rgba(0,242,254,0.08)]">
              {/* Brand Logo with Lift and Rotation */}
              <div
                className="flex items-center gap-3 group cursor-pointer interactive-press"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <img
                  alt="PlacePMS Logo"
                  className="h-8 w-auto object-contain drop-shadow-sm transition-transform duration-300 group-hover:scale-105 group-hover:rotate-[-2deg]"
                  src="/PlacePMS-Logo-Vector.svg"
                />
                <span className="font-headline-sm text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-cyan-100/90 text-cyan-800 border border-cyan-300/50 shadow-sm transition-all duration-300 group-hover:border-cyan-400 group-hover:bg-cyan-200/80">
                    v4.2
                  </span>
                </span>
              </div>

              {/* Navigation Pill Menu */}
              <nav className="hidden xl:flex items-center gap-1 bg-slate-100/70 p-1 rounded-xl border border-slate-200/60 shadow-inner">
                {navigation.map(item => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    aria-current={activeSection === item.id ? 'page' : undefined}
                    className={`px-3.5 py-1.5 rounded-lg text-xs transition-all duration-200 active:scale-95 ${
                      activeSection === item.id
                        ? 'text-slate-900 font-semibold bg-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 font-medium hover:bg-white/80'
                    }`}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>

              {/* CTAs */}
              <div className="flex items-center gap-3">
                <button
                  className="hidden sm:inline-flex items-center px-4 py-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-white/90 font-medium text-xs tracking-wide transition-all border border-transparent hover:border-slate-200 hover:shadow-sm active:scale-95 interactive-press"
                  onClick={() => openAuth('signin')}
                >
                  Sign In
                </button>
                <button
                  className="shimmer-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500 text-white font-semibold text-xs tracking-wide shadow-[0_4px_20px_rgba(16,185,129,0.35)] hover:shadow-[0_8px_30px_rgba(16,185,129,0.5)] active:scale-95 group transition-all"
                  onClick={() => openAuth('signup')}
                >
                  <span>Get started</span>
                  <span className="material-symbols-outlined text-[16px] transition-transform duration-300 group-hover:translate-x-1">
                    arrow_forward
                  </span>
                </button>
                <div
                  className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center shrink-0 shadow-md text-white font-semibold text-xs transition-transform duration-300 hover:scale-110 hover:shadow-cyan-400/40 cursor-pointer active:scale-95"
                  onClick={() => openAuth('signin')}
                >
                  <span className="material-symbols-outlined text-[18px]">person</span>
                </div>
                {/* Mobile hamburger toggle */}
                <button
                  ref={menuRef}
                  className="xl:hidden p-2 rounded-xl crystal-panel border border-slate-200 text-slate-700 hover:text-slate-900"
                  aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
              </div>
            </div>

            {/* Mobile Dropdown Menu */}
            {mobileMenuOpen && (
              <nav className="xl:hidden mt-2 p-4 rounded-2xl crystal-panel-elevated flex flex-col gap-2 border border-slate-200/90 shadow-xl">
                {navigation.map(item => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-slate-700 hover:text-slate-900 font-medium text-sm hover:bg-slate-100/80 transition-all"
                  >
                    {item.label}
                  </a>
                ))}
                <div className="pt-2 border-t border-slate-200/80 flex flex-col gap-2">
                  <button
                    className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-800 font-semibold text-sm"
                    onClick={() => openAuth('signin')}
                  >
                    Sign In
                  </button>
                  <button
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold text-sm shadow-md"
                    onClick={() => openAuth('signup')}
                  >
                    Get started
                  </button>
                </div>
              </nav>
            )}
          </div>
          <motion.div className="h-[2px] bg-gradient-to-r from-emerald-500 via-cyan-500 to-violet-500 origin-left" style={{ scaleX: scrollYProgress }} aria-hidden="true" />
        </header>

        {/* 6. Main Content */}
        <main id="home-main" className="relative z-10 w-full pt-28 max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex flex-col w-full text-slate-900 pb-16">
            {/* HERO SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center pt-6 pb-16">
              {/* LEFT COLUMN */}
              <div className="lg:col-span-5 flex flex-col items-start gap-6 z-10 fade-in-1">
                {/* Holographic Pill Badge with Pulse & Radar */}
                <div
                  className="interactive-press inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full crystal-panel shadow-sm border border-cyan-200/90 bg-white/85 cursor-pointer hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(0,242,254,0.3)]"
                  onClick={() => showToast('Neural Academic Engine Active', 'Telemetry active across 240+ institutions.')}
                >
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="radar-pulse-ring" />
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                  </span>
                  <span className="font-headline-sm text-[11px] font-bold text-slate-800 tracking-wider uppercase">
                    NEURAL ACADEMIC OPERATING SYSTEM • v4.2
                  </span>
                </div>

                {/* Main Display Headline */}
                <h1 className="font-display text-5xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.08] transition-transform duration-500 hover:scale-[1.01]">
                  Big ideas.<br />
                  <span className="bg-gradient-to-r from-emerald-600 via-cyan-600 to-violet-600 bg-clip-text text-transparent drop-shadow-xs">
                    Next-level execution.
                  </span>
                </h1>

                {/* Subheading */}
                <p className="font-body-lg text-slate-600 max-w-xl font-normal text-base sm:text-lg leading-relaxed">
                  Plan projects, bring your team together, and turn everyday academic progress into verified placement evidence recruiters trust.
                </p>

                {/* Action CTAs */}
                <div className="flex flex-wrap items-center gap-4 pt-2 w-full sm:w-auto">
                  <button
                    className="shimmer-btn inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white font-headline-sm font-semibold text-sm shadow-[0_8px_25px_rgba(16,185,129,0.35)] hover:shadow-[0_12px_40px_rgba(16,185,129,0.5)] active:scale-95 group transition-all"
                    onClick={() => openAuth('signup')}
                  >
                    <span>Create your workspace</span>
                    <span className="material-symbols-outlined text-[18px] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                      north_east
                    </span>
                  </button>
                  <a
                    className="interactive-press inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl crystal-panel text-slate-800 font-headline-sm font-semibold text-sm hover:bg-white hover:border-cyan-300 hover:shadow-md transition-all active:scale-95 group"
                    href="#interactive-preview"
                  >
                    <span>Take a look inside</span>
                    <span className="material-symbols-outlined text-[18px] text-cyan-600 transition-transform duration-300 group-hover:translate-y-1">
                      south
                    </span>
                  </a>
                </div>

                {/* Trust Badges */}
                <div className="flex items-center gap-6 pt-1 text-slate-600 text-xs font-medium">
                  <div className="flex items-center gap-2 group cursor-pointer transition-transform duration-200 hover:translate-x-1">
                    <span className="material-symbols-outlined text-emerald-600 text-[18px] transition-transform duration-300 group-hover:scale-125">
                      verified
                    </span>
                    <span className="group-hover:text-slate-900 transition-colors">Built for students</span>
                  </div>
                  <div className="flex items-center gap-2 group cursor-pointer transition-transform duration-200 hover:translate-x-1">
                    <span className="material-symbols-outlined text-cyan-600 text-[18px] transition-transform duration-300 group-hover:scale-125">
                      supervisor_account
                    </span>
                    <span className="group-hover:text-slate-900 transition-colors">Connected with mentors</span>
                  </div>
                </div>

                {/* Glass Stat Banner */}
                <div className="interactive-press w-full mt-2 p-3.5 rounded-2xl crystal-panel flex items-center gap-3.5 transition-all hover:bg-white/95 hover:border-cyan-300 hover:shadow-md cursor-pointer group">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-100 to-cyan-100 border border-emerald-200/60 flex items-center justify-center text-emerald-700 shrink-0 shadow-sm transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110">
                    <span className="material-symbols-outlined text-[20px]">auto_stories</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-headline-sm text-xs font-bold text-slate-800 group-hover:text-cyan-800 transition-colors">
                      From first idea to final presentation.
                    </span>
                    <span className="font-body-sm text-xs text-slate-500">
                      Planning • Evidence • Feedback • All connected.
                    </span>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Interactive Cockpit Showcase with 3D Tilt */}
              <div className="lg:col-span-7 relative z-10 w-full fade-in-2" id="interactive-preview">
                {/* Outer Holographic Prismatic Aura Glow */}
                <div className="absolute -inset-2 bg-gradient-to-tr from-emerald-400/25 via-[#00f2fe]/25 to-violet-400/30 rounded-3xl blur-2xl opacity-80 animate-glow" />

                {/* Crystalline Glass Cockpit Window Container */}
                <div
                  ref={missionCardRef}
                  onMouseMove={handleMissionCardMouseMove}
                  onMouseLeave={handleMissionCardMouseLeave}
                  className="relative rounded-2xl crystal-panel console-panel-glow border border-white/95 shadow-[0_20px_55px_rgba(15,23,42,0.09),0_0_30px_rgba(56,189,248,0.2)] overflow-hidden transition-all duration-300"
                  id="mission-control-card"
                >
                  {/* Specular Highlight Flare */}
                  <div className="mission-specular-flare" />

                  {/* Window Bar */}
                  <div className="px-5 py-3 bg-white/80 border-b border-slate-200/60 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-rose-400/90 inline-block shadow-sm transition-transform hover:scale-125 cursor-pointer" />
                      <span className="h-3 w-3 rounded-full bg-amber-400/90 inline-block shadow-sm transition-transform hover:scale-125 cursor-pointer" />
                      <span className="h-3 w-3 rounded-full bg-emerald-400/90 inline-block shadow-sm transition-transform hover:scale-125 cursor-pointer" />
                      <div className="h-4 w-px bg-slate-300 mx-2" />
                      <span className="font-headline-sm text-xs font-medium text-slate-600 tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[15px] text-cyan-600 animate-pulse">terminal</span>
                        placepms / your-workspace
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div
                        className="interactive-press cursor-pointer hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-headline-sm text-[11px] font-semibold border border-slate-200 hover:bg-white hover:text-slate-900 hover:border-cyan-300 transition-all"
                        onClick={() => showToast('Command Palette Active', 'Press ⌘K anytime to filter repositories, capstones, and dossiers.')}
                      >
                        <span className="material-symbols-outlined text-[13px]">search</span>
                        <span>⌘K Search</span>
                      </div>
                      <div
                        className="interactive-press cursor-pointer flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-headline-sm text-[11px] font-bold border border-emerald-200 hover:bg-emerald-100 transition-all shadow-xs"
                        onClick={() => showToast('Live Matrix Synchronized', 'Telemetry node pinged across 240+ academic pipelines.')}
                      >
                        <span className="relative flex h-2 w-2">
                          <span className="radar-pulse-ring" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        <span>Live Matrix</span>
                      </div>
                    </div>
                  </div>

                  {/* Internal Cockpit Work Area */}
                  <div className="p-6 md:p-8 flex flex-col gap-6 bg-gradient-to-b from-white/60 to-slate-50/60">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <span className="font-headline-sm text-[11px] font-bold text-emerald-600 tracking-widest uppercase">
                          YOUR MISSION CONTROL
                        </span>
                        <h3 className="font-headline-lg text-2xl font-bold text-slate-900 tracking-tight">
                          A little progress. A big future.
                        </h3>
                      </div>

                      {/* Student Avatar Pill */}
                      <div className="interactive-press cursor-pointer flex items-center gap-3 self-start sm:self-auto bg-white/90 border border-slate-200/80 px-3.5 py-1.5 rounded-full shadow-sm hover:border-cyan-300 hover:shadow-md transition-all">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white font-headline-sm text-xs font-bold shadow-sm ring-2 ring-cyan-200">
                          JD
                        </div>
                        <div className="flex flex-col pr-1">
                          <span className="font-headline-sm text-xs font-bold text-slate-800 leading-tight">Jayesh D.</span>
                          <span className="font-headline-sm text-[10px] font-semibold text-emerald-600">CS Senior • Placed</span>
                        </div>
                      </div>
                    </div>

                    {/* Cyber Workspace Tabs */}
                    <div className="relative flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/70 border border-slate-300/40 w-fit">
                      {(['overview', 'tasks', 'tools'] as const).map(tabKey => {
                        const label = tabKey === 'overview' ? 'Overview' : tabKey === 'tasks' ? 'Milestones' : 'Connected tools';
                        const isActive = preview === tabKey;
                        return (
                          <button
                            key={tabKey}
                            className={`relative z-10 px-3.5 py-1 rounded-lg font-headline-sm text-xs transition-all duration-200 ${
                              isActive
                                ? 'text-cyan-800 font-bold shadow-sm bg-white scale-105'
                                : 'text-slate-600 hover:text-slate-900 font-medium hover:bg-white/50'
                            }`}
                            onClick={() => {
                              setPreview(tabKey);
                              setTourPlaying(false);
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Cockpit Dynamic Views */}
                    <AnimatePresence mode="wait">
                      {preview === 'overview' ? (
                        <motion.div
                          key="cockpit-overview"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="flex flex-col gap-5"
                        >
                          {/* 3 Metric Cards */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="metric-card-interactive p-4 rounded-xl bg-white/85 border border-slate-200/80 cursor-pointer shadow-sm group">
                              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                                <span className="font-headline-sm text-[11px] font-bold tracking-wider uppercase text-slate-500 group-hover:text-slate-700 transition-colors">
                                  Active projects
                                </span>
                                <span className="material-symbols-outlined text-[16px] text-emerald-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
                                  north_east
                                </span>
                              </div>
                              <div className="flex items-baseline gap-2">
                                <span className="metric-number font-code-metric text-3xl font-extrabold text-slate-900 transition-colors">03</span>
                                <span className="font-headline-sm text-[11px] font-bold text-emerald-700 bg-emerald-100/70 border border-emerald-200 px-1.5 py-0.5 rounded-md halo-breathe-indicator">
                                  +1 this week
                                </span>
                              </div>
                            </div>

                            <div className="metric-card-interactive p-4 rounded-xl bg-white/85 border border-slate-200/80 cursor-pointer shadow-sm group">
                              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                                <span className="font-headline-sm text-[11px] font-bold tracking-wider uppercase text-slate-500 group-hover:text-slate-700 transition-colors">
                                  Milestones delivered
                                </span>
                                <span className="material-symbols-outlined text-[16px] text-cyan-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
                                  north_east
                                </span>
                              </div>
                              <div className="flex items-baseline gap-2">
                                <span className="metric-number font-code-metric text-3xl font-extrabold text-slate-900 transition-colors">08</span>
                                <span className="font-headline-sm text-[11px] font-bold text-cyan-700 bg-cyan-100/70 border border-cyan-200 px-1.5 py-0.5 rounded-md halo-breathe-indicator">
                                  100% verified
                                </span>
                              </div>
                            </div>

                            <div className="metric-card-interactive p-4 rounded-xl bg-white/85 border border-slate-200/80 cursor-pointer shadow-sm group">
                              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                                <span className="font-headline-sm text-[11px] font-bold tracking-wider uppercase text-slate-500 group-hover:text-slate-700 transition-colors">
                                  Team members
                                </span>
                                <span className="material-symbols-outlined text-[16px] text-violet-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
                                  north_east
                                </span>
                              </div>
                              <div className="flex items-baseline gap-2">
                                <span className="metric-number font-code-metric text-3xl font-extrabold text-slate-900 transition-colors">04</span>
                                <span className="font-headline-sm text-[11px] font-bold text-violet-700 bg-violet-100/70 border border-violet-200 px-1.5 py-0.5 rounded-md halo-breathe-indicator">
                                  Active now
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Split: Momentum Chart & Featured Project */}
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                            {/* SVG Chart */}
                            <div className="md:col-span-7 p-4 rounded-xl bg-white/85 border border-slate-200/80 flex flex-col justify-between shadow-sm hover:border-cyan-300 hover:shadow-md transition-all group relative">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-headline-sm text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[16px] text-cyan-600 group-hover:rotate-12 transition-transform">trending_up</span>
                                  Project momentum
                                </span>
                                <span className="interactive-press cursor-pointer font-headline-sm text-[11px] text-slate-500 hover:text-cyan-700 font-semibold flex items-center gap-0.5 transition-colors">
                                  This week <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                                </span>
                              </div>

                              <div className="relative w-full h-32 my-1 cursor-crosshair">
                                {activeChartPoint && (
                                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-slate-900 text-white font-headline-sm text-[10px] pointer-events-none shadow-lg z-20 flex items-center gap-1">
                                    <span>Checkpoint:</span> <span className="font-bold text-cyan-300">{activeChartPoint}</span>
                                  </div>
                                )}
                                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 340 120">
                                  <defs>
                                    <linearGradient id="lightMomentumGrad" x1="0" x2="0" y1="0" y2="1">
                                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                                      <stop offset="60%" stopColor="#10b981" stopOpacity="0.12" />
                                      <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
                                    </linearGradient>
                                    <filter height="140%" id="chartGlowLight" width="140%" x="-20%" y="-20%">
                                      <feDropShadow dx="0" dy="2" floodColor="#00f2fe" floodOpacity="0.45" stdDeviation="3" />
                                    </filter>
                                  </defs>
                                  <line stroke="#e2e8f0" strokeDasharray="3,3" strokeWidth="1" x1="0" x2="340" y1="30" y2="30" />
                                  <line stroke="#e2e8f0" strokeDasharray="3,3" strokeWidth="1" x1="0" x2="340" y1="70" y2="70" />
                                  <line stroke="#cbd5e1" strokeWidth="1" x1="0" x2="340" y1="110" y2="110" />
                                  <path d="M 0,95 Q 40,88 80,75 T 160,50 T 240,65 T 300,28 L 340,20 L 340,115 L 0,115 Z" fill="url(#lightMomentumGrad)" />
                                  <path className="animated-chart-line" d="M 0,95 Q 40,88 80,75 T 160,50 T 240,65 T 300,28 L 340,20" fill="none" filter="url(#chartGlowLight)" stroke="#0891b2" strokeWidth="2.5" />
                                  <circle className="chart-beacon cursor-pointer" cx="340" cy="20" fill="#059669" onMouseEnter={() => setActiveChartPoint('98.2% Velocity Peak')} onMouseLeave={() => setActiveChartPoint(null)} />
                                  <circle className="cursor-pointer transition-transform hover:scale-150" cx="160" cy="50" fill="#06b6d4" r="3.5" onMouseEnter={() => setActiveChartPoint('Sprint 2: 76%')} onMouseLeave={() => setActiveChartPoint(null)} />
                                  <circle className="cursor-pointer transition-transform hover:scale-150" cx="240" cy="65" fill="#0284c7" r="3.5" onMouseEnter={() => setActiveChartPoint('Git Review: 84%')} onMouseLeave={() => setActiveChartPoint(null)} />
                                  <circle className="cursor-pointer transition-transform hover:scale-150" cx="300" cy="28" fill="#10b981" r="3.5" onMouseEnter={() => setActiveChartPoint('Mentor Viva: 92%')} onMouseLeave={() => setActiveChartPoint(null)} />
                                </svg>

                                <div className="interactive-press absolute top-1 right-2 px-2.5 py-0.5 rounded-full bg-white/95 border border-emerald-200 shadow-sm font-headline-sm text-[11px] font-bold text-emerald-700 flex items-center gap-1 cursor-pointer hover:border-emerald-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                                  <span>94.8% Target Velocity</span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-slate-400 font-headline-sm text-[10px] font-bold px-1 pt-1">
                                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                                  <span key={i} className={`cursor-pointer transition-colors ${i >= 5 ? 'text-emerald-700 font-extrabold' : 'hover:text-slate-700'}`}>
                                    {day}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Featured Project Card */}
                            <div className="md:col-span-5 p-4 rounded-xl bg-white/85 border border-slate-200/80 flex flex-col justify-between shadow-sm transition-all duration-300 hover:scale-[1.02] hover:bg-white hover:border-cyan-300 hover:shadow-md cursor-pointer group">
                              <div className="flex items-center justify-between">
                                <span className="font-headline-sm text-[10px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-slate-700 transition-colors">
                                  Featured project
                                </span>
                                <span className="p-1 rounded-lg bg-cyan-50 text-cyan-600 border border-cyan-200 transition-transform duration-300 group-hover:rotate-12 group-hover:bg-cyan-100">
                                  <span className="material-symbols-outlined text-[15px]">folder_special</span>
                                </span>
                              </div>

                              <div className="my-2">
                                <h4 className="font-headline-sm text-sm font-bold text-slate-900 group-hover:text-cyan-800 transition-colors">
                                  Something extraordinary.
                                </h4>
                                <p className="font-body-sm text-xs text-slate-500 truncate">
                                  Decentralized credentialing engine
                                </p>
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <div className="flex justify-between items-center font-headline-sm text-[11px]">
                                  <span className="text-slate-500">Milestone Sprint</span>
                                  <span className="text-emerald-600 font-bold group-hover:scale-105 transition-transform">82%</span>
                                </div>
                                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex border border-slate-200/60 shadow-inner">
                                  <div className="h-full bg-emerald-500 rounded-l-full shadow-sm" style={{ width: '55%' }} />
                                  <div className="h-full bg-cyan-500" style={{ width: '20%' }} />
                                  <div className="h-full bg-indigo-500" style={{ width: '7%' }} />
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-2.5">
                                <div className="flex -space-x-1.5">
                                  <div className="h-6 w-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-headline-sm text-[9px] font-bold ring-2 ring-white hover:scale-125 hover:z-10 cursor-pointer shadow-xs">JD</div>
                                  <div className="h-6 w-6 rounded-full bg-cyan-600 text-white flex items-center justify-center font-headline-sm text-[9px] font-bold ring-2 ring-white hover:scale-125 hover:z-10 cursor-pointer shadow-xs">AK</div>
                                  <div className="h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-headline-sm text-[9px] font-bold ring-2 ring-white hover:scale-125 hover:z-10 cursor-pointer shadow-xs">SR</div>
                                </div>
                                <span className="font-headline-sm text-[11px] font-semibold text-slate-500 flex items-center gap-1 group-hover:text-slate-700 transition-colors">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 halo-breathe-indicator" />
                                  Building together
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ) : preview === 'tasks' ? (
                        <motion.div
                          key="cockpit-tasks"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="flex flex-col gap-3 p-2"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-headline-sm text-sm font-bold text-slate-800">From idea to done.</h4>
                            <span className="text-xs font-semibold text-cyan-700 bg-cyan-50 px-2.5 py-0.5 rounded-full border border-cyan-200">
                              3 milestones in sprint
                            </span>
                          </div>
                          {[
                            { title: 'Define the direction', label: 'Discovery & Scope', status: 'Approved', done: true },
                            { title: 'Build the first version', label: 'Implementation & Commits', status: 'In Review', done: false, active: true },
                            { title: 'Present your work', label: 'Dossier & Viva Deck', status: 'Up Next', done: false }
                          ].map((t, idx) => (
                            <div
                              key={t.title}
                              className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                                t.done
                                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                                  : t.active
                                  ? 'bg-cyan-50/80 border-cyan-300 text-cyan-950 shadow-sm'
                                  : 'bg-white/80 border-slate-200/80 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className={`h-7 w-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                                  t.done ? 'bg-emerald-500 text-white shadow-xs' : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {t.done ? <Check size={14} /> : `0${idx + 1}`}
                                </span>
                                <div className="flex flex-col">
                                  <strong className="font-headline-sm text-xs">{t.title}</strong>
                                  <small className="font-body-sm text-[11px] opacity-75">{t.label}</small>
                                </div>
                              </div>
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                t.done
                                  ? 'bg-emerald-200/80 text-emerald-800'
                                  : t.active
                                  ? 'bg-cyan-200/80 text-cyan-800 animate-pulse'
                                  : 'bg-slate-100 text-slate-500'
                              }`}>
                                {t.status}
                              </span>
                            </div>
                          ))}
                        </motion.div>
                      ) : (
                        <motion.div
                          key="cockpit-tools"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="flex flex-col gap-3 p-2"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-headline-sm text-sm font-bold text-slate-800">Your tools. One orbit.</h4>
                            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                              3 synchronized integrations
                            </span>
                          </div>
                          {[
                            { icon: Github, name: 'GitHub Repositories', desc: 'Code, branches & automated audit trails' },
                            { icon: Layers3, name: 'Figma Design Boards', desc: 'Interactive prototypes & component specs' },
                            { icon: LayoutDashboard, name: 'Miro Strategy Maps', desc: 'Sprint planning & user flow diagrams' }
                          ].map(tool => {
                            const ToolIcon = tool.icon;
                            return (
                              <div
                                key={tool.name}
                                className="p-3.5 rounded-xl bg-white/85 border border-slate-200/80 flex items-center justify-between hover:border-cyan-300 hover:shadow-sm transition-all"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 border border-slate-200">
                                    <ToolIcon size={20} />
                                  </div>
                                  <div className="flex flex-col">
                                    <strong className="font-headline-sm text-xs text-slate-900">{tool.name}</strong>
                                    <span className="font-body-sm text-[11px] text-slate-500">{tool.desc}</span>
                                  </div>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  Linked
                                </span>
                              </div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Window Footer Status */}
                    <div className="flex items-center justify-between text-slate-500 font-headline-sm text-[11px] pt-1 border-t border-slate-200/60">
                      <span className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="radar-pulse-ring" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                        </span>
                        Your next career chapter is in motion
                      </span>
                      <span
                        className="italic text-slate-400 font-medium hover:text-slate-600 transition-colors cursor-pointer"
                        onClick={() => showToast('PlacePMS v4.2.0', 'Continuous zero-friction synchronization build.')}
                      >
                        Autonomous sync v4.2.0
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 7. Bottom Control Bar: Auto-Tour & Navigation Breadcrumbs */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-6 rounded-2xl crystal-panel mb-16 shadow-sm hover:shadow-md hover:border-cyan-300 transition-all fade-in-3">
              <div className="flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="radar-pulse-ring" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                </span>
                <p className="font-body-md text-sm text-slate-700 font-medium">
                  Explore. Click around. Make your academic journey undeniably visible.
                </p>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2" id="tour-dots">
                  {previews.map(tab => (
                    <span
                      key={tab}
                      className={`cursor-pointer transition-all ${
                        preview === tab
                          ? 'h-2 w-6 rounded-full bg-emerald-500 shadow-xs'
                          : 'h-2 w-2 rounded-full bg-slate-300 hover:bg-slate-500 hover:scale-125'
                      }`}
                      onClick={() => {
                        setPreview(tab);
                        setTourPlaying(false);
                      }}
                    />
                  ))}
                </div>

                <button
                  className={`interactive-press inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-headline-sm text-xs font-semibold border transition-all shadow-sm active:scale-95 group ${
                    tourPlaying
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                  }`}
                  onClick={() => setTourPlaying(!tourPlaying)}
                >
                  <span className={`material-symbols-outlined text-[16px] transition-transform duration-300 ${tourPlaying ? 'text-white animate-spin' : 'text-emerald-600 group-hover:rotate-45'}`}>
                    motion_photos_on
                  </span>
                  <span>{tourPlaying ? 'Tour Playing' : 'Auto tour'}</span>
                </button>

                <button
                  className="interactive-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-headline-sm text-xs font-medium border border-slate-200 bg-white/80 text-slate-600 hover:text-slate-900 transition-all"
                  onClick={() => {
                    const next = !paused;
                    setPaused(next);
                    try { localStorage.setItem('placepms-home-motion', next ? 'paused' : 'playing'); } catch { /* ignore */ }
                  }}
                  title={paused ? 'Resume ambient shaders and animations' : 'Pause ambient shaders and animations'}
                >
                  {paused ? <Play size={13} className="text-emerald-600" /> : <Pause size={13} className="text-slate-400" />}
                  <span>{paused ? 'Resume Motion' : 'Pause Motion'}</span>
                </button>
              </div>
            </div>

            {/* 8. THREE CORE PILLARS SECTION */}
            <div className="flex flex-col gap-8 fade-in-4 mb-20">
              <div className="flex flex-col gap-2 max-w-xl">
                <span className="font-headline-sm text-xs text-emerald-600 uppercase tracking-widest font-bold">
                  THE ACADEMIC ENGINE
                </span>
                <h2 className="font-headline-xl text-3xl sm:text-4xl text-slate-900 font-extrabold tracking-tight">
                  Engineered for absolute placement velocity.
                </h2>
                <p className="font-body-md text-slate-600 text-sm sm:text-base">
                  Seamless synchronization across milestones, repositories, and prospective recruitment pipelines.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Pillar Card 1 */}
                <div
                  className="pillar-card p-6 md:p-8 rounded-2xl crystal-panel flex flex-col justify-between gap-8 cursor-pointer group"
                  onClick={() => {
                    const el = document.getElementById('features');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="pillar-icon h-12 w-12 rounded-xl bg-gradient-to-tr from-cyan-100 to-sky-100 border border-cyan-200 flex items-center justify-center text-cyan-700 shadow-sm transition-all duration-300">
                        <span className="material-symbols-outlined text-[24px]">grid_view</span>
                      </div>
                      <span className="pillar-arrow material-symbols-outlined text-[20px] text-slate-400 group-hover:text-cyan-600 transition-transform duration-300">
                        arrow_forward
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <h3 className="font-headline-md text-xl text-slate-900 font-bold group-hover:text-cyan-800 transition-colors">
                        Plan with clarity
                      </h3>
                      <p className="font-body-sm text-xs text-cyan-700 font-semibold">
                        Give every idea a direction.
                      </p>
                    </div>
                    <p className="font-body-md text-slate-600 text-sm leading-relaxed">
                      Break complex senior capstones and term projects into kanban timelines, sprint cycles, and automated milestone roadmaps that eliminate last-minute crunch.
                    </p>
                  </div>
                  <div className="interactive-press p-2.5 rounded-xl bg-slate-100/80 border border-slate-200/70 flex items-center gap-2.5 transition-all group-hover:bg-cyan-50/70 group-hover:border-cyan-200">
                    <div className="h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_6px_#06b6d4] animate-pulse" />
                    <span className="font-headline-sm text-xs font-semibold text-slate-700 group-hover:text-cyan-900 transition-colors">
                      Sprint #4 Roadmap • 92% Complete
                    </span>
                  </div>
                </div>

                {/* Pillar Card 2 */}
                <div
                  className="pillar-card p-6 md:p-8 rounded-2xl crystal-panel flex flex-col justify-between gap-8 cursor-pointer group"
                  onClick={() => {
                    const el = document.getElementById('automation');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="pillar-icon h-12 w-12 rounded-xl bg-gradient-to-tr from-emerald-100 to-teal-100 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-sm transition-all duration-300">
                        <span className="material-symbols-outlined text-[24px]">account_tree</span>
                      </div>
                      <span className="pillar-arrow material-symbols-outlined text-[20px] text-slate-400 group-hover:text-emerald-600 transition-transform duration-300">
                        arrow_forward
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <h3 className="font-headline-md text-xl text-slate-900 font-bold group-hover:text-emerald-800 transition-colors">
                        Build with evidence
                      </h3>
                      <p className="font-body-sm text-xs text-emerald-700 font-semibold">
                        Keep your tools in the loop.
                      </p>
                    </div>
                    <p className="font-body-md text-slate-600 text-sm leading-relaxed">
                      Continuous cryptographic verification of code commits, design assets, and mentor reviews. Every line of work automatically translates into indisputable proof of capability.
                    </p>
                  </div>
                  <div className="interactive-press p-2.5 rounded-xl bg-slate-100/80 border border-slate-200/70 flex items-center gap-2.5 transition-all group-hover:bg-emerald-50/70 group-hover:border-emerald-200">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981] animate-pulse" />
                    <span className="font-headline-sm text-xs font-semibold text-slate-700 group-hover:text-emerald-900 transition-colors">
                      Git sync • 14 verified commits logged
                    </span>
                  </div>
                </div>

                {/* Pillar Card 3 */}
                <div
                  className="pillar-card p-6 md:p-8 rounded-2xl crystal-panel flex flex-col justify-between gap-8 cursor-pointer group"
                  onClick={() => {
                    const el = document.getElementById('how-it-works');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="pillar-icon h-12 w-12 rounded-xl bg-gradient-to-tr from-violet-100 to-purple-100 border border-violet-200 flex items-center justify-center text-violet-700 shadow-sm transition-all duration-300">
                        <span className="material-symbols-outlined text-[24px]">co_present</span>
                      </div>
                      <span className="pillar-arrow material-symbols-outlined text-[20px] text-slate-400 group-hover:text-violet-600 transition-transform duration-300">
                        arrow_forward
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <h3 className="font-headline-md text-xl text-slate-900 font-bold group-hover:text-violet-800 transition-colors">
                        Present with confidence
                      </h3>
                      <p className="font-body-sm text-xs text-violet-700 font-semibold">
                        Make your progress worth showing.
                      </p>
                    </div>
                    <p className="font-body-md text-slate-600 text-sm leading-relaxed">
                      One-click dynamic viva slides, placement-ready dossier exports, and verifiable recruiter portals designed specifically to fast-track hiring decisions.
                    </p>
                  </div>
                  <div className="interactive-press p-2.5 rounded-xl bg-slate-100/80 border border-slate-200/70 flex items-center gap-2.5 transition-all group-hover:bg-violet-50/70 group-hover:border-violet-200">
                    <div className="h-2 w-2 rounded-full bg-violet-500 shadow-[0_0_6px_#8b5cf6] animate-pulse" />
                    <span className="font-headline-sm text-xs font-semibold text-slate-700 group-hover:text-violet-900 transition-colors">
                      Placement dossier • Ready for review
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 9. IDEA PLANNER SECTION */}
            <Suspense fallback={
              <section id="idea-planner" className="home-section py-16" aria-busy="true">
                <div className="crystal-panel p-8 rounded-3xl text-center">
                  <span className="font-headline-sm text-xs text-emerald-600 uppercase font-bold">Idea → Workspace</span>
                  <h2 className="font-headline-lg text-2xl font-bold mt-2">Loading the idea planner…</h2>
                </div>
              </section>
            }>
              <HomeIdeaPlanner onOpenAuth={openAuth} motionPaused={frozen} />
            </Suspense>

            {/* 10. FEATURES BENTO SECTION */}
            <section id="features" className="home-section py-16">
              <Reveal className="home-section-heading mb-10">
                <div className="flex flex-col gap-2 max-w-xl">
                  <span className="font-headline-sm text-xs text-emerald-600 uppercase tracking-widest font-bold">
                    Everything in your orbit
                  </span>
                  <h2 className="font-headline-xl text-3xl sm:text-4xl text-slate-900 font-extrabold tracking-tight">
                    Less switching.<br />
                    <span>More creating.</span>
                  </h2>
                  <p className="font-body-md text-slate-600 text-sm sm:text-base">
                    A home for every part of your project. Thoughtfully connected. Beautifully simple.
                  </p>
                </div>
              </Reveal>

              <div className="home-bento">
                <Reveal className="home-feature home-feature-projects">
                  <div className="home-feature-top">
                    <span className="home-icon"><FolderKanban size={20} /></span>
                    <span className="font-headline-sm text-xs font-bold text-slate-600">01 / Projects</span>
                    <ArrowUpRight size={17} />
                  </div>
                  <h3 className="font-headline-md text-xl font-bold mt-2">Give your idea a home.</h3>
                  <p className="font-body-md text-slate-600 text-sm">Your team, mentor, and plan. Together.</p>
                  <div className="home-project-stack" aria-hidden="true">
                    <div className="home-stack-card home-stack-back"><span /><span /></div>
                    <div className="home-stack-card home-stack-middle"><span /><span /></div>
                    <div className="home-stack-card home-stack-front">
                      <div><span className="home-live-dot" /><span>THE NEXT BIG THING</span><FolderKanban size={18} /></div>
                      <strong>Built by you.</strong>
                      <div className="home-stack-tags"><span>Design</span><span>Build</span><span>Launch</span></div>
                      <div className="home-mini-progress"><span /></div>
                    </div>
                  </div>
                </Reveal>

                <Reveal className="home-feature home-feature-milestones" delay={0.08}>
                  <div className="home-feature-top">
                    <span className="home-icon"><CheckCircle2 size={20} /></span>
                    <span className="font-headline-sm text-xs font-bold text-slate-600">02 / Momentum</span>
                    <ArrowUpRight size={17} />
                  </div>
                  <h3 className="font-headline-md text-xl font-bold mt-2">Small wins. Big moves.</h3>
                  <p className="font-body-md text-slate-600 text-sm">Milestones and feedback that move you forward.</p>
                  <div className="home-feature-timeline" aria-hidden="true">
                    {['Idea mapped', 'First version built', 'Ready for review'].map((label, index) => (
                      <div key={label}>
                        <span>{index < 2 ? <Check size={13} /> : <span className="home-live-dot" />}</span>
                        <strong>{label}</strong>
                        <small>{index < 2 ? 'Done' : 'Next up'}</small>
                      </div>
                    ))}
                  </div>
                </Reveal>

                <Reveal className="home-feature home-feature-tools">
                  <div className="home-feature-top">
                    <span className="home-icon"><Orbit size={20} /></span>
                    <span className="font-headline-sm text-xs font-bold text-slate-600">03 / Connections</span>
                    <ArrowUpRight size={17} />
                  </div>
                  <h3 className="font-headline-md text-xl font-bold mt-2">Your tools, in sync.</h3>
                  <p className="font-body-md text-slate-600 text-sm">GitHub. Figma. Miro. Right where you work.</p>
                  <div className="home-tools-orbit" aria-hidden="true">
                    <div className="home-tools-ring" />
                    <span className="home-tools-core"><Orbit size={28} /></span>
                    <span className="home-orbit-node home-orbit-github"><Github size={25} /></span>
                    <span className="home-orbit-node home-orbit-figma"><Layers3 size={24} /></span>
                    <span className="home-orbit-node home-orbit-miro"><LayoutDashboard size={24} /></span>
                    <span className="home-orbit-particle" />
                  </div>
                </Reveal>

                <Reveal className="home-feature home-feature-story" delay={0.08}>
                  <div className="home-feature-top">
                    <span className="home-icon"><BookOpen size={20} /></span>
                    <span className="font-headline-sm text-xs font-bold text-slate-600">04 / Your story</span>
                    <ArrowUpRight size={17} />
                  </div>
                  <h3 className="font-headline-md text-xl font-bold mt-2">Work worth showing.</h3>
                  <p className="font-body-md text-slate-600 text-sm">Research to Blackbook. Project to portfolio.</p>
                  <div className="home-story-visual" aria-hidden="true">
                    <div className="home-story-sheet">
                      <span>PLACEPMS / BLACKBOOK</span>
                      <BookOpen size={30} />
                      <strong>Your work.<br />Your next chapter.</strong>
                      <div /><div />
                      <small>AUTHORED BY YOU</small>
                    </div>
                    <span className="home-story-chip"><FileText size={14} /> Ready to present <Sparkles size={14} /></span>
                  </div>
                </Reveal>
              </div>
            </section>

            {/* 11. AUTOMATION STUDIO SECTION */}
            <Suspense fallback={
              <section id="automation" className="home-section py-16" aria-busy="true">
                <div className="crystal-panel p-8 rounded-3xl text-center">
                  <span className="font-headline-sm text-xs text-emerald-600 uppercase font-bold">Automation Studio</span>
                  <h2 className="font-headline-lg text-2xl font-bold mt-2">Loading workflow engine…</h2>
                </div>
              </section>
            }>
              <HomeAutomation motionPaused={frozen} />
            </Suspense>

            {/* 12. THE JOURNEY SECTION */}
            <section id="how-it-works" className="home-section py-16">
              <div className="home-journey-grid">
                <Reveal>
                  <div className="flex flex-col gap-2 max-w-xl mb-8">
                    <span className="font-headline-sm text-xs text-emerald-600 uppercase tracking-widest font-bold">
                      The journey
                    </span>
                    <h2 className="font-headline-xl text-3xl sm:text-4xl text-slate-900 font-extrabold tracking-tight">
                      From “what if”<br />
                      <span>to “we did it”.</span>
                    </h2>
                  </div>
                  <div className="home-journey-steps" aria-label="Explore the project journey">
                    {workflow.map((item, index) => (
                      <button
                        key={item.title}
                        aria-pressed={step === index}
                        onClick={() => setStep(index)}
                        className="crystal-panel transition-all duration-200"
                      >
                        <span className="font-headline-sm font-bold">0{index + 1}</span>
                        <div>
                          <strong className="font-headline-sm">{item.title}</strong>
                          <small className="font-body-sm">{item.description}</small>
                        </div>
                        <ArrowUpRight size={18} />
                      </button>
                    ))}
                  </div>
                </Reveal>

                <Reveal className="home-journey-visual">
                  <div className="home-journey-orbits" aria-hidden="true"><i /><i /><i /></div>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={step}
                      className="home-journey-center"
                      initial={frozen ? false : { opacity: 0, scale: 0.93, rotateY: -12 }}
                      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                      exit={{ opacity: 0, scale: 0.97, rotateY: 12 }}
                      transition={{ duration: frozen ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <span className="home-journey-icon"><StepIcon size={37} /></span>
                      <span className="home-eyebrow font-headline-sm">CHAPTER 0{step + 1}</span>
                      <h3 className="font-headline-lg text-2xl font-bold mt-1">{currentStep.caption}</h3>
                      <div className="home-journey-tags mt-3">{currentStep.tags.map(tag => <span key={tag} className="font-headline-sm text-xs">{tag}</span>)}</div>
                    </motion.div>
                  </AnimatePresence>
                  <span className="home-journey-coordinate font-headline-sm" aria-hidden="true">IDEA / BUILD / IMPACT</span>
                </Reveal>
              </div>
            </section>

            {/* 13. AUDIENCE SECTION */}
            <HomeAudience onOpenAuth={openAuth} />

            {/* 14. TEAM SECTION */}
            <HomeTeam motionPaused={frozen} />

            {/* 15. FAQ SECTION */}
            <section id="faq" className="home-section py-16">
              <div className="home-faq-grid">
                <Reveal className="home-section-heading">
                  <div className="flex flex-col gap-2">
                    <span className="font-headline-sm text-xs text-emerald-600 uppercase tracking-widest font-bold">
                      A few useful answers
                    </span>
                    <h2 className="font-headline-xl text-3xl font-extrabold text-slate-900 tracking-tight">
                      Before liftoff.
                    </h2>
                    <p className="font-body-md text-slate-600 text-sm sm:text-base">
                      Find your answer and get back to your next big idea.
                    </p>
                  </div>
                </Reveal>

                <Reveal className="home-faq">
                  <div className="home-faq-search mb-4">
                    <Search size={17} />
                    <input
                      type="search"
                      aria-label="Search frequently asked questions"
                      placeholder="Search questions…"
                      value={faqQuery}
                      onChange={e => setFaqQuery(e.target.value)}
                      className="font-body-md"
                    />
                    {faqQuery && (
                      <button aria-label="Clear FAQ search" onClick={() => setFaqQuery('')}>
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  <p className="font-headline-sm text-xs text-slate-500 mb-3" role="status">
                    {filteredFaq.length} {filteredFaq.length === 1 ? 'answer' : 'answers'} to explore
                  </p>

                  {filteredFaq.map(([question, answer]) => (
                    <details key={question} className="crystal-panel">
                      <summary className="font-headline-sm font-semibold flex items-center justify-between cursor-pointer">
                        {question}
                        <Plus size={18} />
                      </summary>
                      <p className="font-body-md text-slate-600 mt-2 text-sm leading-relaxed">{answer}</p>
                    </details>
                  ))}

                  {!filteredFaq.length && (
                    <div className="crystal-panel p-8 text-center rounded-2xl flex flex-col items-center gap-2">
                      <Search size={24} className="text-slate-400" />
                      <h3 className="font-headline-md text-base font-bold text-slate-800">No matching answers.</h3>
                      <p className="font-body-sm text-xs text-slate-500">Try “mentor”, “report”, or “calendar”.</p>
                      <button className="shimmer-btn px-4 py-2 rounded-xl bg-cyan-600 text-white text-xs font-semibold mt-2" onClick={() => setFaqQuery('')}>
                        Show all questions
                      </button>
                    </div>
                  )}
                </Reveal>
              </div>
            </section>

            {/* 16. RECRUITER VELOCITY METRIC CALLOUT */}
            <div className="mt-16 p-8 md:p-12 rounded-3xl crystal-panel border border-white/95 relative overflow-hidden shadow-lg transition-all duration-300 hover:shadow-2xl hover:border-cyan-300 group">
              <div className="absolute -right-10 -bottom-10 w-80 h-80 bg-gradient-to-br from-emerald-200/50 via-cyan-200/40 to-transparent rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700" />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
                <div className="lg:col-span-8 flex flex-col gap-3">
                  <span className="font-headline-sm text-xs text-emerald-600 uppercase tracking-widest font-bold flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    ACADEMIC ECOSYSTEM SYNERGY
                  </span>
                  <h3 className="font-headline-xl text-2xl sm:text-3xl lg:text-4xl text-slate-900 font-extrabold leading-tight">
                    Ready to turn collegiate effort into permanent career capital?
                  </h3>
                  <p className="font-body-md text-slate-600 max-w-xl text-sm sm:text-base">
                    Join over 45,000+ students and 240+ institutions streamlining capstone project workflows directly into campus recruitment shortlists.
                  </p>
                </div>
                <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-4 justify-center items-start lg:items-end">
                  <button
                    className="shimmer-btn w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white font-headline-sm font-bold text-sm shadow-[0_8px_30px_rgba(16,185,129,0.35)] hover:shadow-[0_12px_45px_rgba(16,185,129,0.55)] active:scale-95 group transition-all"
                    onClick={() => openAuth('signup')}
                  >
                    <span>Launch workspace</span>
                    <span className="material-symbols-outlined text-[20px] transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1">
                      rocket_launch
                    </span>
                  </button>
                  <span className="font-headline-sm text-xs text-slate-500 font-medium">
                    Zero deployment friction • Edu SSO enabled
                  </span>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* 17. HIGH-TECH LIGHT FOOTER */}
        <footer className="relative z-10 w-full crystal-panel border-t border-slate-200/80 mt-12 bg-white/70">
          <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div
                  className="flex items-center gap-2.5 group cursor-pointer interactive-press w-fit"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                >
                  <img
                    alt="PlacePMS Logo"
                    className="h-7 w-auto object-contain transition-transform duration-300 group-hover:scale-110"
                    src="/PlacePMS-Logo-Vector.svg"
                  />
                </div>
                <p className="font-body-sm text-xs text-slate-600 max-w-sm leading-relaxed">
                  Autonomous university placement operating architecture. Empowering institutions, talent pipelines, and recruit teams with predictive placement workflows.
                </p>
                <div
                  className="interactive-press inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 w-fit cursor-pointer hover:bg-emerald-100 transition-all"
                  onClick={() => showToast('Network Status: Optimal', '99.98% platform operational uptime verified.')}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="radar-pulse-ring" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                  </span>
                  <span className="font-headline-sm text-[11px] font-bold text-emerald-800">
                    Placement Network Live • 99.98% Operational
                  </span>
                </div>
              </div>

              <div>
                <p className="font-headline-sm text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Platform</p>
                <ul className="flex flex-col gap-2.5 font-body-sm text-xs">
                  <li><a className="footer-animated-link text-slate-600 hover:text-slate-900 transition-colors" href="#idea-planner">Build your idea</a></li>
                  <li><a className="footer-animated-link text-slate-600 hover:text-slate-900 transition-colors" href="#features">Features</a></li>
                  <li><a className="footer-animated-link text-slate-600 hover:text-slate-900 transition-colors" href="#automation">Automation Engine</a></li>
                  <li><a className="footer-animated-link text-slate-600 hover:text-slate-900 transition-colors" href="#how-it-works">The journey</a></li>
                </ul>
              </div>

              <div>
                <p className="font-headline-sm text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Organization</p>
                <ul className="flex flex-col gap-2.5 font-body-sm text-xs">
                  <li><a className="footer-animated-link text-slate-600 hover:text-slate-900 transition-colors" href="#team">Our team</a></li>
                  <li><a className="footer-animated-link text-slate-600 hover:text-slate-900 transition-colors" href="#faq">FAQ</a></li>
                  <li><button className="footer-animated-link text-slate-600 hover:text-slate-900 transition-colors text-left" onClick={() => showToast('Security & Compliance', 'SOC2 Type II & FERPA architecture compliant.')}>Security & Compliance</button></li>
                  <li><button className="footer-animated-link text-slate-600 hover:text-slate-900 transition-colors text-left" onClick={() => showToast('System Status', 'All regions operational. Latency 14ms.')}>System Status</button></li>
                </ul>
              </div>

              <div className="flex flex-col gap-3">
                <p className="font-headline-sm text-xs font-bold text-slate-900 uppercase tracking-wider">Stay Informed</p>
                <p className="font-body-sm text-xs text-slate-600">Receive intelligence briefs on campus hiring velocity and release cycles.</p>
                <form className="flex flex-col gap-2" onSubmit={handleNewsletterSubmit}>
                  <div className="relative flex items-center group">
                    <input
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 font-body-sm text-xs focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-200/50 shadow-sm transition-all duration-300 group-hover:border-slate-400"
                      placeholder="university.edu email"
                      type="email"
                      value={newsletterEmail}
                      onChange={e => setNewsletterEmail(e.target.value)}
                      required
                    />
                    <button
                      className="interactive-press absolute right-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 text-white font-headline-sm text-xs hover:bg-cyan-700 transition-all flex items-center justify-center shadow-sm active:scale-90"
                      type="submit"
                    >
                      <span className="material-symbols-outlined text-[15px]">send</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="font-body-sm text-xs text-slate-500">© 2026 PlacePMS Ecosystem Inc. All rights reserved.</p>
              <div className="flex items-center gap-6 font-body-sm text-xs">
                <button className="footer-animated-link text-slate-500 hover:text-slate-900 transition-colors" onClick={() => showToast('Privacy Policy', 'Data is encrypted at rest and in transit.')}>Privacy Policy</button>
                <button className="footer-animated-link text-slate-500 hover:text-slate-900 transition-colors" onClick={() => showToast('Terms of Service', 'Standard academic workspace usage terms.')}>Terms of Service</button>
                <button className="footer-animated-link text-slate-500 hover:text-slate-900 transition-colors" onClick={() => showToast('Cookie Preferences', 'Essential session tokens only.')}>Cookie Preferences</button>
              </div>
            </div>
          </div>
        </footer>

        {/* Floating Quick Action CTA on Scroll */}
        {hasScrolled && (
          <div className="fixed bottom-6 left-6 z-40 hidden sm:flex items-center gap-3 px-4 py-2.5 rounded-2xl crystal-panel-elevated shadow-lg border border-cyan-200/80">
            <span className="font-headline-sm text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Orbit size={16} className="text-cyan-600 animate-spin" />
              Your next chapter starts here
            </span>
            <button
              className="shimmer-btn px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-headline-sm text-xs font-bold shadow-sm"
              onClick={() => openAuth('signup')}
            >
              Start building
            </button>
            <a
              href="#home-main"
              aria-label="Return to top"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <ArrowUp size={16} />
            </a>
          </div>
        )}
      </div>
    </HomeMotionContext.Provider>
  );
}
