import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarClock, CheckCircle2, CircleAlert, Clock3, ExternalLink, FileCheck2, Inbox, MessageSquare, Plus, RefreshCw, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import type { DashboardData, Milestone } from '../../lib/dashboard-data';
import { getDocuments, getDashboardStats, isComplete, isInactive, localDateKey, upcomingMilestones } from '../../lib/dashboard-data';
import { errorMessage, workspaceRequest } from '../../lib/workspace-api';
import { useWorkspaceRoot } from '../../lib/workspace-roles';
import { WorkspaceLink as Link } from './WorkspaceUI';

export interface WorkspaceNotification {
  id: string;
  project_id: string;
  milestone_id: string | null;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

interface EvidenceRecord {
  id: string;
  project_id: string;
  milestone_id: string | null;
  author_id: string;
  kind: string;
  title: string;
  description: string;
  url: string | null;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
}
interface CommentRecord {
  id: string;
  project_id: string;
  milestone_id: string | null;
  author_id: string;
  body: string;
  mentions: string[];
  created_at: string;
}

export interface WorkspaceEvidenceSummary {
  project_id: string;
  recorded: number;
  verified: number;
}

function dateLabel(value: string | null) {
  if (!value) return 'No date';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function notificationHref(item: WorkspaceNotification, root: string) {
  const suffix = item.milestone_id ? `#milestone-${encodeURIComponent(item.milestone_id)}` : '';
  return `${root}/projects/${encodeURIComponent(item.project_id)}${suffix}`;
}

function SignalEmpty({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="dash-empty"><span className="dash-empty-icon">{icon}</span><h3>{title}</h3><p>{description}</p></div>;
}

function SignalPanel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="dash-panel signal-panel"><div className="dash-panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

export function EvidenceReadiness({ data }: { data: DashboardData }) {
  const [summaries, setSummaries] = useState<WorkspaceEvidenceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await workspaceRequest<{ summaries: WorkspaceEvidenceSummary[] }>('workspace', { action: 'evidence.summary' });
      setSummaries((result.summaries || []).filter(item => typeof item.project_id === 'string'));
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(initial); }, [load]);

  const projects = data.squads.filter(project => !isInactive(project.status));
  const projectError = data.errors.some(issue => ['Projects', 'Team projects', 'Mentorship'].includes(issue.section));
  const summaryByProject = new Map(summaries.map(item => [item.project_id, item]));
  const visibleSummaries = projects.map(project => ({ project, summary: summaryByProject.get(project.id) || { project_id: project.id, recorded: 0, verified: 0 } }));
  const recorded = visibleSummaries.reduce((total, item) => total + Number(item.summary.recorded || 0), 0);
  const verified = visibleSummaries.reduce((total, item) => total + Number(item.summary.verified || 0), 0);
  const projectsWithEvidence = visibleSummaries.filter(item => item.summary.recorded > 0).length;
  const projectsNeedingEvidence = visibleSummaries.filter(item => item.summary.recorded === 0).length;

  return <SignalPanel title="Evidence readiness" subtitle="A scoped summary of evidence records and mentor verification across your visible projects." action={<button className="dash-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'dash-spinning' : ''} />Refresh</button>}>
    {error && <div className="dash-alert dash-alert-error" role="alert">Evidence readiness could not be loaded. {error}</div>}
    {projectError && <div className="dash-alert dash-alert-error" role="alert">Evidence readiness is incomplete because some project records could not be loaded.</div>}
    {loading ? <div className="dash-loading" role="status">Loading evidence readiness…</div> : error || projectError ? <SignalEmpty icon={<ShieldCheck size={24} />} title="Evidence summary unavailable" description="Refresh after the workspace data and evidence summary service are available." /> : !projects.length ? <SignalEmpty icon={<ShieldCheck size={24} />} title="No project evidence yet" description="Create a project workspace and add real links, documents, demos, or notes to build its evidence record." /> : <>
      <div className="signal-pulse-grid signal-readiness-metrics"><div><span>Projects represented</span><strong>{projectsWithEvidence} / {projects.length}</strong><small>projects with recorded evidence</small></div><div><span>Recorded evidence</span><strong>{recorded}</strong><small>links, documents, demos, repositories, or notes</small></div><div><span>Mentor verified</span><strong>{verified}</strong><small>records verified by an assigned mentor</small></div><div><span>Needs evidence</span><strong>{projectsNeedingEvidence}</strong><small>visible projects with no evidence record</small></div></div>
      <div className="signal-readiness-list">{visibleSummaries.map(({ project, summary }) => <Link className="signal-readiness-project" to={`/dashboard/projects/${encodeURIComponent(project.id)}`} key={project.id}><span className="signal-task-icon"><ShieldCheck size={16} /></span><span><strong>{project.title}</strong><small>{summary.recorded} recorded · {summary.verified} mentor verified</small></span><ExternalLink size={14} /></Link>)}</div>
      <p className="signal-evidence-note"><ShieldCheck size={13} />Verification is an explicit mentor action; linked milestone submissions are not counted automatically.</p>
    </>}
  </SignalPanel>;
}

export function NotificationBell({ user }: { user: User }) {
  const root = useWorkspaceRoot();
  const navigate = useNavigate();
  const [items, setItems] = useState<WorkspaceNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const result = await workspaceRequest<{ notifications: WorkspaceNotification[] }>('workspace', { action: 'notifications.list' });
      setItems(result.notifications || []); setError('');
    } catch (cause) { setError(errorMessage(cause)); }
  }, []);
  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [load, user.id]);
  const unread = items.filter(item => !item.read_at).length;
  const openItem = async (item: WorkspaceNotification) => {
    if (!item.read_at) {
      setItems(current => current.map(candidate => candidate.id === item.id ? { ...candidate, read_at: new Date().toISOString() } : candidate));
      try { await workspaceRequest('workspace', { action: 'notification.read', notificationId: item.id }); } catch { void load(); }
    }
    navigate(notificationHref(item, root));
  };
  return <div className="dash-notifications signal-notifications"><button className="dash-icon-button" aria-label="Workspace notifications" aria-expanded={open} onClick={() => { setOpen(current => !current); if (!open) void load(); }}><Bell size={18} />{unread > 0 && <span className="dash-notification-dot" />}</button>{open && <div className="dash-deadline-popover signal-popover"><div className="signal-popover-heading"><div><h3>Notifications</h3><p>{unread ? `${unread} unread` : 'All caught up'}</p></div><Link className="dash-text-link" to="/dashboard/notifications" onClick={() => setOpen(false)}>Open inbox</Link></div>{error && <p className="signal-error">{error}</p>}{!error && items.length === 0 && <p className="signal-muted">Notifications from reviews, mentions, and workspace activity will appear here.</p>}{items.slice(0, 5).map(item => <button className={`signal-notification ${item.read_at ? '' : 'is-unread'}`} key={item.id} onClick={() => void openItem(item)}><span className="signal-notification-icon"><Inbox size={14} /></span><span><strong>{item.title}</strong><small>{item.body || item.kind} · {timeLabel(item.created_at)}</small></span></button>)}</div>}</div>;
}

export function NotificationsView() {
  const root = useWorkspaceRoot();
  const [items, setItems] = useState<WorkspaceNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const result = await workspaceRequest<{ notifications: WorkspaceNotification[] }>('workspace', { action: 'notifications.list' }); setItems(result.notifications || []); } catch (cause) { setError(errorMessage(cause)); } finally { setLoading(false); } }, []);
  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(initial); }, [load]);
  const mark = async (id: string, read: boolean) => {
    setItems(current => current.map(item => item.id === id ? { ...item, read_at: read ? new Date().toISOString() : null } : item));
    try { await workspaceRequest('workspace', { action: 'notification.read', notificationId: id, read }); } catch (cause) { setError(errorMessage(cause)); void load(); }
  };
  const unread = items.filter(item => !item.read_at).length;
  return <div className="workspace-stack"><div className="studio-section-intro"><div><span className="dash-eyebrow"><Inbox size={13} /> WORKSPACE / INBOX</span><h2>Notifications</h2><p>Review decisions, mentions, and workspace events connected to your real project activity.</p></div><span className="studio-card-icon"><Bell size={25} /></span></div><SignalPanel title={unread ? `${unread} unread updates` : 'Your notification inbox'} subtitle="Notifications are created by workspace actions and remain tied to your account." action={<button className="dash-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'dash-spinning' : ''} />Refresh</button>}>{error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}{loading && !items.length ? <div className="dash-loading" role="status">Loading notifications…</div> : items.length ? <div className="signal-inbox-list">{items.map(item => <article className={`signal-inbox-item ${item.read_at ? '' : 'is-unread'}`} key={item.id}><span className="signal-notification-icon"><Inbox size={16} /></span><div className="signal-inbox-copy"><div className="signal-inbox-meta"><span>{item.kind.replace('.', ' · ')}</span><time>{timeLabel(item.created_at)}</time></div><h3>{item.title}</h3><p>{item.body || 'Workspace activity was recorded.'}</p><div className="workspace-actions"><Link className="dash-button" to={notificationHref(item, root)}>Open activity <ExternalLink size={13} /></Link><button className="dash-button" onClick={() => void mark(item.id, !item.read_at)}>{item.read_at ? 'Mark unread' : 'Mark read'}</button></div></div></article>)}</div> : <SignalEmpty icon={<Inbox size={25} />} title="No notifications yet" description="When a mentor reviews a delivery or someone mentions you in a project comment, the update will appear here." />}</SignalPanel></div>;
}

export function TodayView({ data, user }: { data: DashboardData; user: User }) {
  const today = localDateKey();
  const stats = getDashboardStats(data, today);
  const dueToday = data.milestones.filter(task => task.due_date === today && !isComplete(task.status) && !isInactive(task.status));
  const overdue = data.milestones.filter(task => Boolean(task.due_date && task.due_date < today) && !isComplete(task.status) && !isInactive(task.status));
  const reviewQueue = data.milestones.filter(task => task.status === 'SUBMITTED');
  const upcoming = upcomingMilestones(data.milestones).slice(0, 5);
  const evidenceCount = data.milestones.reduce((sum, task) => sum + getDocuments([task]).length, 0);
  const role = user.app_metadata.workspace_role === 'student' || !user.app_metadata.workspace_role ? 'student' : user.app_metadata.workspace_role;
  const noCoreData = data.errors.some(error => ['Projects', 'Team projects', 'Milestones'].includes(error.section));
  const taskLink = (task: Milestone) => `/dashboard/projects/${encodeURIComponent(task.squad_id)}#milestone-${encodeURIComponent(task.id)}`;
  return <div className="workspace-stack"><section className="signal-today-hero"><div><span className="dash-eyebrow"><Sparkles size={13} /> TODAY / REAL WORKSPACE SIGNALS</span><h2>Make the next move count.</h2><p>A focused view of what needs attention across your connected project workspaces.</p></div><div className="signal-today-date"><strong>{new Date(`${today}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</strong><span>{new Date(`${today}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></div></section>{noCoreData && <div className="dash-alert dash-alert-error" role="alert">Today’s workspace signals are incomplete because some connected project data could not be loaded. Refresh to try again.</div>}<div className="signal-today-grid"><SignalPanel title="Today’s focus" subtitle="Deadlines that need a decision today.">{dueToday.length ? <div className="signal-task-list">{dueToday.map(task => <Link to={taskLink(task)} className="signal-task" key={task.id}><span className="signal-task-icon"><Clock3 size={16} /></span><span><strong>{task.name}</strong><small>{data.squads.find(project => project.id === task.squad_id)?.title || 'Project'} · Due today</small></span><CircleAlert size={15} /></Link>)}</div> : <SignalEmpty icon={<CheckCircle2 size={24} />} title="No deadlines today" description="Your next dated milestone will appear in the upcoming plan." />}</SignalPanel><SignalPanel title="Workspace pulse" subtitle="Computed from records currently visible to your account."><div className="signal-pulse-grid"><div><span>Open work</span><strong>{noCoreData ? '—' : stats.pendingTasks}</strong><small>milestones</small></div><div><span>Overdue</span><strong>{noCoreData ? '—' : overdue.length}</strong><small>need attention</small></div><div><span>Evidence</span><strong>{noCoreData ? '—' : evidenceCount}</strong><small>linked records</small></div><div><span>Delivery</span><strong>{noCoreData ? '—' : `${stats.completion}%`}</strong><small>approved</small></div></div></SignalPanel></div><div className="signal-today-grid"><SignalPanel title={role === 'student' ? 'Next deliveries' : 'Review queue'} subtitle={role === 'student' ? 'Your next five open milestones.' : 'Submitted milestones from visible project workspaces.'} action={<Link className="dash-text-link" to={role === 'student' ? '/dashboard/tasks' : '/dashboard/mentorship'}>Open workspace <ExternalLink size={13} /></Link>}>{(role === 'student' ? upcoming : reviewQueue).length ? <div className="signal-task-list">{(role === 'student' ? upcoming : reviewQueue).slice(0, 5).map(task => <Link to={taskLink(task)} className="signal-task" key={task.id}><span className="signal-task-icon"><FileCheck2 size={16} /></span><span><strong>{task.name}</strong><small>{data.squads.find(project => project.id === task.squad_id)?.title || 'Project'} · {role === 'student' ? `Due ${dateLabel(task.due_date)}` : 'Awaiting review'}</small></span><ExternalLink size={15} /></Link>)}</div> : <SignalEmpty icon={<FileCheck2 size={24} />} title={role === 'student' ? 'No upcoming deliveries' : 'Review queue is clear'} description={role === 'student' ? 'Add a due date to a milestone to make it part of your delivery plan.' : 'Submitted deliveries from your assigned project workspaces will appear here.'} />}</SignalPanel><SignalPanel title="Evidence readiness" subtitle="A transparent signal from submitted links and approved milestones."><div className="signal-readiness"><div className="signal-readiness-icon"><ShieldCheck size={21} /></div><div><strong>{stats.completedTasks} approved milestone{stats.completedTasks === 1 ? '' : 's'}</strong><p>{evidenceCount ? `${evidenceCount} linked evidence record${evidenceCount === 1 ? '' : 's'} found in milestone submissions.` : 'No linked milestone evidence has been recorded yet.'}</p><Link className="dash-text-link" to="/dashboard/portfolio">View portfolio readiness <ExternalLink size={13} /></Link></div></div></SignalPanel></div><SignalPanel title="Needs attention" subtitle="Open work that has moved past its due date.">{overdue.length ? <div className="signal-task-list">{overdue.slice(0, 8).map(task => <Link to={taskLink(task)} className="signal-task is-overdue" key={task.id}><span className="signal-task-icon"><CircleAlert size={16} /></span><span><strong>{task.name}</strong><small>{data.squads.find(project => project.id === task.squad_id)?.title || 'Project'} · Due {dateLabel(task.due_date)}</small></span><ExternalLink size={15} /></Link>)}</div> : <SignalEmpty icon={<CheckCircle2 size={24} />} title="Nothing overdue" description="Keep the momentum going. New changes will show up here as your workspace updates." />}</SignalPanel></div>;
}

export function EvidenceTimeline({ projectId, canVerify, currentUserId, onSaved }: { projectId: string; canVerify: boolean; currentUserId: string; onSaved: (message: string) => Promise<void> }) {
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [comment, setComment] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const [evidenceResult, commentResult] = await Promise.all([workspaceRequest<{ evidence: EvidenceRecord[] }>('workspace', { action: 'evidence.list', projectId }), workspaceRequest<{ comments: CommentRecord[] }>('workspace', { action: 'comments.list', projectId })]); setEvidence(evidenceResult.evidence || []); setComments(commentResult.comments || []); } catch (cause) { setError(errorMessage(cause)); } finally { setLoading(false); } }, [projectId]);
  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(initial); }, [load]);
  const submitEvidence = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); setBusy(true); setError(''); try { await workspaceRequest('workspace', { action: 'evidence.create', projectId, title: values.title, kind: values.kind, url: values.url, description: values.description }); setShowEvidenceForm(false); await load(); await onSaved('Evidence added to the project timeline.'); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } };
  const submitComment = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!comment.trim()) return; setBusy(true); setError(''); try { await workspaceRequest('workspace', { action: 'comment.create', projectId, body: comment.trim() }); setComment(''); await load(); await onSaved('Comment added to the project timeline.'); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } };
  const removeEvidence = async (id: string) => { if (!window.confirm('Remove this evidence record?')) return; setBusy(true); setError(''); try { await workspaceRequest('workspace', { action: 'evidence.delete', projectId, evidenceId: id }); await load(); await onSaved('Evidence removed.'); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } };
  const verifyEvidence = async (item: EvidenceRecord) => { if (!canVerify || (!item.verified && item.author_id === currentUserId)) return; setBusy(true); setError(''); try { await workspaceRequest('workspace', { action: 'evidence.verify', projectId, evidenceId: item.id, verified: !item.verified }); await load(); await onSaved(item.verified ? 'Evidence verification removed.' : 'Evidence verified.'); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } };
  const timeline = useMemo(() => [...evidence.map(item => ({ type: 'evidence' as const, at: item.created_at, item })), ...comments.map(item => ({ type: 'comment' as const, at: item.created_at, item }))].sort((a, b) => b.at.localeCompare(a.at)), [evidence, comments]);
  return <div className="signal-evidence"><div className="workspace-actions signal-evidence-toolbar"><span className="workspace-muted">Evidence and comments are visible to everyone with project access.</span><button className="dash-button dash-button-primary" onClick={() => setShowEvidenceForm(value => !value)}><Plus size={14} />Add evidence</button></div>{error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}{showEvidenceForm && <form className="dash-form signal-evidence-form" onSubmit={event => void submitEvidence(event)}><div className="dash-form-grid"><label>Title<input name="title" required maxLength={200} placeholder="Prototype walkthrough" /></label><label>Evidence type<select name="kind" defaultValue="LINK"><option value="LINK">Link</option><option value="DOCUMENT">Document</option><option value="DEMO">Demo</option><option value="REPOSITORY">Repository</option><option value="NOTE">Note</option></select></label></div><label>URL (optional)<input name="url" type="url" maxLength={2000} placeholder="https://…" /></label><label>Context<textarea name="description" rows={3} maxLength={4000} placeholder="What does this record prove?" /></label><div className="dash-dialog-actions"><button type="button" className="dash-button" onClick={() => setShowEvidenceForm(false)}>Cancel</button><button className="dash-button dash-button-primary" disabled={busy}><Send size={14} />Save evidence</button></div></form>}{loading && !timeline.length ? <div className="dash-loading" role="status">Loading project signals…</div> : timeline.length ? <div className="signal-timeline">{timeline.map(record => record.type === 'evidence' ? <article className="signal-timeline-item" key={`evidence-${record.item.id}`}><span className="signal-timeline-marker"><FileCheck2 size={15} /></span><div className="signal-timeline-card"><div className="signal-inbox-meta"><span>{record.item.kind} · Evidence</span><time>{dateLabel(record.item.created_at)}</time></div><h3>{record.item.title}</h3>{record.item.description && <p>{record.item.description}</p>}{record.item.url && <a className="dash-text-link" href={record.item.url} target="_blank" rel="noreferrer">Open linked evidence <ExternalLink size={13} /></a>}<div className="signal-timeline-footer"><span>{record.item.verified ? <span className="signal-verified"><ShieldCheck size={13} />Mentor verified</span> : <span className="workspace-muted">Pending verification</span>}</span><div className="workspace-actions">{canVerify && <button className="dash-button" disabled={busy || (!record.item.verified && record.item.author_id === currentUserId)} onClick={() => void verifyEvidence(record.item)}>{record.item.verified ? 'Unverify' : 'Verify'}</button>}<button className="dash-icon-button" aria-label={`Remove ${record.item.title}`} disabled={busy} onClick={() => void removeEvidence(record.item.id)}><Trash2 size={14} /></button></div></div></div></article> : <article className="signal-timeline-item" key={`comment-${record.item.id}`}><span className="signal-timeline-marker"><MessageSquare size={15} /></span><div className="signal-timeline-card"><div className="signal-inbox-meta"><span>Comment</span><time>{dateLabel(record.item.created_at)}</time></div><p className="signal-comment-body">{record.item.body}</p><small className="workspace-muted">Author {record.item.author_id.slice(0, 8)}…</small></div></article>)}</div> : <SignalEmpty icon={<FileCheck2 size={25} />} title="No evidence has been recorded" description="Add a real link, document, demo, or note to build the project’s evidence timeline." />}{!loading && <form className="signal-comment-form" onSubmit={event => void submitComment(event)}><label htmlFor="project-comment"><MessageSquare size={15} />Add a project comment</label><div><textarea id="project-comment" value={comment} onChange={event => setComment(event.target.value)} maxLength={4000} rows={2} placeholder="Share context with the project team…" /><button className="dash-button dash-button-primary" disabled={busy || !comment.trim()}><Send size={14} />Post</button></div></form>}<p className="signal-evidence-note"><CalendarClock size={14} />Existing milestone submission links remain available in the Milestones tab. This timeline only shows records stored in the evidence service.</p></div>;
}
