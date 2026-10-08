import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useScroll } from 'framer-motion';
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, BookOpen, Check, CheckCircle2, ChevronRight, Command, FileText, FolderKanban, GitBranch, GitFork as Github, Layers3, LayoutDashboard, Menu, Orbit, Pause, Play, Plus, Search, ShieldCheck, Sparkles, Users, Workflow, X } from 'lucide-react';
import '../home.css';
import '../home-next.css';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHomeAutoplay } from '../hooks/useHomeAutoplay';
import HomeAudience from './HomeAudience';
import HomeTeam from './HomeTeam';
import HomeIdeaPlanner from './HomeIdeaPlanner';

type AuthMode = 'signin' | 'signup';
type Preview = 'overview' | 'tasks' | 'tools';
interface HomePageProps { onOpenAuth: (mode: AuthMode) => void }
const HomeMotionContext = createContext(false);
const HomeAutomation = lazy(() => import('./HomeAutomation'));
const navigation = [{ id: 'idea-planner', label: 'Build your idea' }, { id: 'features', label: 'Features' }, { id: 'automation', label: 'Automation' }, { id: 'how-it-works', label: 'The journey' }, { id: 'team', label: 'Our team' }, { id: 'faq', label: 'FAQ' }];
const previews: Preview[] = ['overview', 'tasks', 'tools'];

const workflow = [
  { title: 'Start with a spark.', description: 'Create your project. Bring your people.', icon: FolderKanban, caption: 'A space for your next big idea', tags: ['Your team', 'Your mentor', 'Your plan'] },
  { title: 'Build your momentum.', description: 'Set milestones. Get feedback. Keep moving.', icon: CheckCircle2, caption: 'Small steps. Visible progress.', tags: ['Plan', 'Submit', 'Review'] },
  { title: 'Make it your story.', description: 'Turn your work into a report and portfolio.', icon: BookOpen, caption: 'From first idea to final presentation', tags: ['Research', 'Blackbook', 'Portfolio'] },
];

const faq = [
  ['How do I get started?', 'Create your account. Your initial six-digit login code is emailed to you. Sign in, set a personal password, and start your first project.'],
  ['Can my team and mentor join?', 'Yes. Add teammates by email and assign a mentor from your project settings. Everyone signs in with their own account.'],
  ['Do I need to connect external tools?', 'Only when you need them. Planning and reports work on their own; connect GitHub, Figma, or Miro to explore your project evidence.'],
  ['Can I build a Blackbook report?', 'Yes. The Blackbook builder brings your saved project records, team, milestone evidence, research, and authored sections into an editable report. Save drafts and export Markdown, printable HTML, or a PDF through your browser.'],
  ['Can I take my deadlines into my calendar?', 'Yes. Export project milestones as an ICS calendar file from your workspace and import it into a compatible calendar. You can also export milestone evidence as CSV.'],
  ['How do teachers and administrators get access?', 'Your institution assigns teacher, staff, and administrator access. Sign in with your assigned account and PlacePMS opens the appropriate workspace automatically. Public registration does not assign administrator access.'],
];

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  const paused = useContext(HomeMotionContext);
  return <motion.div className={className} initial={reduced || paused ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: reduced || paused ? 0 : 0.65, delay: reduced || paused ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

function WorkspacePreview({ preview, onPreview, autoplay }: { preview: Preview; onPreview: (value: Preview) => void; autoplay: boolean }) {
  const reduced = useReducedMotion();
  const paused = useContext(HomeMotionContext);
  return <div className="home-preview">
    <div className="home-preview-chrome"><span className="home-window-dots" aria-hidden="true"><i /><i /><i /></span><span><Orbit size={13} /> placepms / your workspace</span><span className="home-preview-online"><i /> Connected</span></div>
    <div className="home-preview-layout">
      <aside className="home-preview-sidebar" aria-hidden="true"><span className="home-preview-monogram">P<span>›</span></span><span className="is-active"><LayoutDashboard size={18} /></span><span><FolderKanban size={18} /></span><span><CheckCircle2 size={18} /></span><span><Users size={18} /></span><span><FileText size={18} /></span><span className="home-preview-sidebar-bottom"><Command size={18} /></span></aside>
      <div className="home-preview-content">
        <div className="home-preview-heading"><div><span className="home-eyebrow">Your mission control</span><h2>A little progress. A big future.</h2></div><span className="home-preview-profile">JD</span></div>
        <div className="home-preview-tabs" aria-label="Workspace preview">{([['overview', 'Overview'], ['tasks', 'Milestones'], ['tools', 'Connected tools']] as const).map(([value, label]) => <button key={value} aria-pressed={preview === value} onClick={() => onPreview(value)}>{label}</button>)}</div>
        <div className="home-preview-body" aria-live={autoplay ? 'off' : 'polite'}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={preview} initial={reduced || paused ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced || paused ? 0 : 0.2 }}>
              {preview === 'overview' ? <>
                <div className="home-preview-metrics">{[['03', 'Active projects'], ['08', 'Milestones delivered'], ['04', 'Team members']].map(([value, label]) => <div key={label}><span>{label}</span><strong>{value}<ArrowUpRight size={15} /></strong></div>)}</div>
                <div className="home-preview-overview"><div className="home-preview-chart"><div className="home-preview-chart-heading"><span>Project momentum</span><span>This week <ChevronRight size={12} /></span></div><svg viewBox="0 0 440 120" role="img" aria-label="Illustrative project momentum chart"><defs><linearGradient id="home-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#bdff74" stopOpacity=".25" /><stop offset="100%" stopColor="#bdff74" stopOpacity="0" /></linearGradient></defs><path className="home-chart-grid" d="M0 25H440M0 65H440M0 105H440" /><path d="M0 104C35 105 37 78 70 83S117 100 147 68S190 86 221 51S263 63 294 33S337 52 366 22S408 29 440 7V120H0Z" fill="url(#home-chart-fill)" /><path className="home-chart-line" d="M0 104C35 105 37 78 70 83S117 100 147 68S190 86 221 51S263 63 294 33S337 52 366 22S408 29 440 7" pathLength="1" /></svg><div className="home-chart-days">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={index}>{day}</span>)}</div></div><div className="home-preview-project"><span className="home-preview-project-icon"><FolderKanban size={19} /></span><span>Featured project</span><h3>Something extraordinary.</h3><div className="home-mini-progress"><span /></div><div className="home-mini-members"><b>JD</b><b>AK</b><b>SR</b><span>Building together</span></div></div></div>
              </> : preview === 'tasks' ? <div className="home-preview-milestones"><div className="home-preview-chart-heading"><h3>From idea to done.</h3><span>3 milestones</span></div>{[['Define the direction', 'Discovery', true], ['Build the first version', 'In progress', false], ['Present your work', 'Up next', false]].map(([title, label, done], index) => <div className={`home-demo-task ${done ? 'is-done' : ''}`} key={String(title)}><span>{done ? <Check size={14} /> : `0${index + 1}`}</span><div><strong>{title}</strong><small>{label}</small></div><span className="home-demo-task-status">{done ? 'Approved' : index === 1 ? 'Building' : 'Planned'}</span></div>)}</div> : <div className="home-preview-connections"><h3>Your tools. One orbit.</h3><div>{[{ icon: Github, name: 'GitHub repositories', label: 'Code & commits' }, { icon: Layers3, name: 'Figma designs', label: 'Frames & ideas' }, { icon: LayoutDashboard, name: 'Miro boards', label: 'Plans & possibilities' }].map(({ icon: Icon, name, label }) => <article key={name}><span><Icon size={23} /></span><strong>{name}</strong><small>{label}</small><span className="home-connection-indicator"><Check size={11} /> Linked</span></article>)}</div></div>}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="home-preview-footer"><span><i /> Your next chapter is in motion</span><small>Illustrative product preview</small></div>
      </div>
    </div>
  </div>;
}

export default function HomePage({ onOpenAuth }: HomePageProps) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preview, setPreview] = useState<Preview>('overview');
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(() => { try { return localStorage.getItem('placepms-home-motion') === 'paused'; } catch { return false; } });
  const [tourPlaying, setTourPlaying] = useState(true);
  const [journeyPlaying, setJourneyPlaying] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const [hasScrolled, setHasScrolled] = useState(false);
  const [faqQuery, setFaqQuery] = useState('');
  const menuRef = useRef<HTMLButtonElement>(null);
  const [year] = useState(() => new Date().getFullYear());
  const reduced = useReducedMotion();
  const frozen = paused || reduced;
  const { scrollYProgress } = useScroll();
  const advancePreview = useCallback(() => setPreview(value => previews[(previews.indexOf(value) + 1) % previews.length]), []);
  const advanceJourney = useCallback(() => setStep(value => (value + 1) % workflow.length), []);
  const tourRef = useHomeAutoplay<HTMLDivElement>({ enabled: tourPlaying && !frozen, delay: 6000, onAdvance: advancePreview });
  const journeyRef = useHomeAutoplay<HTMLElement>({ enabled: journeyPlaying && !frozen, delay: 4500, onAdvance: advanceJourney, pauseOnInteraction: false });
  const filteredFaq = faq.filter(item => item.join(' ').toLowerCase().includes(faqQuery.trim().toLowerCase()));
  useEffect(() => { try { localStorage.setItem('placepms-home-motion', paused ? 'paused' : 'playing'); } catch { /* Motion controls also work without browser storage. */ } }, [paused]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setHasScrolled(window.scrollY > 640);
      let active = '';
      for (const item of navigation) if ((document.getElementById(item.id)?.getBoundingClientRect().top ?? Infinity) <= 180) active = item.id;
      setActiveSection(active);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, []);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMobileMenuOpen(false); menuRef.current?.focus(); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [mobileMenuOpen]);
  const currentStep = workflow[step];
  const StepIcon = currentStep.icon;
  const openAuth = (mode: AuthMode) => { setMobileMenuOpen(false); onOpenAuth(mode); };
  const selectPreview = (value: Preview) => { setPreview(value); setTourPlaying(false); };
  const followAnchor = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    const target = link && document.getElementById(link.hash.slice(1));
    if (!link || !target) return;
    event.preventDefault();
    navigate(link.hash, { preventScrollReset: true });
    if (link.hash === '#home-main') window.scrollTo({ top: 0, behavior: frozen ? 'instant' : 'smooth' });
    else target.scrollIntoView({ behavior: frozen ? 'instant' : 'smooth', block: 'start' });
    if (link.classList.contains('home-skip')) target.focus({ preventScroll: true });
  };
  const nav = navigation.map(item => <a key={item.id} href={`#${item.id}`} aria-current={activeSection === item.id ? 'location' : undefined} onClick={() => setMobileMenuOpen(false)}>{item.label}</a>);

  return <HomeMotionContext.Provider value={frozen}><div className={`home-page home-next ${frozen ? 'home-motion-paused' : ''}`} onClickCapture={followAnchor}>
    <a className="home-skip" href="#home-main">Skip to content</a>
    <header className="home-header"><div className="home-container home-header-inner">
      <a href="/" aria-label="PlacePMS Home"><img src="/PlacePMS-Logo-White.svg" width="126" height="36" alt="PlacePMS" /></a>
      <nav className="home-desktop-nav" aria-label="Main navigation">{nav}</nav>
      <div className="home-desktop-actions"><button className="home-button home-button-plain" onClick={() => openAuth('signin')}>Sign In</button><button className="home-button home-button-primary" onClick={() => openAuth('signup')}>Get started <ArrowUpRight size={15} /></button></div>
      <button ref={menuRef} className="home-menu-toggle" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenuOpen} aria-controls="home-mobile-navigation" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>{mobileMenuOpen ? <X size={23} /> : <Menu size={23} />}</button>
    </div>{mobileMenuOpen && <nav className="home-mobile-nav" id="home-mobile-navigation" aria-label="Mobile navigation">{nav}<button className="home-button" onClick={() => openAuth('signin')}>Sign In</button><button className="home-button home-button-primary" onClick={() => openAuth('signup')}>Create Account <ArrowUpRight size={15} /></button></nav>}<motion.div className="home-reading-progress" style={{ scaleX: scrollYProgress }} aria-hidden="true" /></header>

    <main id="home-main" tabIndex={-1}>
      <section className="home-hero">
        <div className="home-aurora" aria-hidden="true"><i /><i /></div><div className="home-grid-field" aria-hidden="true" />
        <div className="home-container">
          <div className="home-hero-grid">
          <Reveal className="home-hero-copy"><span className="home-badge"><span className="home-live-dot" /> The connected academic workspace</span><h1>Big ideas.<br /><span>Next-level execution.</span></h1><p>Plan projects, bring your team together, and turn everyday progress into work worth showing.</p><div className="home-actions"><button className="home-button home-button-primary" onClick={() => openAuth('signup')}>Create your workspace <ArrowUpRight size={18} /></button><a className="home-button home-button-glass" href="#workspace-preview">Take a look inside <ArrowDown size={16} /></a></div><div className="home-hero-note"><span><Check size={12} /> Built for students</span><span><Check size={12} /> Connected with mentors</span></div><div className="home-hero-signal"><span><Workflow size={16} /></span><div><strong>From first idea to final presentation.</strong><small>Planning. Evidence. Feedback. All connected.</small></div></div></Reveal>
          <div className="home-tour" ref={tourRef}><Reveal className="home-stage" delay={0.15}>
            <div className="home-tour-top"><span><span className="home-live-dot" /> YOUR WORKSPACE, IN MOTION</span><span>PRODUCT TOUR / 0{previews.indexOf(preview) + 1}</span></div>
            <div className="home-stage-orbit" aria-hidden="true"><i /><i /><i /></div>
            <div className="home-floating-tag home-floating-tag-left" aria-hidden="true"><span><CheckCircle2 size={17} /></span><div><strong>One step closer.</strong><small>Milestone approved</small></div><Sparkles size={15} /></div>
            <div id="workspace-preview"><WorkspacePreview preview={preview} onPreview={selectPreview} autoplay={tourPlaying && !frozen} /></div>
            <div className="home-floating-tag home-floating-tag-right" aria-hidden="true"><span><GitBranch size={17} /></span><div><strong>Ideas → impact</strong><small>Keep everything connected</small></div></div>
            <div className="home-tour-controls"><span>Explore. Click around. Make it yours.</span><div><span className="home-tour-dots" aria-hidden="true">{previews.map(value => <i key={value} className={value === preview ? 'is-active' : ''} />)}</span><button aria-label={tourPlaying && !frozen ? 'Pause product tour' : 'Play product tour'} aria-pressed={tourPlaying && !frozen} disabled={frozen} onClick={() => setTourPlaying(!tourPlaying)}>{tourPlaying && !frozen ? <Pause size={13} /> : <Play size={13} />}{tourPlaying && !frozen ? 'Auto tour' : 'Manual tour'}</button></div></div>
          </Reveal></div>
          </div>
          <div className="home-value-rail">{[{ icon: FolderKanban, title: 'Plan with clarity', text: 'Give every idea a direction.', href: '#features' }, { icon: GitBranch, title: 'Build with evidence', text: 'Keep your tools in the loop.', href: '#automation' }, { icon: BookOpen, title: 'Present with confidence', text: 'Make your progress worth showing.', href: '#how-it-works' }].map(({ icon: Icon, title, text, href }) => <a key={title} href={href}><span><Icon size={19} /></span><div><strong>{title}</strong><small>{text}</small></div><ArrowUpRight size={15} /></a>)}</div>
          <div className="home-hero-bottom"><span><Orbit size={15} /> Less busywork. More possibility.</span><button className="home-motion-toggle" disabled={Boolean(reduced)} aria-label={paused || reduced ? 'Play animations' : 'Pause animations'} aria-pressed={paused || Boolean(reduced)} onClick={() => setPaused(!paused)}>{paused || reduced ? <Play size={13} /> : <Pause size={13} />}{reduced ? 'Reduced motion' : paused ? 'Motion paused' : 'Motion on'}</button></div>
        </div>
      </section>

      <div className="home-integrations-rail"><div className="home-container"><span>Your favorite tools.<br /><strong>One connected workflow.</strong></span><div>{[{ icon: Github, name: 'GitHub', caption: 'Code & evidence' }, { icon: Layers3, name: 'Figma', caption: 'Design & ideas' }, { icon: LayoutDashboard, name: 'Miro', caption: 'Plans & collaboration' }].map(({ icon: Icon, name, caption }) => <span className="home-integration-item" key={name}><Icon size={22} /><span><strong>{name}</strong><small>{caption}</small></span></span>)}</div><a href="#automation">See it come together <ArrowRight size={15} /></a></div></div>

      <HomeIdeaPlanner onOpenAuth={openAuth} motionPaused={frozen} />

      <section id="features" className="home-section"><div className="home-container">
        <Reveal className="home-section-heading home-feature-heading"><div><span className="home-eyebrow">Everything in your orbit</span><h2>Less switching.<br /><span>More creating.</span></h2></div><p>A home for every part of your project.<br />Thoughtfully connected. Beautifully simple.</p></Reveal>
        <div className="home-bento">
          <Reveal className="home-feature home-feature-projects"><div className="home-feature-top"><span className="home-icon"><FolderKanban size={20} /></span><span>01 / Projects</span><ArrowUpRight size={17} /></div><h3>Give your idea a home.</h3><p>Your team, mentor, and plan. Together.</p><div className="home-project-stack" aria-hidden="true"><div className="home-stack-card home-stack-back"><span /><span /></div><div className="home-stack-card home-stack-middle"><span /><span /></div><div className="home-stack-card home-stack-front"><div><span className="home-live-dot" /><span>THE NEXT BIG THING</span><FolderKanban size={18} /></div><strong>Built by you.</strong><div className="home-stack-tags"><span>Design</span><span>Build</span><span>Launch</span></div><div className="home-mini-progress"><span /></div></div></div></Reveal>
          <Reveal className="home-feature home-feature-milestones" delay={0.08}><div className="home-feature-top"><span className="home-icon"><CheckCircle2 size={20} /></span><span>02 / Momentum</span><ArrowUpRight size={17} /></div><h3>Small wins. Big moves.</h3><p>Milestones and feedback that move you forward.</p><div className="home-feature-timeline" aria-hidden="true">{['Idea mapped', 'First version built', 'Ready for review'].map((label, index) => <div key={label}><span>{index < 2 ? <Check size={13} /> : <span className="home-live-dot" />}</span><strong>{label}</strong><small>{index < 2 ? 'Done' : 'Next up'}</small></div>)}</div></Reveal>
          <Reveal className="home-feature home-feature-tools"><div className="home-feature-top"><span className="home-icon"><Orbit size={20} /></span><span>03 / Connections</span><ArrowUpRight size={17} /></div><h3>Your tools, in sync.</h3><p>GitHub. Figma. Miro. Right where you work.</p><div className="home-tools-orbit" aria-hidden="true"><div className="home-tools-ring" /><span className="home-tools-core"><Orbit size={28} /></span><span className="home-orbit-node home-orbit-github"><Github size={25} /></span><span className="home-orbit-node home-orbit-figma"><Layers3 size={24} /></span><span className="home-orbit-node home-orbit-miro"><LayoutDashboard size={24} /></span><span className="home-orbit-particle" /></div></Reveal>
          <Reveal className="home-feature home-feature-story" delay={0.08}><div className="home-feature-top"><span className="home-icon"><BookOpen size={20} /></span><span>04 / Your story</span><ArrowUpRight size={17} /></div><h3>Work worth showing.</h3><p>Research to Blackbook. Project to portfolio.</p><div className="home-story-visual" aria-hidden="true"><div className="home-story-sheet"><span>PLACEPMS / BLACKBOOK</span><BookOpen size={30} /><strong>Your work.<br />Your next chapter.</strong><div /><div /><small>AUTHORED BY YOU</small></div><span className="home-story-chip"><FileText size={14} /> Ready to present <Sparkles size={14} /></span></div></Reveal>
        </div>
      </div></section>

      <Suspense fallback={<section id="automation" className="home-section home-automation-loader" aria-busy="true"><div className="home-container"><span className="home-eyebrow">Connected by design</span><h2>Less manual. More momentum.</h2><p role="status">Loading the interactive workflow studio…</p></div></section>}><HomeAutomation motionPaused={frozen} /></Suspense>

      <section id="how-it-works" className="home-section home-journey" ref={journeyRef}><div className="home-container home-journey-grid">
        <Reveal><div className="home-section-heading"><span className="home-eyebrow">The journey</span><h2>From “what if”<br /><span>to “we did it”.</span></h2></div><div className="home-journey-steps" aria-label="Explore the project journey">{workflow.map((item, index) => <button key={item.title} aria-pressed={step === index} onClick={() => { setStep(index); setJourneyPlaying(false); }}><span>0{index + 1}</span><div><strong>{item.title}</strong><small>{item.description}</small></div><ArrowUpRight size={18} /></button>)}</div><button className="home-journey-autoplay" disabled={frozen} aria-pressed={journeyPlaying && !frozen} onClick={() => setJourneyPlaying(!journeyPlaying)}>{journeyPlaying && !frozen ? <Pause size={13} /> : <Play size={13} />}{journeyPlaying && !frozen ? 'Pause the journey' : 'Auto-play the journey'}</button></Reveal>
        <Reveal className="home-journey-visual"><div className="home-journey-orbits" aria-hidden="true"><i /><i /><i /></div><AnimatePresence mode="wait" initial={false}><motion.div key={step} className="home-journey-center" initial={frozen ? false : { opacity: 0, scale: 0.93 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: frozen ? 0 : 0.25 }} aria-live={journeyPlaying && !frozen ? 'off' : 'polite'}><span className="home-journey-icon"><StepIcon size={37} /></span><span className="home-eyebrow">CHAPTER 0{step + 1}</span><h3>{currentStep.caption}</h3><div className="home-journey-tags">{currentStep.tags.map(tag => <span key={tag}>{tag}</span>)}</div></motion.div></AnimatePresence><span className="home-journey-coordinate" aria-hidden="true">IDEA / BUILD / IMPACT</span></Reveal>
      </div></section>

      <HomeAudience onOpenAuth={openAuth} />

      <HomeTeam motionPaused={frozen} />

      <section id="faq" className="home-section home-faq-section"><div className="home-container home-faq-grid"><Reveal className="home-section-heading"><span className="home-eyebrow">A few useful answers</span><h2>Before liftoff.</h2><p>Find your answer and get back to your next big idea.</p><a className="home-faq-link" href="#your-workspace">Find your workspace <ArrowUpRight size={15} /></a></Reveal><Reveal className="home-faq"><div className="home-faq-search"><Search size={17} /><input type="search" aria-label="Search frequently asked questions" placeholder="Search questions…" value={faqQuery} onChange={event => setFaqQuery(event.target.value)} />{faqQuery && <button aria-label="Clear FAQ search" onClick={() => setFaqQuery('')}><X size={16} /></button>}</div><p className="home-faq-count" role="status">{filteredFaq.length} {filteredFaq.length === 1 ? 'answer' : 'answers'} to explore</p>{filteredFaq.map(([question, answer]) => <details key={question}><summary>{question}<Plus size={18} /></summary><p>{answer}</p></details>)}{!filteredFaq.length && <div className="home-faq-empty"><Search size={24} /><h3>No matching answers.</h3><p>Try “mentor”, “report”, or “calendar”.</p><button className="home-button home-button-glass" onClick={() => setFaqQuery('')}>Show all questions <ArrowRight size={14} /></button></div>}</Reveal></div></section>

      <section id="get-started" className="home-start"><div className="home-start-orbit" aria-hidden="true" /><Reveal className="home-container"><span className="home-badge"><Sparkles size={14} /> Your next big thing starts here</span><h2>Make space<br />for <span>what’s next.</span></h2><p>You bring the ambition. We’ll bring everything into focus.</p><div className="home-start-actions"><button className="home-button home-button-primary" onClick={() => openAuth('signup')}>Create Account <ArrowUpRight size={18} /></button><button className="home-button home-button-glass" onClick={() => openAuth('signin')}>Open your workspace <ArrowRight size={17} /></button></div><span className="home-start-note"><ShieldCheck size={13} /> Your projects. Your people. Your next chapter.</span></Reveal></section>
    </main>

    <footer className="home-footer"><div className="home-container"><div className="home-footer-top"><a href="/" aria-label="PlacePMS Home"><img src="/PlacePMS-Logo-White.svg" width="126" height="36" alt="PlacePMS" /></a><span>Your work. Your universe.</span><div><button onClick={() => openAuth('signin')}>Student sign in <ArrowRight size={13} /></button><button onClick={() => openAuth('signin')}>Mentor sign in <ArrowRight size={13} /></button></div></div><nav className="home-footer-nav" aria-label="Footer navigation">{navigation.map(item => <a href={`#${item.id}`} key={item.id}>{item.label}</a>)}</nav><div className="home-footer-bottom"><span>© {year} PlacePMS</span><span><span className="home-live-dot" /> Built for the next generation.</span><a href="#home-main">Back to top <ArrowUpRight size={13} /></a></div></div></footer>
    {hasScrolled && <div className="home-floating-cta"><span><Orbit size={17} /> Your next chapter starts here.</span><button className="home-button home-button-primary" onClick={() => openAuth('signup')}>Start building <ArrowUpRight size={15} /></button><a href="#home-main" aria-label="Return to the top of the page"><ArrowUp size={17} /></a></div>}
  </div></HomeMotionContext.Provider>;
}
