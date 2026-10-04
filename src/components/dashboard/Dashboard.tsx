import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Bell, BookMarked, BookOpen, CalendarDays, CheckSquare, ChevronRight, CircleHelp, Command, Download, FileText, FlaskConical, FolderKanban, GitBranch, GraduationCap, LayoutDashboard, LayoutTemplate, Link2, LogOut, Menu, Monitor, Moon, PanelLeftClose, Plus, RefreshCw, Search, School, Sparkles, Sun, UserRound, Users, X } from 'lucide-react';
import { useDashboard } from '../../hooks/useDashboard';
import { useSessionMonitor } from '../../hooks/useSessionMonitor';
import { calendarExport, safeExternalUrl, upcomingMilestones } from '../../lib/dashboard-data';
import { supabase } from '../../lib/supabase';
import DashboardViews from './DashboardViews';
import WorkspaceDialog from './WorkspaceDialog';

const navigation = [
  { slug: '', label: 'Overview', icon: LayoutDashboard, section: 'WORKSPACE' },
  { slug: 'projects', label: 'Projects', icon: FolderKanban, section: 'WORKSPACE' },
  { slug: 'tasks', label: 'My Tasks', icon: CheckSquare, section: 'WORKSPACE' },
  { slug: 'mentorship', label: 'Mentorship', icon: Users, section: 'WORKSPACE' },
  { slug: 'calendar', label: 'Calendar', icon: CalendarDays, section: 'WORKSPACE' },
  { slug: 'documents', label: 'Documents', icon: FileText, section: 'LIBRARY' },
  { slug: 'research', label: 'Research', icon: FlaskConical, section: 'LIBRARY' },
  { slug: 'resources', label: 'Academic Resources', icon: BookOpen, section: 'LIBRARY' },
  { slug: 'blackbook', label: 'Blackbook Generator', icon: BookMarked, section: 'LIBRARY' },
  { slug: 'integrations', label: 'Integrations', icon: Link2, section: 'CONNECTED TOOLS' },
  { slug: 'repositories', label: 'Repositories Hub', icon: GitBranch, section: 'CONNECTED TOOLS' },
  { slug: 'figma', label: 'Figma Designs Hub', icon: LayoutTemplate, section: 'CONNECTED TOOLS' },
  { slug: 'miro', label: 'Miro Whiteboards Hub', icon: LayoutDashboard, section: 'CONNECTED TOOLS' },
  { slug: 'sessions', label: 'Login & Sessions', icon: Monitor, section: 'ACCOUNT' },
];

export default function Dashboard({ user }: { user: User }) {
  useSessionMonitor(user.id);
  const { data, loading, refreshing, error, updatedAt, refresh } = useDashboard(user);
  const navigate = useNavigate();
  const location = useLocation();
  const view = location.pathname.replace(/^\/dashboard\/?/, '').replace(/\/$/, '') || 'overview';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('placepms:sidebar') === 'collapsed');
  const [dark, setDark] = useState(() => localStorage.getItem('placepms:theme') === 'dark');
  const [showDeadlines, setShowDeadlines] = useState(false);
  const [showCommand, setShowCommand] = useState(false);
  const commandDialog = useRef<HTMLDialogElement>(null);
  const [commandQuery, setCommandQuery] = useState('');
  const [dialog, setDialog] = useState<'project' | 'milestone' | 'profile' | null>(null);
  const [notice, setNotice] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const name = data.profile?.full_name || (typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name : '') || user.email?.split('@')[0] || 'Your workspace';
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const college = data.profile?.college || (typeof user.user_metadata.college === 'string' ? user.user_metadata.college : '') || 'Your institution';
  const role = data.profile?.role || (typeof user.user_metadata.role === 'string' ? user.user_metadata.role : '') || 'Member';
  const avatar = safeExternalUrl(data.profile?.avatar_url);
  const upcoming = upcomingMilestones(data.milestones);
  const [now, setNow] = useState(() => new Date());
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const pageTitle = view === 'overview' ? 'Overview' : view === 'portfolio' ? 'Portfolio' : view.startsWith('projects/') ? data.squads.find(item => item.id === decodeURIComponent(view.slice(9)))?.title || 'Project workspace' : navigation.find(item => item.slug === view)?.label || 'Workspace';

  useEffect(() => { document.title = `${pageTitle} | PlacePMS`; }, [pageTitle]);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobileOpen(false); setShowDeadlines(false); setShowCommand(false); }
      if (document.querySelector('dialog[open]') && !commandDialog.current?.open) return;
      const typing = (event.target as HTMLElement).isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setShowCommand(current => !current); }
      if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.key === '/') { event.preventDefault(); setShowCommand(true); }
        if (event.key.toLowerCase() === 'n' && !commandDialog.current?.open) { event.preventDefault(); setDialog('project'); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  useEffect(() => { if (showCommand) commandDialog.current?.showModal(); else commandDialog.current?.close(); }, [showCommand]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timeout);
  }, [notice]);

  const saved = async (message: string) => { setNotice(message); await refresh(); };
  const closeMenus = () => { setMobileOpen(false); setShowDeadlines(false); setShowCommand(false); };
  const commandSearch = commandQuery.trim().toLowerCase();
  const commandPages = [...navigation, { slug: 'portfolio', label: 'Portfolio', icon: UserRound, section: 'CAREER' }].filter(item => !commandSearch || item.label.toLowerCase().includes(commandSearch));
  const commandProjects = data.squads.filter(project => !commandSearch || `${project.title} ${project.domain || ''}`.toLowerCase().includes(commandSearch)).slice(0, 4);
  const commandMilestones = commandSearch ? data.milestones.filter(task => `${task.name} ${task.phase}`.toLowerCase().includes(commandSearch)).slice(0, 4) : [];
  const goToCommand = (path: string) => { navigate(path); setCommandQuery(''); setShowCommand(false); };

  return <div className={`dashboard ${dark ? 'dashboard-dark' : ''} ${collapsed ? 'dashboard-collapsed' : ''}`}>
    {mobileOpen && <button className="dash-sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`dash-sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Workspace navigation">
       <div className="dash-brand"><NavLink to="/dashboard" onClick={closeMenus} aria-label="PlacePMS overview"><img src={dark ? '/PlacePMS-Logo-White.svg' : '/PlacePMS-Logo-Vector.svg'} alt="PlacePMS" /></NavLink><span className="dash-brand-mark"><Sparkles size={14} /></span><button className="dash-icon-button dash-mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18} /></button><button className="dash-icon-button dash-collapse" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => { setCollapsed(!collapsed); localStorage.setItem('placepms:sidebar', collapsed ? 'expanded' : 'collapsed'); }}><PanelLeftClose size={16} /></button></div>
       <button className="dash-institution" onClick={() => { navigate('/dashboard/portfolio'); closeMenus(); }} title={college}><span><School size={19} /></span><div><strong>{college}</strong><small>Academic workspace</small></div><ChevronRight size={14} /></button>
       <button className="dash-create-button" onClick={() => setDialog('project')}><span><Plus size={15} /></span><strong>New project</strong><kbd>N</kbd></button>
       <nav className="dash-navigation">{navigation.map((item, index) => <span key={item.slug || 'overview'}>{(index === 0 || item.section !== navigation[index - 1].section) && <span className={`dash-nav-caption ${item.section === 'ACCOUNT' ? 'dash-career-caption' : ''}`}>{item.section}</span>}<NavLink to={`/dashboard${item.slug ? `/${item.slug}` : ''}`} end title={item.label} onClick={closeMenus} className={({ isActive }) => `dash-nav-item ${isActive ? 'active' : ''}`}><item.icon size={17} /><span>{item.label}</span>{item.slug === 'tasks' && data.milestones.some(task => !['COMPLETED', 'COMPLETE', 'DONE', 'APPROVED'].includes((task.status || '').toUpperCase())) && <b className="dash-nav-count">{data.milestones.filter(task => !['COMPLETED', 'COMPLETE', 'DONE', 'APPROVED'].includes((task.status || '').toUpperCase())).length}</b>}</NavLink></span>)}<span className="dash-nav-caption dash-career-caption">CAREER</span><NavLink to="/dashboard/portfolio" onClick={closeMenus} title="Portfolio" className={({ isActive }) => `dash-nav-item ${isActive ? 'active' : ''}`}><UserRound size={17} /><span>Portfolio</span></NavLink></nav>
      <div className="dash-sidebar-bottom"><div className="dash-sidebar-help"><GraduationCap size={19} /><div><strong>A little progress, every day.</strong><span>Your work. Your next chapter.</span></div></div><button className="dash-user" onClick={() => { navigate('/dashboard/portfolio'); closeMenus(); }} title={name}><span className="dash-avatar">{avatar ? <img src={avatar} alt="" /> : initials}</span><span className="dash-user-copy"><strong>{name}</strong><small>{role}</small></span><ChevronRight size={15} /></button><button className="dash-sign-out" disabled={signingOut} title="Sign out" onClick={async () => {
        setSigningOut(true);
        setSignOutError('');
        try {
          if (!supabase) throw new Error('Supabase is not configured.');
          const { error: logoutError } = await supabase.auth.signOut({ scope: 'local' });
          if (logoutError) throw logoutError;
          navigate('/login', { replace: true });
        } catch (cause) { setSignOutError(cause instanceof Error ? cause.message : 'Unable to sign out. Try again.'); }
        finally { setSigningOut(false); }
      }}><LogOut size={15} /><span>{signingOut ? 'Signing out…' : 'Sign out'}</span></button></div>
    </aside>
    <div className="dash-shell">
       <header className="dash-header"><div className="dash-header-left"><button className="dash-icon-button dash-mobile-toggle" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div className="dash-breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>{pageTitle}</strong></div>{data.profile?.batch && <span className="dash-batch">Batch {data.profile.batch}</span>}{data.profile?.program && <span className="dash-program">{data.profile.program}</span>}</div><div className="dash-header-actions"><button className="dash-command-trigger" aria-label="Search workspace" onClick={() => setShowCommand(true)}><Search size={15} /><span>Search workspace</span><kbd><Command size={11} /> K</kbd></button><span className={`dash-sync ${data.errors.length || error ? 'has-error' : ''}`} title={updatedAt ? `Last refreshed ${updatedAt.toLocaleTimeString()}` : 'Connecting to Supabase'}><i />{loading ? 'Connecting' : error || data.errors.length ? 'Check connection' : 'Connected'}</span><button className="dash-icon-button" aria-label="Refresh dashboard" disabled={refreshing} onClick={() => void refresh()}><RefreshCw size={17} className={refreshing ? 'dash-spinning' : ''} /></button><button className="dash-icon-button" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => { setDark(!dark); localStorage.setItem('placepms:theme', dark ? 'light' : 'dark'); }}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button><div className="dash-notifications"><button className="dash-icon-button" aria-label="Upcoming deadlines" aria-expanded={showDeadlines} onClick={() => setShowDeadlines(!showDeadlines)}><Bell size={18} />{upcoming.length > 0 && <span className="dash-notification-dot" />}</button>{showDeadlines && <div className="dash-deadline-popover"><h3>Upcoming deadlines</h3>{upcoming.length ? upcoming.slice(0, 5).map(task => <button key={task.id} onClick={() => { navigate('/dashboard/calendar'); setShowDeadlines(false); }}><strong>{task.name}</strong><span>{task.due_date}</span></button>) : <p>No upcoming deadlines.</p>}</div>}</div><button className="dash-avatar dash-header-avatar" aria-label="Open your profile" onClick={() => navigate('/dashboard/portfolio')}>{avatar ? <img src={avatar} alt="" /> : initials}</button></div></header>
      <main className="dash-main" id="workspace-main">
        <div className="dash-page-heading"><div><div className="dash-heading-title"><h1>{view === 'overview' ? `${greeting}, ${name.split(' ')[0]}` : pageTitle}</h1>{view === 'overview' && <span className="dash-wave" aria-hidden="true">👋</span>}{data.profile?.division && <span className="dash-division">Division {data.profile.division}</span>}</div><p>{view === 'overview' ? 'Here’s what’s happening in your academic workspace.' : 'Your work, connected to your institution.'}<span className="dash-heading-date">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span></p></div><button className="dash-button" disabled={!data.milestones.some(task => task.due_date)} onClick={() => {
          const url = URL.createObjectURL(new Blob([calendarExport(data.milestones)], { type: 'text/calendar;charset=utf-8' }));
          const link = document.createElement('a');
          link.href = url; link.download = 'placepms-deadlines.ics'; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}><Download size={15} />Export deadlines</button></div>
        {notice && <div className="dash-alert dash-alert-success" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}
        {signOutError && <div className="dash-alert dash-alert-error" role="alert">{signOutError}</div>}
        {data.errors.length > 0 && <div className="dash-alert dash-alert-error" role="alert"><div><strong>Some workspace data could not be loaded.</strong><details><summary>Connection details</summary>{data.errors.map((issue, index) => <p key={`${issue.section}-${index}`}>{issue.section}: {issue.message}</p>)}</details></div><button className="dash-button" disabled={refreshing} onClick={() => void refresh()}>Retry</button></div>}
        {loading ? <div className="dash-loading" role="status" aria-label="Loading dashboard"><div className="dash-stats">{[1, 2, 3, 4].map(item => <div className="dash-skeleton dash-skeleton-stat" key={item} />)}</div><div className="dash-skeleton dash-skeleton-panel" /><p>Loading your workspace from Supabase…</p></div> : error ? <div className="dash-panel dash-connection-error" role="alert"><CircleHelp size={30} /><h2>We couldn’t load your workspace</h2><p>{error}</p><button className="dash-button dash-button-primary" onClick={() => void refresh()}>Try again</button></div> : <DashboardViews key={view} view={view} data={data} user={user} onCreate={setDialog} onSaved={saved} />}
        <footer className="dash-footer"><span>PlacePMS <span>·</span> Your academic workspace</span><span>{updatedAt ? `Last refreshed ${updatedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : 'Connecting to your workspace'}</span></footer>
      </main>
    </div>
    {showCommand && <dialog ref={commandDialog} className="dash-command-overlay workspace-command-dialog" aria-label="Search workspace" onCancel={event => { event.preventDefault(); setShowCommand(false); }} onClick={event => { if (event.target === event.currentTarget) setShowCommand(false); }}><div className="dash-command"><div className="dash-command-input"><Search size={18} /><input autoFocus value={commandQuery} onChange={event => setCommandQuery(event.target.value)} placeholder="Jump to a page, project or milestone…" aria-label="Search pages and projects" /><button className="dash-icon-button" aria-label="Close workspace search" onClick={() => setShowCommand(false)}><X size={17} /></button></div>{!commandSearch && <p className="dash-command-hint">Search with <strong>Ctrl/⌘ K</strong> or <strong>/</strong>. Create a project with <strong>N</strong>.</p>}{commandPages.length > 0 && <div className="dash-command-section"><span>Pages</span>{commandPages.slice(0, commandSearch ? 15 : 6).map(item => <button key={item.slug} onClick={() => goToCommand(`/dashboard${item.slug ? `/${item.slug}` : ''}`)}><item.icon size={16} /><span>{item.label}</span><ArrowUpRight size={14} /></button>)}</div>}{commandProjects.length > 0 && <div className="dash-command-section"><span>Projects</span>{commandProjects.map(project => <button key={project.id} onClick={() => goToCommand(`/dashboard/projects/${encodeURIComponent(project.id)}`)}><FolderKanban size={16} /><span>{project.title}<small>{project.domain || project.current_phase || 'Project workspace'}</small></span><ArrowUpRight size={14} /></button>)}</div>}{commandMilestones.length > 0 && <div className="dash-command-section"><span>Milestones</span>{commandMilestones.map(task => <button key={task.id} onClick={() => goToCommand(`/dashboard/projects/${encodeURIComponent(task.squad_id)}#milestone-${encodeURIComponent(task.id)}`)}><CheckSquare size={16} /><span>{task.name}<small>{task.phase} · {task.due_date || 'Unscheduled'}</small></span><ArrowUpRight size={14} /></button>)}</div>}{commandSearch && !commandPages.length && !commandProjects.length && !commandMilestones.length && <div className="dash-command-empty"><Search size={24} /><strong>No matches found</strong><span>Try a page, project, or milestone name.</span></div>}</div></dialog>}
    {dialog && <WorkspaceDialog kind={dialog} data={data} user={user} initialProjectId={view.startsWith('projects/') ? decodeURIComponent(view.slice(9)) : undefined} onClose={() => setDialog(null)} onSaved={saved} />}
  </div>;
}
