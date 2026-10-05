import { useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronRight, Circle, Clock3, FileText, FolderKanban, GraduationCap, Link2, Orbit, Plus, Search, Sparkles, Users } from 'lucide-react';
import type { DashboardData, Milestone, Squad } from '../../lib/dashboard-data';
import { getDashboardStats, isComplete, isInactive, localDateKey, safeExternalUrl, upcomingMilestones } from '../../lib/dashboard-data';
import { supabase } from '../../lib/supabase';
import IntegrationWorkspace from './IntegrationWorkspace';
import SessionsView from './SessionsView';
import LibraryView from './LibraryView';
import BlackbookView from './BlackbookView';
import CalendarView from './CalendarView';
import ProjectDetails from './ProjectDetails';
import WorkspaceInsights from './WorkspaceInsights';
import { milestoneCsv, milestoneMatches, profileCompletion, sortMilestones } from '../../lib/workspace-insights';
import { downloadText } from '../../lib/workspace-api';
import { reportHtml } from '../../lib/workspace-library';

interface Props {
  view: string;
  data: DashboardData;
  user: User;
  onCreate: (kind: 'project' | 'milestone' | 'profile') => void;
  onSaved: (message: string) => Promise<void>;
}

function formatDate(value: string | null, withTime = false) {
  if (!value) return 'No date set';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } as const : {}) }).format(date);
}

export function EmptyState({ icon = <FolderKanban size={25} />, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="dash-empty"><span className="dash-empty-icon">{icon}</span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function Status({ value }: { value: string | null }) {
  const complete = isComplete(value);
  return <span className={`dash-status ${complete ? 'is-complete' : isInactive(value) ? 'is-inactive' : ''}`}>{complete ? <Check size={11} /> : <span />}{value ? value.replace(/_/g, ' ').toLowerCase() : 'Not set'}</span>;
}

function Panel({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`dash-panel ${className}`}><div className="dash-panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

function ProjectCard({ project, data }: { project: Squad; data: DashboardData }) {
  const milestones = data.milestones.filter(task => task.squad_id === project.id && !isInactive(task.status));
  const completed = milestones.filter(task => isComplete(task.status)).length;
  const members = data.members.filter(member => member.squad_id === project.id);
  const repository = safeExternalUrl(project.github_repo);
  const tasksUnavailable = data.errors.some(error => error.section === 'Milestones');
  return <article className="dash-project-card">
    <div className="dash-row"><span className="dash-project-icon"><FolderKanban size={20} /></span><Status value={project.status} /></div>
    <h3><Link to={`/dashboard/projects/${encodeURIComponent(project.id)}`}>{project.title}</Link></h3><p>{project.tagline || project.summary || 'No description added yet.'}</p>
    <div className="dash-tags">{project.domain && <span>{project.domain}</span>}{project.current_phase && <span>{project.current_phase}</span>}</div>
    <div className="dash-project-progress"><span>Milestones</span><strong>{tasksUnavailable ? 'Unavailable' : `${completed} / ${milestones.length}`}</strong></div>
    <div className="dash-progress" role="progressbar" aria-label={`${project.title} milestone completion`} aria-valuenow={milestones.length ? Math.round(completed / milestones.length * 100) : 0} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${milestones.length ? completed / milestones.length * 100 : 0}%` }} /></div>
    <div className="dash-project-footer"><span><Users size={14} />{members.length} team member{members.length === 1 ? '' : 's'}</span>{repository && <a href={repository} target="_blank" rel="noreferrer">Repository <ArrowUpRight size={14} /></a>}</div>
    <Link className="dash-text-link workspace-spaced" to={`/dashboard/projects/${encodeURIComponent(project.id)}`}>Open project workspace <ChevronRight size={14} /></Link>
  </article>;
}

function TaskList({ tasks, data, onSaved }: { tasks: Milestone[]; data: DashboardData; onSaved: Props['onSaved'] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  return <div className="dash-task-list">
    {error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}
    {tasks.map(task => {
      const complete = isComplete(task.status);
      const submitted = task.status === 'SUBMITTED';
      const overdue = !complete && !isInactive(task.status) && Boolean(task.due_date && task.due_date < localDateKey());
      return <article className="dash-task" key={task.id}>
        <button className={`dash-task-check ${complete || submitted ? 'checked' : ''}`} disabled={busy !== null || complete || isInactive(task.status)} aria-label={`${complete ? 'Approved' : submitted ? 'Withdraw submission for' : 'Submit'} ${task.name}`} title={complete ? 'Approved by your mentor' : submitted ? 'Withdraw submission' : 'Submit for review'} onClick={async () => {
          if (!supabase) return;
          setBusy(task.id);
          setError('');
          try {
            const { data: changed, error: updateError } = await supabase.from('milestones').update({ status: submitted ? 'PENDING' : 'SUBMITTED', submitted_at: submitted ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', task.id).eq('squad_id', task.squad_id).eq('status', task.status || 'PENDING').select('id');
            if (updateError) throw updateError;
            if (!changed?.length) throw new Error('This milestone was not updated. Your account may not have permission.');
            await onSaved(submitted ? 'Submission withdrawn.' : 'Milestone submitted for review.');
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : typeof cause === 'object' && cause && 'message' in cause ? String(cause.message) : 'Unable to update this milestone.');
          } finally { setBusy(null); }
        }}>{busy === task.id ? <Clock3 size={17} /> : complete || submitted ? <CheckCircle2 size={19} /> : <Circle size={19} />}</button>
        <div className="dash-task-copy"><h3>{task.name}</h3><p><Link to={`/dashboard/projects/${encodeURIComponent(task.squad_id)}`}>{data.squads.find(squad => squad.id === task.squad_id)?.title || 'Project'}</Link><span>·</span>{task.phase}</p>{task.mentor_feedback && <p>Feedback: {task.mentor_feedback}</p>}{task.score !== null && task.score !== undefined && <p>Review score: {task.score}/100</p>}<Link className="dash-text-link" to={`/dashboard/projects/${encodeURIComponent(task.squad_id)}#milestone-${encodeURIComponent(task.id)}`}>Details & submission links</Link></div>
        <div className="dash-task-meta"><Status value={task.status} /><span className={overdue ? 'dash-overdue' : ''}>{overdue && 'Overdue · '}{formatDate(task.due_date)}</span></div>
      </article>;
    })}
  </div>;
}

export default function DashboardViews({ view, data, user, onCreate, onSaved }: Props) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const taskFilter = params.get('status') || 'all';
  const projectFilter = params.get('project') || '';
  const [sort, setSort] = useState('due');
  const [projectSort, setProjectSort] = useState('newest');
  const [projectStatus, setProjectStatus] = useState('active');
  const [taskLayout, setTaskLayout] = useState('list');
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); if (value && value !== 'all') next.set(key, value); else next.delete(key); setParams(next, { replace: true }); };
  const stats = getDashboardStats(data);
  const upcoming = upcomingMilestones(data.milestones);
  const nextDeadline = upcoming[0];
  const nextProject = nextDeadline ? data.squads.find(project => project.id === nextDeadline.squad_id) : null;
  const search = query.trim().toLowerCase();
  const projectAction = <button className="dash-button dash-button-primary" onClick={() => onCreate('project')}><Plus size={15} />Create project</button>;
  const taskAction = <button className="dash-button dash-button-primary" disabled={!data.squads.some(project => !isInactive(project.status))} onClick={() => onCreate('milestone')}><Plus size={15} />Add milestone</button>;
  const projectError = data.errors.some(error => ['Projects', 'Team projects', 'Memberships', 'Mentorship'].includes(error.section));
  const taskError = projectError || data.errors.some(error => error.section === 'Milestones');

  if (['integrations', 'repositories', 'figma', 'miro'].includes(view)) return <IntegrationWorkspace view={view} data={data} onChanged={() => onSaved('')} />;
  if (view === 'sessions') return <SessionsView />;
  if (['research', 'resources', 'documents'].includes(view)) return <LibraryView kind={view === 'research' ? 'research' : view === 'resources' ? 'resource' : 'document'} data={data} user={user} />;
  if (view === 'blackbook') return <BlackbookView data={data} user={user} />;
  if (view.startsWith('projects/')) return <ProjectDetails id={decodeURIComponent(view.slice('projects/'.length))} data={data} user={user} onSaved={onSaved} onCreate={onCreate} />;

  if (view === 'overview') return <>
    <section className="dash-hero">
      <div className="dash-hero-copy">
        <span className="dash-eyebrow"><Sparkles size={13} /> YOUR NEXT CHAPTER</span>
        <h2>Big ideas.<br /><span>Real momentum.</span></h2>
        <p>A space to build something that matters.</p>
        <div className="dash-hero-actions">
          {projectAction}
          <button className="dash-button dash-button-ghost" disabled={!data.squads.length} onClick={() => onCreate('milestone')}><Plus size={15} />Add a milestone</button>
          <Link className="dash-hero-link" to="/dashboard/calendar">Open calendar <ArrowUpRight size={14} /></Link>
        </div>
      </div>
      <div className="dash-hero-insight">
        <div className="dash-momentum-orbit" aria-hidden="true"><span /><Orbit size={16} /><Sparkles size={14} /></div>
        <div className="dash-momentum-ring" role="img" aria-label={taskError ? 'Milestone completion unavailable' : `${stats.completion}% of milestones completed`}>
          <svg viewBox="0 0 144 144" aria-hidden="true"><circle className="dash-ring-track" cx="72" cy="72" r="61" /><circle className="dash-ring-value" cx="72" cy="72" r="61" pathLength="100" strokeDasharray={`${taskError ? 0 : stats.completion} 100`} /></svg>
          <div><span>WORKSPACE MOMENTUM</span><strong>{taskError ? '—' : `${stats.completion}%`}</strong><small>milestones delivered</small></div>
        </div>
        <p>{nextDeadline ? <><strong>Next up:</strong> {nextDeadline.name}<small>{nextProject?.title || 'Project'} · Due {nextDeadline.due_date}</small></> : 'Your next move starts with a milestone.'}</p>
      </div>
    </section>
    <nav className="dash-launchpad" aria-label="Quick access">{[
      { path: 'projects', label: 'Project spaces', icon: FolderKanban },
      { path: 'tasks', label: 'Your next steps', icon: CheckCircle2 },
      { path: 'research', label: 'Idea library', icon: BookOpen },
      { path: 'blackbook', label: 'Build your story', icon: FileText },
    ].map(({ path, label, icon: Icon }) => <Link to={`/dashboard/${path}`} key={path}><Icon size={16} /><span>{label}</span><ArrowUpRight size={13} /></Link>)}</nav>
    <div className="dash-stats">
      {[
        { label: 'Active projects', value: projectError ? '—' : stats.activeProjects, description: 'Projects in your workspace', icon: <FolderKanban size={19} />, color: 'green', link: 'projects' },
        { label: 'Pending milestones', value: taskError ? '—' : stats.pendingTasks, description: taskError ? 'Data unavailable' : stats.overdueTasks ? `${stats.overdueTasks} overdue` : 'Keep your next delivery on track', icon: <Clock3 size={19} />, color: 'amber', link: 'tasks' },
        { label: 'Completed milestones', value: taskError ? '—' : stats.completedTasks, description: 'Your team’s delivered work', icon: <CheckCircle2 size={19} />, color: 'blue', link: 'tasks' },
        { label: 'Team members', value: projectError || data.errors.some(error => error.section === 'Team members') ? '—' : stats.members, description: 'Across your project teams', icon: <Users size={19} />, color: 'purple', link: 'projects' },
      ].map(stat => <Link to={`/dashboard/${stat.link}`} className={`dash-stat dash-stat-${stat.color}`} key={stat.label}><div className="dash-row"><span>{stat.label}</span><span className={`dash-stat-icon ${stat.color}`}>{stat.icon}</span></div><strong>{stat.value}</strong><p>{stat.description}<ArrowUpRight size={14} /></p><span className="dash-stat-line" /></Link>)}
    </div>
    <WorkspaceInsights data={data} onEditProfile={() => onCreate('profile')} />
    <div className="dash-overview-grid">
      <Panel title="Your projects" subtitle="Ideas in motion. Progress that matters." action={<Link className="dash-text-link" to="/dashboard/projects">View all <ChevronRight size={14} /></Link>} className="dash-projects-panel">
        {data.squads.length ? <div className="dash-project-grid">{data.squads.slice(0, 2).map(project => <ProjectCard key={project.id} project={project} data={data} />)}</div> : <EmptyState title={projectError ? 'Projects could not be loaded' : 'Your next big idea starts here'} description={projectError ? 'Check the connection details above and refresh your workspace.' : 'Create your first project to organize your work, milestones, and team.'} action={!projectError && projectAction} />}
      </Panel>
      <Panel title="Upcoming deadlines" subtitle="A little planning goes a long way." action={<CalendarDays size={17} />}>
        {upcoming.length ? <div className="dash-deadlines">{upcoming.slice(0, 4).map(task => <Link to="/dashboard/calendar" className="dash-deadline" key={task.id}><span className="dash-date-tile"><b>{new Date(`${task.due_date}T00:00:00`).getDate()}</b>{new Date(`${task.due_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span><div><h3>{task.name}</h3><p>{data.squads.find(project => project.id === task.squad_id)?.title}</p></div><ChevronRight size={15} /></Link>)}</div> : <EmptyState icon={<CalendarDays size={24} />} title={taskError ? 'Deadlines unavailable' : 'Room to plan ahead'} description={taskError ? 'Milestone data could not be loaded.' : 'Your upcoming milestone due dates will appear here.'} />}
      </Panel>
      <Panel title="Milestone progress" subtitle="Built from your actual project records." action={<Link className="dash-text-link" to="/dashboard/tasks">All milestones <ChevronRight size={14} /></Link>} className="dash-projects-panel">
        {data.milestones.length ? <TaskList tasks={data.milestones.slice(0, 4)} data={data} onSaved={onSaved} /> : <EmptyState icon={<CheckCircle2 size={24} />} title={taskError ? 'Milestones unavailable' : 'One step at a time'} description={taskError ? 'Try refreshing your workspace.' : 'Break your project into milestones and track each delivery here.'} action={!taskError && (data.squads.length ? taskAction : <Link className="dash-text-link" to="/dashboard/projects">Start with a project <ChevronRight size={14} /></Link>)} />}
      </Panel>
      <Panel title="Workspace at a glance" subtitle="Your connected academic workspace.">
        <div className="dash-workspace-summary"><div className="dash-completion-ring" style={{ background: `conic-gradient(var(--dash-brand) ${stats.completion}%, var(--dash-border) 0)` }}><div><strong>{taskError ? '—' : `${stats.completion}%`}</strong><span>completed</span></div></div><p>{taskError ? 'Progress is temporarily unavailable.' : data.milestones.length ? `${stats.completedTasks} of ${data.milestones.filter(task => !isInactive(task.status)).length} milestones completed` : 'Progress appears as you add milestones'}</p><Link to="/dashboard/integrations"><Link2 size={15} />Connected integrations<strong>{data.errors.some(error => error.section === 'Integrations') ? '—' : data.integrations.filter(item => item.is_connected).length}</strong></Link><Link to="/dashboard/portfolio"><GraduationCap size={15} />Your academic profile<ChevronRight size={15} /></Link></div>
      </Panel>
    </div>
  </>;

  if (view === 'projects') {
    const projects = data.squads.filter(project => `${project.title} ${project.domain ?? ''} ${project.summary ?? ''} ${project.current_phase ?? ''} ${project.mentor_name ?? ''}`.toLowerCase().includes(search) && (projectStatus === 'all' || (projectStatus === 'archived' ? isInactive(project.status) : !isInactive(project.status)))).sort((a, b) => projectSort === 'name' ? a.title.localeCompare(b.title) : projectSort === 'progress' ? getDashboardStats({ squads: [b], milestones: data.milestones.filter(task => task.squad_id === b.id), members: [] }).completion - getDashboardStats({ squads: [a], milestones: data.milestones.filter(task => task.squad_id === a.id), members: [] }).completion : (b.created_at || '').localeCompare(a.created_at || ''));
    return <Panel title="Projects" subtitle="Your projects and the teams you belong to." action={projectAction}><div className="dash-toolbar workspace-toolbar"><label className="dash-search"><Search size={16} /><input aria-label="Search projects" placeholder="Search name, domain, phase or mentor…" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="Filter projects" value={projectStatus} onChange={event => setProjectStatus(event.target.value)}><option value="active">Current projects</option><option value="archived">Archived / inactive</option><option value="all">All projects</option></select><select aria-label="Sort projects" value={projectSort} onChange={event => setProjectSort(event.target.value)}><option value="newest">Newest first</option><option value="name">Project name</option><option value="progress">Most progress</option></select><span>{projects.length} of {data.squads.length} projects</span></div>{projects.length ? <div className="dash-project-grid">{projects.map(project => <ProjectCard key={project.id} project={project} data={data} />)}</div> : <EmptyState title={search || projectStatus !== 'active' ? 'No matching projects' : projectError ? 'Projects unavailable' : 'No projects yet'} description={search || projectStatus !== 'active' ? 'Try another search or project filter.' : projectError ? 'Refresh after checking the connection error above.' : 'Create a project to start building your workspace.'} action={!search && !projectError && projectAction} />}</Panel>;
  }

  if (view === 'tasks') {
    const tasks = sortMilestones(data.milestones.filter(task => `${task.name} ${task.phase} ${task.description || ''} ${data.squads.find(project => project.id === task.squad_id)?.title || ''}`.toLowerCase().includes(search) && (!projectFilter || task.squad_id === projectFilter) && milestoneMatches(task, taskFilter)), sort);
    const columns = [{ label: 'Planned', match: (task: Milestone) => !isComplete(task.status) && !isInactive(task.status) && !['SUBMITTED', 'REVISION_REQUESTED'].includes(task.status || '') }, { label: 'In review', match: (task: Milestone) => task.status === 'SUBMITTED' }, { label: 'Needs revision', match: (task: Milestone) => task.status === 'REVISION_REQUESTED' }, { label: 'Completed', match: (task: Milestone) => isComplete(task.status) }, { label: 'Inactive', match: (task: Milestone) => isInactive(task.status) }];
    return <Panel title="My tasks & milestones" subtitle="Plan deliveries, submit evidence, and follow review decisions across your teams." action={taskAction}><div className="dash-toolbar workspace-toolbar"><label className="dash-search"><Search size={16} /><input aria-label="Search milestones" placeholder="Search milestones and projects…" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="Filter milestone status" value={taskFilter} onChange={event => setFilter('status', event.target.value)}>{[['all', 'All statuses'], ['pending', 'Open milestones'], ['overdue', 'Overdue'], ['today', 'Due today'], ['submitted', 'In review'], ['revision', 'Needs revision'], ['complete', 'Completed'], ['unscheduled', 'No due date'], ['inactive', 'Inactive']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Filter milestone project" value={projectFilter} onChange={event => setFilter('project', event.target.value)}><option value="">All projects</option>{data.squads.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select><select aria-label="Sort milestones" value={sort} onChange={event => setSort(event.target.value)}><option value="due">Due date</option><option value="name">Milestone name</option><option value="updated">Recently updated</option></select></div><div className="workspace-content workspace-actions"><span>{tasks.length} matching milestones</span><button className="dash-button" aria-pressed={taskLayout === 'list'} onClick={() => setTaskLayout('list')}>List view</button><button className="dash-button" aria-pressed={taskLayout === 'board'} onClick={() => setTaskLayout('board')}>Board view</button><button className="dash-button" disabled={!tasks.length} onClick={() => downloadText('placepms-milestones.csv', milestoneCsv(tasks, data), 'text/csv;charset=utf-8')}>Export filtered milestones</button>{(search || taskFilter !== 'all' || projectFilter) && <button className="dash-text-link" onClick={() => { setQuery(''); setParams({}, { replace: true }); }}>Clear filters</button>}</div>{tasks.length ? taskLayout === 'list' ? <TaskList tasks={tasks} data={data} onSaved={onSaved} /> : <div className="workspace-board">{columns.filter(column => column.label !== 'Inactive' || tasks.some(column.match)).map(column => <section className="workspace-board-column" key={column.label}><h3>{column.label}<span>{tasks.filter(column.match).length}</span></h3><TaskList tasks={tasks.filter(column.match)} data={data} onSaved={onSaved} />{!tasks.some(column.match) && <p className="workspace-muted">No milestones</p>}</section>)}</div> : <EmptyState icon={<CheckCircle2 size={25} />} title={taskError ? 'Milestones unavailable' : 'No milestones to show'} description={taskError ? 'Check the connection error above.' : data.squads.length ? 'Add a milestone or change your filters.' : 'Create a project first, then add its milestones.'} />}</Panel>;
  }

  if (view === 'calendar') {
    return <CalendarView data={data} action={taskAction} renderTasks={tasks => <TaskList tasks={tasks} data={data} onSaved={onSaved} />} />;
  }

  if (view === 'mentorship') {
    const mentored = data.squads.filter(squad => squad.mentor_id || squad.mentor_name);
    const assigned = mentored.filter(project => project.mentor_id === user.id || project.mentor_id?.toLowerCase() === user.email?.toLowerCase());
    const reviewQueue = sortMilestones(data.milestones.filter(task => task.status === 'SUBMITTED' && mentored.some(project => project.id === task.squad_id)));
    const scored = data.milestones.filter(task => typeof task.score === 'number' && mentored.some(project => project.id === task.squad_id));
    return <div className="workspace-stack"><Panel title={assigned.length ? 'Your mentor review queue' : 'Submission review tracker'} subtitle="Open the delivery evidence to review submissions or follow your mentor’s feedback."><div className="workspace-content"><div className="workspace-metrics">{[['Assigned projects', assigned.length], ['Awaiting review', reviewQueue.length], ['Needs revision', data.milestones.filter(task => task.status === 'REVISION_REQUESTED' && mentored.some(project => project.id === task.squad_id)).length], ['Average review score', scored.length ? `${Math.round(scored.reduce((sum, task) => sum + task.score!, 0) / scored.length)}/100` : 'Not scored']].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="workspace-list">{reviewQueue.length ? reviewQueue.map(task => <article className="workspace-list-item" key={task.id}><div><h3>{task.name}</h3><p>{data.squads.find(project => project.id === task.squad_id)?.title} · Submitted {formatDate(task.submitted_at, true)}</p></div><Link className="dash-button" to={`/dashboard/projects/${encodeURIComponent(task.squad_id)}#milestone-${encodeURIComponent(task.id)}`}>{assigned.some(project => project.id === task.squad_id) ? 'Review delivery' : 'View submission'} <ChevronRight size={14} /></Link></article>) : <p className="workspace-muted">No submissions are currently waiting for review.</p>}</div></div></Panel><Panel title="Mentorship" subtitle="Assign mentors from project settings. Assigned mentors can approve submissions, request revisions, and leave scores.">{mentored.length ? <div className="dash-project-grid">{mentored.map(squad => <article className="dash-project-card" key={squad.id}><span className="dash-project-icon"><GraduationCap size={22} /></span><h3>{squad.mentor_name || 'Assigned mentor'}</h3><p>{squad.title}</p><div className="dash-tags"><span>{squad.current_phase || 'Phase not set'}</span></div><Link className="dash-text-link" to={`/dashboard/projects/${encodeURIComponent(squad.id)}`}>Open submissions & feedback <ChevronRight size={14} /></Link>{data.milestones.filter(task => task.squad_id === squad.id && task.mentor_feedback).map(task => <div className="dash-feedback" key={task.id}><strong>{task.name}</strong><p>{task.mentor_feedback}</p>{task.score !== null && <span>Score: {task.score}/100</span>}</div>)}</article>)}</div> : <EmptyState icon={<GraduationCap size={25} />} title="No mentor assigned yet" description="Open one of your projects and use Edit project to assign a mentor by their registered email." action={<Link className="dash-button" to="/dashboard/projects">Choose a project</Link>} />}</Panel></div>;
  }

  if (view === 'portfolio') {
    const profile = data.profile;
    const completion = profileCompletion(profile);
    const details = [['Institution', profile?.college || user.user_metadata.college], ['Program', profile?.program], ['Batch', profile?.batch], ['Division', profile?.division], ['Roll number', profile?.roll_number], ['Role', profile?.role]];
    const portfolioName = profile?.full_name || user.user_metadata.full_name || user.email || 'Academic portfolio';
    return <Panel title="Your portfolio" subtitle="Your profile and project work, together." action={<div className="workspace-actions"><button className="dash-button" onClick={() => { const content = [`# ${portfolioName}`, user.email, ...details.map(([label, value]) => `${label}: ${value || 'Not added'}`), '\n## Project work', ...data.squads.filter(project => !isInactive(project.status)).flatMap(project => [`\n### ${project.title}`, project.summary || '', `Domain: ${project.domain || 'Not set'} · Phase: ${project.current_phase || 'Not set'}`, `Mentor: ${project.mentor_name || 'Not assigned'}`, ...data.milestones.filter(task => task.squad_id === project.id && isComplete(task.status)).map(task => `- Approved delivery: ${task.name}${typeof task.score === 'number' ? ` · Score ${task.score}/100` : ''}`), ...[project.github_repo, project.figma_url, project.miro_url].filter(value => safeExternalUrl(value))])].join('\n'); downloadText('placepms-portfolio.html', reportHtml(portfolioName, content), 'text/html;charset=utf-8'); }}>Export portfolio</button><button className="dash-button" onClick={() => onCreate('profile')}>Edit profile</button></div>}><div className="dash-profile-summary"><span className="dash-profile-large"><GraduationCap size={34} /></span><div><h2>{portfolioName}</h2><p>{user.email}</p></div></div><div className="workspace-content workspace-callout workspace-portfolio-readiness"><div><strong>Profile {completion.percent}% complete</strong><p>{completion.missing.length ? `Add ${completion.missing.map(field => field.replace(/_/g, ' ')).join(', ')} to complete your academic profile.` : 'Your academic profile is complete. Keep it up to date as your work develops.'}</p></div><span className="dash-status is-complete">{stats.completedTasks} approved deliveries</span></div><dl className="dash-profile-details">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not added'}</dd></div>)}</dl><div className="dash-section-divider"><h3>Your projects</h3></div>{data.squads.length ? <div className="dash-project-grid">{data.squads.map(project => <ProjectCard key={project.id} project={project} data={data} />)}</div> : <EmptyState title="Your work belongs here" description="Projects you create or join will become part of your portfolio." action={projectAction} />}</Panel>;
  }

  return <Panel title="Page not found"><EmptyState icon={<FileText size={25} />} title="This page does not exist" description="Return to the overview to continue working." action={<Link className="dash-button" to="/dashboard">Back to overview</Link>} /></Panel>;
}
