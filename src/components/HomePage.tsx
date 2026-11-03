import { lazy, Suspense, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronDown, ClipboardCheck, FileText, FolderKanban, LayoutDashboard, Menu, ShieldCheck, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HomeAudience from './HomeAudience';
import HomeTeam from './HomeTeam';
import '../home.css';
import '../home-next.css';
import '../home-crystalline.css';

type AuthMode = 'signin' | 'signup';
interface HomePageProps { onOpenAuth: (mode: AuthMode) => void }

const HomeAutomation = lazy(() => import('./HomeAutomation'));
const HomeIdeaPlanner = lazy(() => import('./HomeIdeaPlanner'));

const nav = [
  ['features', 'Features'],
  ['idea-planner', 'Plan an idea'],
  ['how-it-works', 'How it works'],
  ['your-workspace', 'For your role'],
  ['faq', 'FAQ'],
] as const;

const faqs = [
  ['How do I get started?', 'Create your account, use the emailed six-digit login code, set your password, and open your workspace.'],
  ['Can my team and mentor join?', 'Yes. Add teammates by email and assign mentors from project settings. Everyone uses their own account.'],
  ['Do I need external tools?', 'No. Planning and project work operate independently. GitHub, Figma, and Miro are optional connections.'],
  ['Can I export my work?', 'Yes. PlacePMS supports project reports, milestone CSV exports, and calendar files from your workspace.'],
  ['How do institution accounts work?', 'Teachers, staff, and administrators receive access from their institution. Public registration creates student accounts.'],
];

export default function HomePage({ onOpenAuth }: HomePageProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [faqQuery, setFaqQuery] = useState('');
  const [year] = useState(() => new Date().getFullYear());
  const visibleFaqs = faqs.filter(([question, answer]) => `${question} ${answer}`.toLowerCase().includes(faqQuery.trim().toLowerCase()));
  const openAuth = (mode: AuthMode) => { setMenuOpen(false); onOpenAuth(mode); };
  const goTo = (id: string) => { setMenuOpen(false); navigate(`#${id}`, { preventScrollReset: true }); document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' }); };

  return <div className="site-home">
    <header className="site-header">
      <div className="site-header-inner">
        <button className="site-brand" onClick={() => goTo('home-main')} aria-label="PlacePMS home"><img src="/placewise-logo.png" alt="Placewise" /></button>
        <nav className="site-nav" aria-label="Main navigation">{nav.map(([id, label]) => <button key={id} onClick={() => goTo(id)}>{label}</button>)}</nav>
        <div className="site-header-actions"><button className="site-link-button site-desktop-only" onClick={() => openAuth('signin')}>Sign in</button><button className="site-button site-button-small" onClick={() => openAuth('signup')}>Create account <ArrowRight size={15} /></button><button className="site-menu-button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button></div>
      </div>
      {menuOpen && <nav className="site-mobile-nav" aria-label="Mobile navigation">{nav.map(([id, label]) => <button key={id} onClick={() => goTo(id)}>{label}</button>)}<button onClick={() => openAuth('signin')}>Sign in</button><button className="site-button" onClick={() => openAuth('signup')}>Create account <ArrowRight size={15} /></button></nav>}
    </header>

    <main id="home-main">
      <section className="site-hero site-container">
        <div className="site-hero-copy"><span className="site-kicker"><span className="site-kicker-dot" />ACADEMIC PROJECT WORKSPACE</span><h1>Plan clearly.<br /><em>Build confidently.</em></h1><p>PlacePMS gives students, mentors, and institutions one calm place to plan projects, review progress, and keep real evidence together.</p><div className="site-hero-actions"><button className="site-button" onClick={() => openAuth('signup')}>Create your workspace <ArrowRight size={16} /></button><button className="site-button site-button-secondary" onClick={() => goTo('features')}>Explore the platform</button></div><div className="site-proof"><span><Check size={14} />Project planning</span><span><Check size={14} />Mentor feedback</span><span><Check size={14} />Evidence exports</span></div></div>
        <div className="site-product-card" aria-label="PlacePMS workspace preview"><div className="site-product-top"><span><i /><i /><i /></span><strong>placepms / workspace</strong><span className="site-status"><span />Preview</span></div><div className="site-product-body"><div className="site-product-heading"><div><span className="site-kicker">YOUR WORKSPACE</span><h2>Everything in one place.</h2></div><LayoutDashboard size={21} /></div><div className="site-product-grid"><article><FolderKanban size={18} /><span>Projects</span><strong>Organize your work</strong></article><article><ClipboardCheck size={18} /><span>Milestones</span><strong>Track the next step</strong></article><article><Users size={18} /><span>People</span><strong>Work with your team</strong></article><article><ShieldCheck size={18} /><span>Evidence</span><strong>Keep progress verifiable</strong></article></div><div className="site-product-note"><span><BookOpen size={16} /> Your connected workspace uses your own account data.</span><button onClick={() => openAuth('signin')}>Open workspace <ArrowRight size={14} /></button></div></div></div>
      </section>

      <section id="features" className="site-section site-section-muted"><div className="site-container"><div className="site-section-heading"><span className="site-kicker">A BETTER PROJECT RHYTHM</span><h2>Less scattered work.<br /><em>More visible progress.</em></h2><p>Every core workflow is organized around the way academic projects actually move.</p></div><div className="site-feature-grid"><article><span className="site-feature-icon"><FolderKanban size={21} /></span><h3>Project spaces</h3><p>Bring your team, idea, scope, links, and decisions into one shared workspace.</p><a href="#idea-planner" onClick={event => { event.preventDefault(); goTo('idea-planner'); }}>Start with an idea <ArrowRight size={14} /></a></article><article><span className="site-feature-icon site-feature-icon-teal"><ClipboardCheck size={21} /></span><h3>Milestones that move</h3><p>Turn a large project into clear deliveries, submissions, feedback, and next steps.</p><a href="#how-it-works" onClick={event => { event.preventDefault(); goTo('how-it-works'); }}>See the workflow <ArrowRight size={14} /></a></article><article><span className="site-feature-icon site-feature-icon-violet"><FileText size={21} /></span><h3>Evidence you can use</h3><p>Keep documents, repositories, designs, notes, and approved work close to the project.</p><a href="#your-workspace" onClick={event => { event.preventDefault(); goTo('your-workspace'); }}>See every role <ArrowRight size={14} /></a></article></div></div></section>

      <section id="idea-planner" className="site-section site-container"><div className="site-section-heading site-section-heading-row"><div><span className="site-kicker">START WITHOUT THE BLANK PAGE</span><h2>Turn an idea into<br /><em>a practical plan.</em></h2><p>Describe what you want to build. Generate an editable roadmap, then save it to your workspace when you are ready.</p></div><span className="site-section-number">01</span></div><Suspense fallback={<div className="site-loading-card">Loading the idea planner…</div>}><HomeIdeaPlanner onOpenAuth={openAuth} motionPaused /></Suspense></section>

      <section id="how-it-works" className="site-section site-section-dark"><div className="site-container"><div className="site-section-heading site-section-heading-light"><span className="site-kicker">A SIMPLE LOOP</span><h2>From first thought<br /><em>to finished work.</em></h2><p>Use the same clear rhythm whether you are building alone, with a team, or with a mentor.</p></div><div className="site-steps"><article><span>01</span><FolderKanban size={22} /><h3>Create a space</h3><p>Set the direction, invite the right people, and keep the project context together.</p></article><article><span>02</span><ClipboardCheck size={22} /><h3>Work in milestones</h3><p>Make progress visible through planned deliveries, submissions, and feedback.</p></article><article><span>03</span><ShieldCheck size={22} /><h3>Show the evidence</h3><p>Build a record of the work that can support reports, reviews, and your portfolio.</p></article></div></div></section>

      <section id="automation" className="site-section site-container"><div className="site-section-heading site-section-heading-row"><div><span className="site-kicker">TRY THE WORKFLOW</span><h2>See how a project<br /><em>can stay in motion.</em></h2><p>This interactive demonstration is clearly marked as sample data. Your authenticated workspace always uses your own records.</p></div><span className="site-section-number">02</span></div><Suspense fallback={<div className="site-loading-card">Loading the workflow preview…</div>}><HomeAutomation motionPaused /></Suspense></section>

      <HomeAudience onOpenAuth={openAuth} />
      <section id="team" className="site-section site-section-muted"><div className="site-container"><div className="site-section-heading"><span className="site-kicker">THE PEOPLE BEHIND PLACEPMS</span><h2>Built with care<br /><em>for real project work.</em></h2></div><HomeTeam motionPaused /></div></section>

      <section id="faq" className="site-section site-container"><div className="site-section-heading"><span className="site-kicker">QUESTIONS, ANSWERED</span><h2>Clear before<br /><em>you begin.</em></h2><label className="site-search"><span>Search questions</span><input aria-label="Search frequently asked questions" value={faqQuery} onChange={event => setFaqQuery(event.target.value)} placeholder="Search the help centre" /></label></div><div className="site-faq">{visibleFaqs.map(([question, answer]) => <details key={question} open={faqOpen === faqs.findIndex(item => item[0] === question)}><summary onClick={event => { event.preventDefault(); setFaqOpen(current => current === faqs.findIndex(item => item[0] === question) ? null : faqs.findIndex(item => item[0] === question)); }}>{question}<ChevronDown size={18} /></summary>{faqOpen === faqs.findIndex(item => item[0] === question) && <p>{answer}</p>}</details>)}{!visibleFaqs.length && <div className="site-empty">No matching questions.</div>}</div></section>

      <section className="site-cta"><div className="site-container"><div><span className="site-kicker">READY WHEN YOU ARE</span><h2>Give your next project<br /><em>a better home.</em></h2><p>Start with a student workspace. Your institution can add the people and permissions around it.</p></div><button className="site-button" onClick={() => openAuth('signup')}>Create your workspace <ArrowRight size={16} /></button></div></section>
    </main>
    <footer className="site-footer"><div className="site-container"><div><img src="/placewise-logo.png" alt="Placewise" /><p>A focused workspace for academic projects and progress.</p></div><div className="site-footer-links"><button onClick={() => goTo('features')}>Features</button><button onClick={() => goTo('faq')}>FAQ</button><button onClick={() => openAuth('signin')}>Sign in</button></div><small>© {year} Placewise. Built for meaningful work.</small></div></footer>
  </div>;
}
