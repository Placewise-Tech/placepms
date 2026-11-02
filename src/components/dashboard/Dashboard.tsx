import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { NavLink as RouterNavLink, useLocation, useNavigate, type NavLinkProps } from 'react-router-dom';
import { ArrowUpRight, Bell, BookMarked, BookOpen, CalendarDays, CheckSquare, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck, Command, Download, FileText, FlaskConical, FolderKanban, GitBranch, GraduationCap, Inbox, LayoutDashboard, Link2, ListChecks, LogOut, Menu, Moon, Monitor, Orbit, PanelLeftClose, Pause, Play, Plus, RefreshCw, Search, School, Sparkles, Sun, Users, X, type LucideIcon } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useDashboard } from '../../hooks/useDashboard';
import { useSessionMonitor } from '../../hooks/useSessionMonitor';
import { calendarExport, safeExternalUrl, upcomingMilestones } from '../../lib/dashboard-data';
import { supabase } from '../../lib/supabase';
import DashboardViews from './DashboardViews';
import WorkspaceDialog from './WorkspaceDialog';
import { roleLabels, useWorkspaceRoot, workspaceRole, type ManagementSettings } from '../../lib/workspace-roles';
import { workspaceRequest } from '../../lib/workspace-api';

function NavLink({to,...props}:NavLinkProps) { const root=useWorkspaceRoot(); return <RouterNavLink {...props} to={typeof to==='string'?to.replace(/^\/dashboard(?=\/|$)/,root):to}/>; }

interface NavigationItem { slug: string; label: string; icon: LucideIcon; brand?: 'github' | 'figma' | 'miro'; section: string }

const baseNavigation: NavigationItem[] = [
  { slug: '', label: 'Overview', icon: LayoutDashboard, section: 'WORKSPACE' },
  { slug: 'today', label: 'Today', icon: Sparkles, section: 'WORKSPACE' },
  { slug: 'automation', label: 'Automations', icon: ListChecks, section: 'WORKSPACE' },
  { slug: 'projects', label: 'Projects', icon: FolderKanban, section: 'WORKSPACE' },
  { slug: 'tasks', label: 'My Tasks', icon: CheckSquare, section: 'WORKSPACE' },
  { slug: 'scope', label: 'Project Scope', icon: FileText, section: 'WORKSPACE' },
  { slug: 'mentorship', label: 'Mentorship', icon: Users, section: 'WORKSPACE' },
  { slug: 'attendance', label: 'Attendance', icon: ClipboardCheck, section: 'WORKSPACE' },
  { slug: 'calendar', label: 'Calendar', icon: CalendarDays, section: 'WORKSPACE' },
  { slug: 'documents', label: 'Documents', icon: FileText, section: 'LIBRARY' },
  { slug: 'research', label: 'Research', icon: FlaskConical, section: 'LIBRARY' },
  { slug: 'resources', label: 'Academic Resources', icon: BookOpen, section: 'LIBRARY' },
  { slug: 'blackbook', label: 'Blackbook Generator', icon: BookMarked, section: 'LIBRARY' },
  { slug: 'integrations', label: 'Integrations', icon: Link2, section: 'CONNECTED TOOLS' },
  { slug: 'repositories', label: 'Repositories Hub', icon: GitBranch, brand: 'github' as const, section: 'CONNECTED TOOLS' },
  { slug: 'figma', label: 'Figma Designs Hub', icon: Link2, brand: 'figma' as const, section: 'CONNECTED TOOLS' },
  { slug: 'miro', label: 'Miro Whiteboards Hub', icon: LayoutDashboard, brand: 'miro' as const, section: 'CONNECTED TOOLS' },
  { slug: 'sessions', label: 'Login & Sessions', icon: Inbox, section: 'ACCOUNT' },
  { slug: 'notifications', label: 'Notifications', icon: Inbox, section: 'ACCOUNT' },
  { slug: 'portfolio', label: 'Portfolio', icon: FolderKanban, section: 'CAREER' },
];

function SidebarIcon({ item }: { item: NavigationItem }) {
  if (item.brand === 'github') return <svg className="dash-nav-brand-icon dash-nav-brand-github" viewBox="0 0 19 19" aria-hidden="true"><path fill="currentColor" fillRule="evenodd" d="M9.356 1.85C5.05 1.85 1.57 5.356 1.57 9.694a7.84 7.84 0 0 0 5.324 7.44c.387.079.528-.168.528-.376 0-.182-.013-.805-.013-1.454-2.165.467-2.616-.935-2.616-.935-.349-.91-.864-1.143-.864-1.143-.71-.48.051-.48.051-.48.787.051 1.2.805 1.2.805.695 1.194 1.817.857 2.268.649.064-.507.27-.857.49-1.052-1.728-.182-3.545-.857-3.545-3.87 0-.857.31-1.558.8-2.104-.078-.195-.349-1 .077-2.078 0 0 .657-.208 2.14.805a7.5 7.5 0 0 1 1.946-.26c.657 0 1.328.092 1.946.26 1.483-1.013 2.14-.805 2.14-.805.426 1.078.155 1.883.078 2.078.502.546.799 1.247.799 2.104 0 3.013-1.818 3.675-3.558 3.87.284.247.528.714.528 1.454 0 1.052-.012 1.896-.012 2.156 0 .208.142.455.528.377a7.84 7.84 0 0 0 5.324-7.441c.013-4.338-3.48-7.844-7.773-7.844Z" clipRule="evenodd" /></svg>;
  if (item.brand === 'figma') return <svg className="dash-nav-brand-icon dash-nav-brand-figma" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="1" width="7" height="6" rx="3" fill="#f24e1e" /><rect x="10" y="1" width="7" height="6" rx="3" fill="#ff7262" /><rect x="3" y="7" width="7" height="6" rx="3" fill="#a259ff" /><rect x="10" y="7" width="7" height="6" rx="3" fill="#1abcfe" /><path fill="#0acf83" d="M3 13h7v3.5a3.5 3.5 0 1 1-3.5-3.5H3Z" /></svg>;
  if (item.brand === 'miro') return <svg className="dash-nav-brand-icon dash-nav-brand-miro" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#ffd02f" /><path fill="#050038" d="M5 5h3.2l3.8 5.1L15.8 5H19v14h-3v-8.2l-4 5.2-4-5.2V19H5V5Z" /></svg>;
  const Icon = item.icon;
  return <Icon size={17} />;
}

export default function Dashboard({ user }: { user: User }) {
  useSessionMonitor(user.id);
  const { data, loading, refreshing, error, updatedAt, refresh } = useDashboard(user);
  const navigate = useNavigate();
  const location = useLocation();
  const root=useWorkspaceRoot(); const managedRole=workspaceRole(user);
  const [access,setAccess] = useState<{ settings: ManagementSettings } | null>(null);
  useEffect(() => { let active = true; void workspaceRequest<{ settings: ManagementSettings }>('management', { action: 'access' }).then(result => { if (active && result.settings?.features) setAccess(result); }).catch(() => {}); return () => { active = false; }; }, [user.id, updatedAt]);
  const managementNavigation: NavigationItem[] = managedRole === 'admin' ? [{ slug: 'accounts', label: 'Accounts & Mentors', icon: Users, section: 'MANAGEMENT' }, { slug: 'connections', label: 'Provider Connections', icon: Link2, section: 'MANAGEMENT' }, { slug: 'settings', label: 'Feature Controls', icon: CheckSquare, section: 'MANAGEMENT' }, { slug: 'audit', label: 'Management Activity', icon: Monitor, section: 'MANAGEMENT' }] : managedRole !== 'student' ? [{ slug: 'students', label: 'Student Roster', icon: GraduationCap, section: 'MENTORING' }] : [];
  const features: Record<string, keyof ManagementSettings['features']> = { repositories: 'github', reports: 'github', figma: 'figma', miro: 'miro', research: 'research', resources: 'resource', documents: 'document', blackbook: 'blackbook' };
  const navigation: NavigationItem[] = [...managementNavigation, ...baseNavigation, ...(managedRole !== 'student' ? [{ slug: 'reports', label: 'GitHub Evidence & AI Flags', icon: GitBranch, section: 'CONNECTED TOOLS' }] : [])].filter(item => managedRole === 'admin' || access?.settings.features[features[item.slug]] !== false);
  const view = location.pathname.replace(/^\/(dashboard|admin|teacher|staff)\/?/, '').replace(/\/$/, '') || 'overview';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('placepms:sidebar') === 'collapsed');
   const [dark, setDark] = useState(() => {
     const saved = localStorage.getItem('placepms:theme:black') || localStorage.getItem('placepms:theme');
     return saved ? saved === 'dark' : true;
   });
  const [motionPaused, setMotionPaused] = useState(() => localStorage.getItem('placepms:motion') === 'paused');
  const [compact, setCompact] = useState(() => localStorage.getItem('placepms:density') !== 'comfortable');
  const reducedMotion = useReducedMotion();
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
  const role = managedRole!=='student'?roleLabels[managedRole]:data.profile?.role || (typeof user.user_metadata.role === 'string' ? user.user_metadata.role : '') || 'Member';
  const semester = typeof user.user_metadata.semester === 'string' && user.user_metadata.semester.trim() ? user.user_metadata.semester.trim() : null;
  const avatar = safeExternalUrl(data.profile?.avatar_url);
  const upcoming = upcomingMilestones(data.milestones);
  const [now, setNow] = useState(() => new Date());
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const pageTitle = view === 'overview' ? 'Overview' : view === 'portfolio' ? 'Portfolio' : view.startsWith('projects/') ? data.squads.find(item => item.id === decodeURIComponent(view.slice(9)))?.title || 'Project workspace' : navigation.find(item => item.slug === view)?.label || 'Workspace';

  useEffect(() => { document.title = `${pageTitle} | PlacePMS`; }, [pageTitle]);
  useEffect(() => { localStorage.setItem('placepms:theme:black', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => { localStorage.setItem('placepms:motion', motionPaused ? 'paused' : 'on'); }, [motionPaused]);
  useEffect(() => { localStorage.setItem('placepms:density', compact ? 'compact' : 'comfortable'); }, [compact]);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobileOpen(false); setShowDeadlines(false); setShowCommand(false); }
      if (document.querySelector('dialog[open]') && !commandDialog.current?.open) return;
      const typing = (event.target as HTMLElement).isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName);
       if (!typing && event.key === 'Escape') setShowCommand(false);
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
  const commandPages = navigation.filter(item => !commandSearch || item.label.toLowerCase().includes(commandSearch));
  const commandProjects = data.squads.filter(project => !commandSearch || `${project.title} ${project.domain || ''}`.toLowerCase().includes(commandSearch)).slice(0, 4);
  const commandMilestones = commandSearch ? data.milestones.filter(task => `${task.name} ${task.phase}`.toLowerCase().includes(commandSearch)).slice(0, 4) : [];
  const goToCommand = (path: string) => { navigate(path.replace(/^\/dashboard(?=\/|$)/,root)); setCommandQuery(''); setShowCommand(false); };

  return <div className={`dashboard workspace-studio ${compact ? 'workspace-compact' : ''} ${dark ? 'dashboard-dark' : ''} ${collapsed ? 'dashboard-collapsed' : ''} ${motionPaused || reducedMotion ? 'dashboard-motion-paused' : ''}`}>
    {mobileOpen && <button className="dash-sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`dash-sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Workspace navigation">
       <div className="dash-brand"><NavLink to="/dashboard" onClick={closeMenus} aria-label="PlacePMS overview"><img src={dark ? '/placewise-logo.png' : '/placewise-logo.png'} alt="PlacePMS" /></NavLink><span className="dash-brand-mark"><Sparkles size={14} /></span><button className="dash-icon-button dash-mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18} /></button><button className="dash-icon-button dash-collapse" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => { setCollapsed(!collapsed); localStorage.setItem('placepms:sidebar', collapsed ? 'expanded' : 'collapsed'); }}><PanelLeftClose size={16} /></button></div>
       <button className="dash-institution" onClick={() => { navigate(`${root}/portfolio`); closeMenus(); }} title={`Open ${college} profile`}><span><School size={19} /></span><div><strong>{college}</strong><small>Academic workspace</small></div><ChevronRight size={14} /></button>
        <button className="dash-create-button" aria-label="New project" title="New project" onClick={() => setDialog('project')}><span><Plus size={15} /></span><strong>New project</strong><kbd>N</kbd></button>
        {managedRole==='admin' && <nav className="dash-management" aria-label="Administration management">{managementNavigation.map(item=><NavLink key={item.slug} to={`${root}/${item.slug}`} onClick={closeMenus} title={item.label} className={({isActive})=>`dash-nav-item ${isActive?'active':''}`}><item.icon size={16}/><span>{item.label}</span></NavLink>)}</nav>}
          <nav className="dash-navigation dash-navigation-flat" aria-label="Workspace navigation">{navigation.map(item => <NavLink key={`${item.section}-${item.slug || 'overview'}`} to={`/dashboard${item.slug ? `/${item.slug}` : ''}`} end onClick={closeMenus} title={item.label} className={({ isActive }) => `dash-nav-item ${isActive ? 'active' : ''}`}><SidebarIcon item={item} /><span>{item.label}</span></NavLink>)}</nav>
        <div className="dash-sidebar-bottom"><div className="dash-sidebar-help"><GraduationCap size={19} /><div><strong>{college}</strong><span>{data.profile?.program || 'Academic workspace'}</span></div></div><button className="dash-user" onClick={() => { navigate(`${root}/portfolio`); closeMenus(); }} title={`Open ${name}'s portfolio`}><span className="dash-avatar">{avatar ? <img src={avatar} alt="" /> : initials}</span><span className="dash-user-copy"><strong>{name}</strong><small>{role}</small></span><ChevronRight size={15} /></button><button className="dash-sign-out" disabled={signingOut} title="Sign out" onClick={async () => {
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
       <header className="dash-header">
         <div className="dash-header-left">
           <button className="dash-icon-button dash-mobile-toggle" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
           <div className="dash-context-nav" aria-label="Academic context">
             {data.profile?.batch && <span className="dash-context-chip"><GraduationCap size={14} />Batch {data.profile.batch}</span>}
             {data.profile?.program && <span className="dash-context-chip">{data.profile.program}</span>}
             {data.profile?.division && <span className="dash-context-chip">Div {data.profile.division}</span>}
             {semester && <button className="dash-context-chip dash-context-chip-button" onClick={() => setNotice(`Current semester: ${semester}`)}><BookOpen size={14} />{semester}<ChevronDown size={13} /></button>}
           </div>
         </div>
         <div className="dash-header-actions">
           <button className="dash-command-trigger" aria-label="Search workspace" onClick={() => setShowCommand(true)}><Search size={15} /><span>Search workspace</span><kbd><Command size={11} /> K</kbd></button>
           <span className={`dash-sync ${data.errors.length || error ? 'has-error' : ''}`} title={updatedAt ? `Last refreshed ${updatedAt.toLocaleTimeString()}` : 'Connecting to Supabase'}><i />{loading ? 'Connecting' : error || data.errors.length ? 'Check connection' : 'Connected'}</span>
           <button className="dash-icon-button" aria-label="Refresh dashboard" disabled={refreshing} onClick={() => void refresh()}><RefreshCw size={17} className={refreshing ? 'dash-spinning' : ''} /></button>
           <button className="dash-icon-button" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => { setDark(!dark); localStorage.setItem('placepms:theme', dark ? 'light' : 'dark'); }}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
           <div className="dash-notifications"><button className="dash-icon-button" aria-label="Upcoming deadlines" aria-expanded={showDeadlines} onClick={() => setShowDeadlines(!showDeadlines)}><Bell size={18} />{upcoming.length > 0 && <span className="dash-notification-dot" />}</button>{showDeadlines && <div className="dash-deadline-popover"><h3>Upcoming deadlines</h3>{upcoming.length ? upcoming.slice(0, 5).map(task => <button key={task.id} onClick={() => { navigate(`${root}/calendar?date=${task.due_date}`); closeMenus(); }}><strong>{task.name}</strong><span>{task.due_date}</span></button>) : <p>No upcoming deadlines.</p>}</div>}</div>
           <button className="dash-header-profile" onClick={() => navigate(`${root}/portfolio`)} aria-label={`Open ${name}'s profile`}><span className="dash-avatar dash-header-avatar">{avatar ? <img src={avatar} alt="" /> : initials}</span><span><strong>{name}</strong><small>{role}</small></span><ChevronDown size={15} /></button>
         </div>
       </header>
      <main className="dash-main" id="workspace-main">
        {view !== 'overview' && <><div className="dash-control-meta"><span><Orbit size={13} /> {view === 'overview' ? 'NEBULA / MISSION CONTROL' : 'NEBULA / CONNECTED WORKSPACE'}</span><div className="dash-view-controls"><button className="dash-motion-toggle" aria-label={compact ? 'Use comfortable layout' : 'Use compact layout'} aria-pressed={compact} onClick={() => setCompact(!compact)}>{compact ? 'Focus layout' : 'Comfort layout'}</button><button className="dash-motion-toggle" aria-label={motionPaused || reducedMotion ? 'Play workspace animations' : 'Pause workspace animations'} aria-pressed={motionPaused || Boolean(reducedMotion)} disabled={Boolean(reducedMotion)} onClick={() => setMotionPaused(!motionPaused)}>{motionPaused || reducedMotion ? <Play size={11} /> : <Pause size={11} />}{reducedMotion ? 'Reduced motion' : motionPaused ? 'Motion paused' : 'Motion on'}</button></div></div>
         <div className="dash-page-heading"><div><div className="dash-heading-title"><h1>{view === 'overview' ? `${greeting}, ${name.split(' ')[0]}` : pageTitle}</h1>{data.profile?.division && <span className="dash-division">Division {data.profile.division}</span>}</div><p>{view === 'overview' ? 'Ready for your next big move?' : 'Your work. One connected orbit.'}<span className="dash-heading-date">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span></p></div><button className="dash-button" disabled={!data.milestones.some(task => task.due_date)} onClick={() => {
          const url = URL.createObjectURL(new Blob([calendarExport(data.milestones)], { type: 'text/calendar;charset=utf-8' }));
          const link = document.createElement('a');
          link.href = url; link.download = 'placepms-deadlines.ics'; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
         }}><Download size={15} />Export deadlines</button></div>
         </>}{notice && <div className="dash-alert dash-alert-success" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}
         {signOutError && <div className="dash-alert dash-alert-error" role="alert">{signOutError}</div>}
        {data.errors.length > 0 && <div className="dash-alert dash-alert-error" role="alert"><div><strong>Some workspace data could not be loaded.</strong><details><summary>Connection details</summary>{data.errors.map((issue, index) => <p key={`${issue.section}-${index}`}>{issue.section}: {issue.message}</p>)}</details></div><button className="dash-button" disabled={refreshing} onClick={() => void refresh()}>Retry</button></div>}
         {loading ? <div className="dash-loading" role="status" aria-label="Loading dashboard"><div className="dash-stats">{[1, 2, 3, 4].map(item => <div className="dash-skeleton dash-skeleton-stat" key={item} />)}</div><div className="dash-skeleton dash-skeleton-panel" /><p>Loading your workspace from Supabase…</p></div> : error ? <div className="dash-panel dash-connection-error" role="alert"><CircleHelp size={30} /><h2>We couldn’t load your workspace</h2><p>{error}</p><button className="dash-button dash-button-primary" onClick={() => void refresh()}>Try again</button></div> : <DashboardViews key={view} view={view} data={data} user={user} now={now} features={access?.settings.features} onCreate={setDialog} onSaved={saved} />}
        <footer className="dash-footer"><span>PlacePMS <span>·</span> Your academic workspace</span><span>{updatedAt ? `Last refreshed ${updatedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : 'Connecting to your workspace'}</span></footer>
      </main>
    </div>
    {showCommand && <dialog ref={commandDialog} className="dash-command-overlay workspace-command-dialog" aria-label="Search workspace" onCancel={event => { event.preventDefault(); setShowCommand(false); }} onClick={event => { if (event.target === event.currentTarget) setShowCommand(false); }}><div className="dash-command"><div className="dash-command-input"><Search size={18} /><input autoFocus value={commandQuery} onChange={event => setCommandQuery(event.target.value)} placeholder="Jump to a page, project or milestone…" aria-label="Search pages and projects" /><button className="dash-icon-button" aria-label="Close workspace search" onClick={() => setShowCommand(false)}><X size={17} /></button></div>{!commandSearch && <p className="dash-command-hint">Search with <strong>Ctrl/⌘ K</strong> or <strong>/</strong>. Create a project with <strong>N</strong>.</p>}{commandPages.length > 0 && <div className="dash-command-section"><span>Pages</span>{commandPages.slice(0, commandSearch ? 15 : 6).map(item => <button key={item.slug} onClick={() => goToCommand(`/dashboard${item.slug ? `/${item.slug}` : ''}`)}><item.icon size={16} /><span>{item.label}</span><ArrowUpRight size={14} /></button>)}</div>}{commandProjects.length > 0 && <div className="dash-command-section"><span>Projects</span>{commandProjects.map(project => <button key={project.id} onClick={() => goToCommand(`/dashboard/projects/${encodeURIComponent(project.id)}`)}><FolderKanban size={16} /><span>{project.title}<small>{project.domain || project.current_phase || 'Project workspace'}</small></span><ArrowUpRight size={14} /></button>)}</div>}{commandMilestones.length > 0 && <div className="dash-command-section"><span>Milestones</span>{commandMilestones.map(task => <button key={task.id} onClick={() => goToCommand(`/dashboard/projects/${encodeURIComponent(task.squad_id)}#milestone-${encodeURIComponent(task.id)}`)}><CheckSquare size={16} /><span>{task.name}<small>{task.phase} · {task.due_date || 'Unscheduled'}</small></span><ArrowUpRight size={14} /></button>)}</div>}{commandSearch && !commandPages.length && !commandProjects.length && !commandMilestones.length && <div className="dash-command-empty"><Search size={24} /><strong>No matches found</strong><span>Try a page, project, or milestone name.</span></div>}</div></dialog>}
    {dialog && <WorkspaceDialog kind={dialog} data={data} user={user} initialProjectId={view.startsWith('projects/') ? decodeURIComponent(view.slice(9)) : undefined} onClose={() => setDialog(null)} onSaved={saved} />}
  </div>;
}
