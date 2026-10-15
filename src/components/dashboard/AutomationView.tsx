import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { Cloud, Download, Gauge, ListChecks, Pause, Play, Plus, RefreshCw, ShieldCheck, TestTube2, UserRound, Wrench, X } from 'lucide-react';
import type { DashboardData, Member, Squad } from '../../lib/dashboard-data';
import { downloadText, errorMessage, workspaceRequest } from '../../lib/workspace-api';
import { workspaceRole } from '../../lib/workspace-roles';

type TaskType = 'MILESTONE_AUDIT' | 'HTTP_CHECK';
type Frequency = 'ONCE' | 'DAILY' | 'WEEKLY';
type WorkStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
type AssigneeRole = 'DEVELOPER' | 'TESTER';

interface AutomationTask {
  id: string;
  project_id: string;
  manager_id: string;
  title: string;
  description: string;
  task_type: TaskType;
  target_url: string | null;
  frequency: Frequency;
  next_run_at: string | null;
  status: string;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string;
  created_at: string;
  updated_at: string;
}

interface AutomationReport {
  id: string;
  task_id: string;
  project_id: string;
  manager_id: string;
  scheduled_for: string;
  started_at: string;
  completed_at: string | null;
  status: 'PASS' | 'FAIL' | 'ERROR';
  summary: string;
  details: Record<string, unknown>;
  error: string;
}

interface AutomationWork {
  id: string;
  project_id: string;
  report_id: string | null;
  manager_id: string;
  developer_id: string;
  assignee_role: AssigneeRole;
  title: string;
  description: string;
  due_at: string | null;
  status: WorkStatus;
  created_at: string;
  updated_at: string;
}

interface AutomationLists { tasks: AutomationTask[]; reports: AutomationReport[]; work: AutomationWork[] }

const workStatuses: WorkStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

function nextHourInput() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string | null) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function projectName(projects: Squad[], projectId: string) {
  return projects.find(project => project.id === projectId)?.title || 'Project workspace';
}

function memberName(members: Member[], id: string) {
  const member = members.find(item => item.user_id === id || item.id === id);
  return member ? `${member.name} · ${member.email}` : 'Assigned project member';
}

function canManage(project: Squad | undefined, user: User) {
  if (!project) return false;
  if (workspaceRole(user) === 'admin') return true;
  return project.leader_email.toLowerCase() === (user.email || '').toLowerCase() || project.mentor_id === user.id || project.mentor_id?.toLowerCase() === (user.email || '').toLowerCase();
}

function AutomationPanel({ title, subtitle, action, children }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  return <section className="dash-panel automation-panel"><div className="dash-panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>{children}</section>;
}

export default function AutomationView({ data, user }: { data: DashboardData; user: User }) {
  const [lists, setLists] = useState<AutomationLists>({ tasks: [], reports: [], work: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [assignment, setAssignment] = useState<{ reportId: string; projectId: string; developerId: string; assigneeRole: AssigneeRole; title: string; description: string; dueAt: string }>({ reportId: '', projectId: '', developerId: '', assigneeRole: 'DEVELOPER', title: '', description: '', dueAt: '' });
  const [taskForm, setTaskForm] = useState({ projectId: data.squads[0]?.id || '', title: '', description: '', taskType: 'MILESTONE_AUDIT' as TaskType, targetUrl: '', frequency: 'ONCE' as Frequency, nextRunAt: nextHourInput() });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [tasks, reports, work] = await Promise.all([
        workspaceRequest<{ tasks: AutomationTask[] }>('automation', { action: 'task.list' }),
        workspaceRequest<{ reports: AutomationReport[] }>('automation', { action: 'report.list' }),
        workspaceRequest<{ work: AutomationWork[] }>('automation', { action: 'work.list' }),
      ]);
      setLists({ tasks: tasks.tasks || [], reports: reports.reports || [], work: work.work || [] });
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(initial); }, [load]);
  useEffect(() => { if (!taskForm.projectId && data.squads[0]) setTaskForm(current => ({ ...current, projectId: data.squads[0].id })); }, [data.squads, taskForm.projectId]);

  const projects = useMemo(() => data.squads.filter(project => !['CANCELLED', 'CANCELED', 'ARCHIVED', 'REJECTED'].includes((project.status || '').toUpperCase())), [data.squads]);
  const activeTasks = lists.tasks.filter(task => task.status === 'ACTIVE').length;
  const pendingWork = lists.work.filter(item => !['DONE', 'CANCELLED'].includes(item.status)).length;

  const projectMembers = (projectId: string) => data.members.filter(member => member.squad_id === projectId && Boolean(member.user_id));
  const beginAssignment = (report: AutomationReport) => {
    const members = projectMembers(report.project_id);
    const first = members[0];
    setAssignment({ reportId: report.id, projectId: report.project_id, developerId: first?.user_id || '', assigneeRole: 'DEVELOPER', title: `Follow up: ${report.summary.slice(0, 120)}`, description: report.summary, dueAt: '' });
  };

  const submitTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy('task'); setError('');
    try {
      await workspaceRequest('automation', { action: 'task.create', projectId: taskForm.projectId, title: taskForm.title, description: taskForm.description, taskType: taskForm.taskType, targetUrl: taskForm.taskType === 'HTTP_CHECK' ? taskForm.targetUrl : '', frequency: taskForm.frequency, nextRunAt: new Date(taskForm.nextRunAt).toISOString() });
      setTaskForm(current => ({ ...current, title: '', description: '', targetUrl: '' })); setTaskFormOpen(false); await load();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(null); }
  };

  const changeTask = async (task: AutomationTask) => {
    setBusy(task.id); setError('');
    try { await workspaceRequest('automation', { action: task.status === 'PAUSED' ? 'task.resume' : 'task.pause', taskId: task.id }); await load(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(null); }
  };

  const submitAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy('assignment'); setError('');
    try { await workspaceRequest('automation', { action: 'work.create', projectId: assignment.projectId, reportId: assignment.reportId, developerId: assignment.developerId, assigneeRole: assignment.assigneeRole, title: assignment.title, description: assignment.description, dueAt: assignment.dueAt ? new Date(assignment.dueAt).toISOString() : '' }); setAssignment(current => ({ ...current, reportId: '' })); await load(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(null); }
  };

  const changeWorkStatus = async (item: AutomationWork, status: WorkStatus) => {
    setBusy(item.id); setError('');
    try { await workspaceRequest('automation', { action: 'work.status', workId: item.id, status }); await load(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(null); }
  };

  const exportWorkLog = () => {
    const lines = ['# PlacePMS automation work log', '', `Generated: ${new Date().toISOString()}`, '', '## Cloud execution', 'Scheduled checks run on the deployed server through Vercel Cron; they do not require this laptop to stay on.', '', '## Tasks', ...lists.tasks.map(task => `- **${task.title}** · ${projectName(data.squads, task.project_id)} · ${task.task_type} · ${task.status} · next run ${formatDate(task.next_run_at)}`), '', '## Reports', ...lists.reports.map(report => `- **${report.status}** · ${projectName(data.squads, report.project_id)} · ${report.summary} · ${formatDate(report.completed_at || report.started_at)}`), '', '## Follow-up work', ...lists.work.map(item => `- **${item.status}** · ${item.assignee_role.toLowerCase()} · ${item.title} · ${memberName(data.members, item.developer_id)} · ${projectName(data.squads, item.project_id)}`), '', '## Token status', 'These automations run deterministic milestone audits and public HTTP checks only. They do not call an AI model, so a model-token countdown or 10M warning is not applicable.'].join('\n');
    downloadText('placepms-automation-work-log.md', lines, 'text/markdown;charset=utf-8');
  };

  const visibleManagerProjects = projects.filter(project => canManage(project, user));
  const assignmentProject = projects.find(project => project.id === assignment.projectId);
  const canAssign = canManage(assignmentProject, user);

  return <div className="workspace-stack automation-view">
    <div className="studio-section-intro"><div><span className="dash-eyebrow"><ListChecks size={13} /> WORKSPACE / CLOUD AUTOMATION</span><h2>Manager, tester, developer.</h2><p>Schedule safe project checks, turn failed results into owned work, and keep one exportable record of every automation outcome.</p></div><span className="studio-card-icon"><Cloud size={25} /></span></div>
    <div className="workspace-callout automation-cloud-callout"><Cloud size={22} /><div><strong>Runs in the cloud while your laptop is offline</strong><p>Once a task is saved, Vercel Cron wakes the server every five minutes. You can reconnect later to see the persisted report and notifications.</p></div><ShieldCheck size={18} /></div>
    <div className="workspace-callout automation-token-callout"><Gauge size={22} /><div><strong>OmniRush worker: not connected</strong><p>The current OmniRush CLI session cannot keep running after this laptop shuts down. This website currently runs deterministic checks only; it does not fake AI usage or a 10M-token warning. A remote OmniRush worker endpoint is required for that next step.</p></div></div>
    {error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}
    <div className="workspace-metrics"><div><span>Active cloud tasks</span><strong>{activeTasks}</strong></div><div><span>Reports retained in view</span><strong>{lists.reports.length}</strong></div><div><span>Open follow-up work</span><strong>{pendingWork}</strong></div><div><span>Manager projects</span><strong>{visibleManagerProjects.length}</strong></div></div>

    <AutomationPanel title="Scheduled checks" subtitle="Only project managers can create, pause, or resume a check." action={<div className="workspace-actions"><button className="dash-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'dash-spinning' : ''} />Refresh</button><button className="dash-button" onClick={exportWorkLog}><Download size={14} />Export one work log</button>{visibleManagerProjects.length > 0 && <button className="dash-button dash-button-primary" onClick={() => setTaskFormOpen(value => !value)}><Plus size={14} />{taskFormOpen ? 'Close scheduler' : 'Schedule check'}</button>}</div>}>
      {taskFormOpen && <form className="dash-form automation-form" onSubmit={event => void submitTask(event)}><div className="dash-form-grid"><label>Project<select required value={taskForm.projectId} onChange={event => setTaskForm(current => ({ ...current, projectId: event.target.value }))}>{visibleManagerProjects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label><label>Check type<select value={taskForm.taskType} onChange={event => setTaskForm(current => ({ ...current, taskType: event.target.value as TaskType }))}><option value="MILESTONE_AUDIT">Milestone audit</option><option value="HTTP_CHECK">Public HTTP check</option></select></label><label>Repeat<select value={taskForm.frequency} onChange={event => setTaskForm(current => ({ ...current, frequency: event.target.value as Frequency }))}><option value="ONCE">Once</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option></select></label><label>First run<input type="datetime-local" required value={taskForm.nextRunAt} onChange={event => setTaskForm(current => ({ ...current, nextRunAt: event.target.value }))} /></label></div><label>Title<input required maxLength={200} value={taskForm.title} onChange={event => setTaskForm(current => ({ ...current, title: event.target.value }))} placeholder="Weekly delivery health check" /></label><label>Description<textarea rows={2} maxLength={4000} value={taskForm.description} onChange={event => setTaskForm(current => ({ ...current, description: event.target.value }))} placeholder="What should the manager review when this runs?" /></label>{taskForm.taskType === 'HTTP_CHECK' && <label>Public target URL<input required type="url" maxLength={2000} value={taskForm.targetUrl} onChange={event => setTaskForm(current => ({ ...current, targetUrl: event.target.value }))} placeholder="https://example.com/health" /></label>}<div className="dash-dialog-actions"><button type="button" className="dash-button" onClick={() => setTaskFormOpen(false)}>Cancel</button><button className="dash-button dash-button-primary" disabled={busy === 'task'}>{busy === 'task' ? 'Saving…' : 'Save cloud task'}</button></div></form>}
      {loading && !lists.tasks.length ? <div className="dash-loading" role="status">Loading cloud tasks…</div> : lists.tasks.length ? <div className="workspace-list automation-list">{lists.tasks.map(task => { const manager = canManage(projects.find(project => project.id === task.project_id), user); return <article className="workspace-list-item" key={task.id}><span className="automation-icon"><ListChecks size={16} /></span><div><h3>{task.title}</h3><p>{projectName(data.squads, task.project_id)} · {task.task_type === 'HTTP_CHECK' ? 'Public HTTP check' : 'Milestone audit'} · {task.frequency.toLowerCase()}</p><small>Next run: {formatDate(task.next_run_at)}{task.last_status ? ` · Last result: ${task.last_status}` : ''}{task.last_error ? ` · ${task.last_error}` : ''}</small></div><span className={`dash-status ${task.status === 'ACTIVE' ? 'is-complete' : ''}`}>{task.status}</span>{manager && ['ACTIVE', 'PAUSED'].includes(task.status) && <button className="dash-button" disabled={busy === task.id} onClick={() => void changeTask(task)}>{task.status === 'PAUSED' ? <Play size={13} /> : <Pause size={13} />}{task.status === 'PAUSED' ? 'Resume' : 'Pause'}</button>}</article>; })}</div> : <div className="dash-empty"><span className="dash-empty-icon"><ListChecks size={24} /></span><h3>No cloud checks yet</h3><p>Schedule a milestone audit or a check against a deployed public URL.</p></div>}
    </AutomationPanel>

    <AutomationPanel title="Automation reports" subtitle="Every cloud execution is saved with its result and details.">
      {loading && !lists.reports.length ? <div className="dash-loading" role="status">Loading reports…</div> : lists.reports.length ? <div className="workspace-list automation-list">{lists.reports.map(report => <article className="workspace-list-item" key={report.id}><span className={`automation-icon automation-result-${report.status.toLowerCase()}`}>{report.status === 'PASS' ? <ShieldCheck size={16} /> : <TestTube2 size={16} />}</span><div><h3>{report.summary}</h3><p>{projectName(data.squads, report.project_id)} · {report.status} · {formatDate(report.completed_at || report.started_at)}</p>{report.error && <small className="workspace-danger">{report.error}</small>}</div>{canManage(projects.find(project => project.id === report.project_id), user) && <button className="dash-button" onClick={() => beginAssignment(report)}><Plus size={13} />Assign follow-up</button>}</article>)}</div> : <div className="dash-empty"><span className="dash-empty-icon"><TestTube2 size={24} /></span><h3>No reports yet</h3><p>Reports will appear after the deployed cron runner claims a due task.</p></div>}
      {assignment.reportId && <form className="dash-form automation-form" onSubmit={event => void submitAssignment(event)}><div className="workspace-actions"><strong>Assign follow-up work</strong><button type="button" className="dash-icon-button" aria-label="Close assignment form" onClick={() => setAssignment(current => ({ ...current, reportId: '' }))}><X size={16} /></button></div><div className="dash-form-grid"><label>Role<select value={assignment.assigneeRole} onChange={event => setAssignment(current => ({ ...current, assigneeRole: event.target.value as AssigneeRole }))}><option value="DEVELOPER">Developer</option><option value="TESTER">Tester</option></select></label><label>Assignee<select required value={assignment.developerId} onChange={event => setAssignment(current => ({ ...current, developerId: event.target.value }))}><option value="">Select a project member</option>{projectMembers(assignment.projectId).map(member => <option key={member.user_id} value={member.user_id!}>{member.name} · {member.email}</option>)}</select></label><label>Due date<input type="datetime-local" value={assignment.dueAt} onChange={event => setAssignment(current => ({ ...current, dueAt: event.target.value }))} /></label></div><label>Work title<input required maxLength={200} value={assignment.title} onChange={event => setAssignment(current => ({ ...current, title: event.target.value }))} /></label><label>Instructions<textarea rows={2} maxLength={4000} value={assignment.description} onChange={event => setAssignment(current => ({ ...current, description: event.target.value }))} /></label><div className="dash-dialog-actions"><button type="button" className="dash-button" onClick={() => setAssignment(current => ({ ...current, reportId: '' }))}>Cancel</button><button className="dash-button dash-button-primary" disabled={busy === 'assignment' || !canAssign || !assignment.developerId}>{busy === 'assignment' ? 'Assigning…' : 'Assign work'}</button></div></form>}
    </AutomationPanel>

    <AutomationPanel title="Manager · tester · developer work" subtitle="Managers assign the work; the selected tester or developer updates its status.">
      {loading && !lists.work.length ? <div className="dash-loading" role="status">Loading follow-up work…</div> : lists.work.length ? <div className="workspace-list automation-list">{lists.work.map(item => <article className="workspace-list-item" key={item.id}><span className="automation-icon">{item.assignee_role === 'TESTER' ? <TestTube2 size={16} /> : <Wrench size={16} />}</span><div><h3>{item.title}</h3><p>{projectName(data.squads, item.project_id)} · {item.assignee_role.toLowerCase()} · {memberName(data.members, item.developer_id)}</p><small>{item.description || 'No instructions added.'}{item.due_at ? ` · Due ${formatDate(item.due_at)}` : ''}</small></div><select className="workspace-input automation-status-select" aria-label={`Status for ${item.title}`} value={item.status} disabled={busy === item.id} onChange={event => void changeWorkStatus(item, event.target.value as WorkStatus)}>{workStatuses.map(status => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></article>)}</div> : <div className="dash-empty"><span className="dash-empty-icon"><UserRound size={24} /></span><h3>No follow-up work assigned</h3><p>When a report needs action, a manager can assign it to a registered tester or developer here.</p></div>}
    </AutomationPanel>
  </div>;
}
