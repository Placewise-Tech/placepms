import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, BookOpen, CheckSquare, ChevronRight, Database, FileText, FolderKanban, GitBranch, GraduationCap, LayoutDashboard, Link2, LogOut, Menu, Monitor, Plus, RefreshCw, Search, Settings2, ShieldCheck, Users, X } from 'lucide-react';
import { useDashboard } from '../../hooks/useDashboard';
import { useSessionMonitor } from '../../hooks/useSessionMonitor';
import { supabase } from '../../lib/supabase';
import AdminMonitoring from './AdminMonitoring';
import DashboardViews from './DashboardViews';
import ManagementWorkspace from './ManagementWorkspace';
import WorkspaceDialog from './WorkspaceDialog';
import SessionsView from './SessionsView';

const navigation = [
  { slug: '', label: 'Command center', icon: LayoutDashboard, group: 'MONITOR' },
  { slug: 'users', label: 'People & activity', icon: Users, group: 'MONITOR' },
  { slug: 'activity', label: 'Live activity stream', icon: Activity, group: 'MONITOR' },
  { slug: 'analytics', label: 'Delivery analytics', icon: BarChart3, group: 'MONITOR' },
  { slug: 'projects', label: 'All projects', icon: FolderKanban, group: 'WORKSPACE DATA' },
  { slug: 'tasks', label: 'All milestones', icon: CheckSquare, group: 'WORKSPACE DATA' },
  { slug: 'students', label: 'Student roster', icon: GraduationCap, group: 'WORKSPACE DATA' },
  { slug: 'mentorship', label: 'Mentor review queue', icon: Users, group: 'WORKSPACE DATA' },
  { slug: 'documents', label: 'All documents', icon: FileText, group: 'WORKSPACE DATA' },
  { slug: 'research', label: 'Research & resources', icon: BookOpen, group: 'WORKSPACE DATA' },
  { slug: 'reports', label: 'Integration analyses', icon: GitBranch, group: 'INTELLIGENCE' },
  { slug: 'connections', label: 'Provider connections', icon: Link2, group: 'INTELLIGENCE' },
  { slug: 'accounts', label: 'Accounts & permissions', icon: ShieldCheck, group: 'ADMINISTRATION' },
  { slug: 'settings', label: 'Feature controls', icon: Settings2, group: 'ADMINISTRATION' },
  { slug: 'audit', label: 'Management audit', icon: Monitor, group: 'ADMINISTRATION' },
  { slug: 'sessions', label: 'My admin sessions', icon: Database, group: 'ADMINISTRATION' },
];

export default function AdminDashboard({ user }: { user: User }) {
  useSessionMonitor(user.id);
  const { data, loading, refreshing, error, updatedAt, refresh } = useDashboard(user);
  const location = useLocation(); const navigate = useNavigate();
  const view = location.pathname.replace(/^\/admin\/?/, '').replace(/\/$/, '') || 'overview';
  const title = view === 'overview' ? 'Command center' : view.startsWith('projects/') ? 'Project intelligence' : navigation.find(item => item.slug === view)?.label || 'Administration';
  const [mobileOpen, setMobileOpen] = useState(false); const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<'project' | 'milestone' | 'profile' | null>(null);
  const [notice, setNotice] = useState(''); const [logoutError, setLogoutError] = useState(''); const [signingOut, setSigningOut] = useState(false);
  const name = data.profile?.full_name || String(user.user_metadata.full_name || user.email?.split('@')[0] || 'Administrator');
  useEffect(() => { document.title = `${title} | PlacePMS Admin`; }, [title]);
  const saved = async (message: string) => { setNotice(message); await refresh(); };
  const management = ['accounts', 'settings', 'connections', 'audit', 'reports'].includes(view);
  const monitoring = ['overview', 'users', 'activity', 'analytics'].includes(view);
  const closeNavigation = () => setMobileOpen(false);
  return <div className="dashboard dashboard-dark workspace-studio admin-workspace">
    {mobileOpen && <button className="dash-sidebar-backdrop" aria-label="Close administration navigation" onClick={closeNavigation} />}
    <aside className={`dash-sidebar admin-sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Administration navigation"><div className="admin-brand"><NavLink to="/admin" onClick={closeNavigation}><img src="/PlacePMS-Logo-White.svg" alt="PlacePMS" /></NavLink><button className="dash-icon-button dash-mobile-close" aria-label="Close navigation" onClick={closeNavigation}><X size={18} /></button></div><div className="admin-sidebar-badge"><ShieldCheck size={18} /><div><strong>Admin control center</strong><small>WORKSPACE-WIDE ACCESS</small></div><span /></div><label className="admin-nav-search"><Search size={14} /><input aria-label="Search admin navigation" placeholder="Find admin page…" value={query} onChange={event => setQuery(event.target.value)} /></label><nav className="admin-navigation">{['MONITOR','WORKSPACE DATA','INTELLIGENCE','ADMINISTRATION'].map(group => { const items = navigation.filter(item => item.group === group && item.label.toLowerCase().includes(query.toLowerCase())); return items.length > 0 && <div className="admin-nav-group" key={group}><span>{group}</span>{items.map(item => <NavLink end to={`/admin${item.slug ? `/${item.slug}` : ''}`} className={({isActive}) => `admin-nav-item ${isActive || (item.slug === '' && (view === 'overview' || location.pathname === '/admin')) ? 'active' : ''}`} key={item.slug} onClick={closeNavigation}><item.icon size={16} /><span>{item.label}</span>{item.slug === 'activity' && <i className="admin-nav-live" />}</NavLink>)}</div>; })}</nav><div className="admin-sidebar-bottom"><div className="admin-account"><span className="admin-avatar">{name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><div><strong>{name}</strong><small>Administrator</small></div><ShieldCheck size={15} /></div><button className="admin-signout" disabled={signingOut} onClick={async () => { setSigningOut(true); setLogoutError(''); try { if (!supabase) throw new Error('Supabase is not configured.'); const result = await supabase.auth.signOut({scope:'local'}); if (result.error) throw result.error; navigate('/login',{replace:true}); } catch (cause) { setLogoutError(cause instanceof Error ? cause.message : 'Unable to sign out.'); } finally { setSigningOut(false); } }}><LogOut size={14} />{signingOut ? 'Signing out…' : 'Sign out'}</button></div></aside>
    <div className="dash-shell"><header className="admin-topbar"><div><button className="dash-icon-button dash-mobile-toggle" aria-label="Open administration navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={20} /></button><span className="admin-topbar-name">Administration</span><ChevronRight size={13} /><strong>{title}</strong></div><div className="admin-topbar-actions"><span className="admin-access-label"><ShieldCheck size={13} /> Administrator access</span><button className="dash-icon-button" aria-label="Refresh all workspace data" disabled={refreshing} onClick={() => void refresh()}><RefreshCw size={16} className={refreshing ? 'dash-spinning' : ''} /></button>{['projects','tasks'].includes(view) && <button className="dash-button dash-button-primary" onClick={() => setDialog(view === 'tasks' ? 'milestone' : 'project')}><Plus size={14} />{view === 'tasks' ? 'Add milestone' : 'Create project'}</button>}</div></header><main className="dash-main admin-main" id="workspace-main">{notice && <div className="dash-alert dash-alert-success" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}{logoutError && <div className="dash-alert dash-alert-error" role="alert">{logoutError}</div>}{monitoring ? <AdminMonitoring key={view} view={view} /> : management ? <ManagementWorkspace key={view} view={view} user={user} onSaved={saved} /> : view === 'sessions' ? <SessionsView /> : <>{error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}{data.errors.length > 0 && <div className="dash-alert dash-alert-error" role="alert">{data.errors.map(item => `${item.section}: ${item.message}`).join(' · ')}</div>}{loading ? <div className="admin-loading" role="status"><Database size={22} /><span>Loading all workspace data…</span></div> : <DashboardViews key={view} view={view} data={data} user={user} onCreate={setDialog} onSaved={saved} />}</>}<footer className="admin-footer"><span><ShieldCheck size={12} /> PlacePMS administration</span><span>{updatedAt ? `Workspace synced ${updatedAt.toLocaleTimeString()}` : 'Connecting to workspace data'}</span></footer></main></div>{dialog && <WorkspaceDialog kind={dialog} data={data} user={user} initialProjectId={view.startsWith('projects/') ? decodeURIComponent(view.slice(9)) : undefined} onClose={() => setDialog(null)} onSaved={saved} />}
  </div>;
}
