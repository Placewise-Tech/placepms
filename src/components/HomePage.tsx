import { useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle2, ChevronRight, Command, FileText, FolderKanban, GitBranch, GitFork as Github, Layers3, LayoutDashboard, Menu, Orbit, Pause, Play, Plus, Sparkles, Users, X } from 'lucide-react';
import '../home.css';
import { useReducedMotion } from '../hooks/useReducedMotion';

type AuthMode = 'signin' | 'signup';
type AuthRole = 'student' | 'faculty' | 'college' | 'recruiter';
type Preview = 'overview' | 'tasks' | 'tools';
interface HomePageProps { onOpenAuth: (mode: AuthMode, role?: AuthRole) => void }

const workflow = [
  { title: 'Start with a spark.', description: 'Create your project. Bring your people.', icon: FolderKanban, caption: 'A space for your next big idea', tags: ['Your team', 'Your mentor', 'Your plan'] },
  { title: 'Build your momentum.', description: 'Set milestones. Get feedback. Keep moving.', icon: CheckCircle2, caption: 'Small steps. Visible progress.', tags: ['Plan', 'Submit', 'Review'] },
  { title: 'Make it your story.', description: 'Turn your work into a report and portfolio.', icon: BookOpen, caption: 'From first idea to final presentation', tags: ['Research', 'Blackbook', 'Portfolio'] },
];

const faq = [
  ['How do I get started?', 'Create your account. Your initial six-digit login code is emailed to you. Sign in, set a personal password, and start your first project.'],
  ['Can my team and mentor join?', 'Yes. Add teammates by email and assign a mentor from your project settings. Everyone signs in with their own account.'],
  ['Do I need to connect external tools?', 'Only when you need them. Planning and reports work on their own; connect GitHub, Figma, or Miro to explore your project evidence.'],
];

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} initial={reduced ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

function WorkspacePreview({ preview, onPreview }: { preview: Preview; onPreview: (value: Preview) => void }) {
  const reduced = useReducedMotion();
  return <div className="home-preview">
    <div className="home-preview-chrome"><span className="home-window-dots" aria-hidden="true"><i /><i /><i /></span><span><Orbit size={13} /> placepms / your workspace</span><span className="home-preview-online"><i /> Connected</span></div>
    <div className="home-preview-layout">
      <aside className="home-preview-sidebar" aria-hidden="true"><span className="home-preview-monogram">P<span>›</span></span><span className="is-active"><LayoutDashboard size={18} /></span><span><FolderKanban size={18} /></span><span><CheckCircle2 size={18} /></span><span><Users size={18} /></span><span><FileText size={18} /></span><span className="home-preview-sidebar-bottom"><Command size={18} /></span></aside>
      <div className="home-preview-content">
        <div className="home-preview-heading"><div><span className="home-eyebrow">Your mission control</span><h2>A little progress. A big future.</h2></div><span className="home-preview-profile">JD</span></div>
        <div className="home-preview-tabs" aria-label="Workspace preview">{([['overview', 'Overview'], ['tasks', 'Milestones'], ['tools', 'Connected tools']] as const).map(([value, label]) => <button key={value} aria-pressed={preview === value} onClick={() => onPreview(value)}>{label}</button>)}</div>
        <div className="home-preview-body" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={preview} initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.2 }}>
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preview, setPreview] = useState<Preview>('overview');
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [year] = useState(() => new Date().getFullYear());
  const reduced = useReducedMotion();
  const currentStep = workflow[step];
  const StepIcon = currentStep.icon;
  const openAuth = (mode: AuthMode, role: AuthRole = 'student') => { setMobileMenuOpen(false); onOpenAuth(mode, role); };
  const nav = <><a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a><a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>The journey</a><a href="#faq" onClick={() => setMobileMenuOpen(false)}>FAQ</a></>;

  return <div className={`home-page ${paused || reduced ? 'home-motion-paused' : ''}`}>
    <a className="home-skip" href="#home-main">Skip to content</a>
    <header className="home-header"><div className="home-container home-header-inner">
      <a href="/" aria-label="PlacePMS Home"><img src="/PlacePMS-Logo-White.svg" width="126" height="36" alt="PlacePMS" /></a>
      <nav className="home-desktop-nav" aria-label="Main navigation">{nav}</nav>
      <div className="home-desktop-actions"><button className="home-button home-button-plain" onClick={() => openAuth('signin')}>Sign In</button><button className="home-button home-button-primary" onClick={() => openAuth('signup')}>Get started <ArrowUpRight size={15} /></button></div>
      <button className="home-menu-toggle" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenuOpen} aria-controls="home-mobile-navigation" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>{mobileMenuOpen ? <X size={23} /> : <Menu size={23} />}</button>
    </div>{mobileMenuOpen && <nav className="home-mobile-nav" id="home-mobile-navigation" aria-label="Mobile navigation">{nav}<button className="home-button" onClick={() => openAuth('signin')}>Sign In</button><button className="home-button home-button-primary" onClick={() => openAuth('signup')}>Create Account <ArrowUpRight size={15} /></button></nav>}</header>

    <main id="home-main">
      <section className="home-hero">
        <div className="home-aurora" aria-hidden="true"><i /><i /></div><div className="home-grid-field" aria-hidden="true" />
        <div className="home-container">
          <Reveal className="home-hero-copy"><span className="home-badge"><span className="home-live-dot" /> The next chapter of academic work</span><h1>Big ideas.<br /><span>Next-level execution.</span></h1><p>Your projects, people, and progress. One connected universe.</p><div className="home-actions"><button className="home-button home-button-primary" onClick={() => openAuth('signup')}>Create your workspace <ArrowUpRight size={18} /></button><a className="home-button home-button-glass" href="#workspace-preview">Take a look inside <ArrowDown size={16} /></a></div><div className="home-hero-note"><span>Built for students.</span><span>Connected with mentors.</span><span>Made for what’s next.</span></div></Reveal>
          <Reveal className="home-stage" delay={0.15}>
            <div className="home-stage-orbit" aria-hidden="true"><i /><i /><i /></div>
            <div className="home-floating-tag home-floating-tag-left" aria-hidden="true"><span><CheckCircle2 size={17} /></span><div><strong>One step closer.</strong><small>Milestone approved</small></div><Sparkles size={15} /></div>
            <div id="workspace-preview"><WorkspacePreview preview={preview} onPreview={setPreview} /></div>
            <div className="home-floating-tag home-floating-tag-right" aria-hidden="true"><span><GitBranch size={17} /></span><div><strong>Ideas → impact</strong><small>Keep everything connected</small></div></div>
          </Reveal>
          <div className="home-hero-bottom"><span><Orbit size={15} /> Less busywork. More possibility.</span><button className="home-motion-toggle" disabled={Boolean(reduced)} aria-label={paused || reduced ? 'Play animations' : 'Pause animations'} aria-pressed={paused || Boolean(reduced)} onClick={() => setPaused(!paused)}>{paused || reduced ? <Play size={13} /> : <Pause size={13} />}{reduced ? 'Reduced motion' : paused ? 'Motion paused' : 'Motion on'}</button></div>
        </div>
      </section>

      <section id="features" className="home-section"><div className="home-container">
        <Reveal className="home-section-heading"><span className="home-eyebrow">Everything in your orbit</span><h2>Less switching.<br /><span>More creating.</span></h2><p>A home for every part of your project.</p></Reveal>
        <div className="home-bento">
          <Reveal className="home-feature home-feature-projects"><div className="home-feature-top"><span className="home-icon"><FolderKanban size={20} /></span><span>01 / Projects</span><ArrowUpRight size={17} /></div><h3>Give your idea a home.</h3><p>Your team, mentor, and plan. Together.</p><div className="home-project-stack" aria-hidden="true"><div className="home-stack-card home-stack-back"><span /><span /></div><div className="home-stack-card home-stack-middle"><span /><span /></div><div className="home-stack-card home-stack-front"><div><span className="home-live-dot" /><span>THE NEXT BIG THING</span><FolderKanban size={18} /></div><strong>Built by you.</strong><div className="home-stack-tags"><span>Design</span><span>Build</span><span>Launch</span></div><div className="home-mini-progress"><span /></div></div></div></Reveal>
          <Reveal className="home-feature home-feature-milestones" delay={0.08}><div className="home-feature-top"><span className="home-icon"><CheckCircle2 size={20} /></span><span>02 / Momentum</span><ArrowUpRight size={17} /></div><h3>Small wins. Big moves.</h3><p>Milestones and feedback that move you forward.</p><div className="home-feature-timeline" aria-hidden="true">{['Idea mapped', 'First version built', 'Ready for review'].map((label, index) => <div key={label}><span>{index < 2 ? <Check size={13} /> : <span className="home-live-dot" />}</span><strong>{label}</strong><small>{index < 2 ? 'Done' : 'Next up'}</small></div>)}</div></Reveal>
          <Reveal className="home-feature home-feature-tools"><div className="home-feature-top"><span className="home-icon"><Orbit size={20} /></span><span>03 / Connections</span><ArrowUpRight size={17} /></div><h3>Your tools, in sync.</h3><p>GitHub. Figma. Miro. Right where you work.</p><div className="home-tools-orbit" aria-hidden="true"><div className="home-tools-ring" /><span className="home-tools-core"><Orbit size={28} /></span><span className="home-orbit-node home-orbit-github"><Github size={25} /></span><span className="home-orbit-node home-orbit-figma"><Layers3 size={24} /></span><span className="home-orbit-node home-orbit-miro"><LayoutDashboard size={24} /></span><span className="home-orbit-particle" /></div></Reveal>
          <Reveal className="home-feature home-feature-story" delay={0.08}><div className="home-feature-top"><span className="home-icon"><BookOpen size={20} /></span><span>04 / Your story</span><ArrowUpRight size={17} /></div><h3>Work worth showing.</h3><p>Research to Blackbook. Project to portfolio.</p><div className="home-story-visual" aria-hidden="true"><div className="home-story-sheet"><span>PLACEPMS / BLACKBOOK</span><BookOpen size={30} /><strong>Your work.<br />Your next chapter.</strong><div /><div /><small>AUTHORED BY YOU</small></div><span className="home-story-chip"><FileText size={14} /> Ready to present <Sparkles size={14} /></span></div></Reveal>
        </div>
      </div></section>

      <section id="how-it-works" className="home-section home-journey"><div className="home-container home-journey-grid">
        <Reveal><div className="home-section-heading"><span className="home-eyebrow">The journey</span><h2>From “what if”<br /><span>to “we did it”.</span></h2></div><div className="home-journey-steps" aria-label="Explore the project journey">{workflow.map((item, index) => <button key={item.title} aria-pressed={step === index} onClick={() => setStep(index)}><span>0{index + 1}</span><div><strong>{item.title}</strong><small>{item.description}</small></div><ArrowUpRight size={18} /></button>)}</div></Reveal>
        <Reveal className="home-journey-visual"><div className="home-journey-orbits" aria-hidden="true"><i /><i /><i /></div><AnimatePresence mode="wait" initial={false}><motion.div key={step} className="home-journey-center" initial={{ opacity: 0, scale: reduced ? 1 : 0.93 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.25 }} aria-live="polite"><span className="home-journey-icon"><StepIcon size={37} /></span><span className="home-eyebrow">CHAPTER 0{step + 1}</span><h3>{currentStep.caption}</h3><div className="home-journey-tags">{currentStep.tags.map(tag => <span key={tag}>{tag}</span>)}</div></motion.div></AnimatePresence><span className="home-journey-coordinate" aria-hidden="true">IDEA / BUILD / IMPACT</span></Reveal>
      </div></section>

      <section id="faq" className="home-section home-faq-section"><div className="home-container home-faq-grid"><Reveal className="home-section-heading"><span className="home-eyebrow">A few useful answers</span><h2>Before liftoff.</h2></Reveal><Reveal className="home-faq">{faq.map(([question, answer]) => <details key={question}><summary>{question}<Plus size={18} /></summary><p>{answer}</p></details>)}</Reveal></div></section>

      <section id="get-started" className="home-start"><div className="home-start-orbit" aria-hidden="true" /><Reveal className="home-container"><span className="home-badge"><Sparkles size={14} /> Your next big thing starts here</span><h2>Make space<br />for <span>what’s next.</span></h2><button className="home-button home-button-primary" onClick={() => openAuth('signup')}>Create Account <ArrowUpRight size={18} /></button></Reveal></section>
    </main>

    <footer className="home-footer"><div className="home-container"><div className="home-footer-top"><a href="/" aria-label="PlacePMS Home"><img src="/PlacePMS-Logo-White.svg" width="126" height="36" alt="PlacePMS" /></a><span>Your work. Your universe.</span><div><button onClick={() => openAuth('signin')}>Student sign in <ArrowRight size={13} /></button><button onClick={() => openAuth('signin', 'faculty')}>Mentor sign in <ArrowRight size={13} /></button></div></div><div className="home-footer-bottom"><span>© {year} PlacePMS</span><span><span className="home-live-dot" /> Built for the next generation.</span><a href="#home-main">Back to top <ArrowUpRight size={13} /></a></div></div></footer>
  </div>;
}
