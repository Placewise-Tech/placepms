import { useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronRight, Circle, Clock3, FileText, FolderKanban, GraduationCap, Link2, Plus, Search, Users } from 'lucide-react';
import type { DashboardData, Milestone, Squad } from '../../lib/dashboard-data';
import { getDashboardStats, isComplete, isInactive, localDateKey, safeExternalUrl, upcomingMilestones } from '../../lib/dashboard-data';
import { supabase } from '../../lib/supabase';
import IntegrationWorkspace from './IntegrationWorkspace';
import SessionsView from './SessionsView';
import LibraryView from './LibraryView';
import BlackbookView from './BlackbookView';
import CalendarView from './CalendarView';
import ProjectDetails from './ProjectDetails';

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
            const { data: changed, error: updateError } = await supabase.from('milestones').update({ status: submitted ? 'PENDING' : 'SUBMITTED', submitted_at: submitted ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', task.id).eq('squad_id', task.squad_id).select('id');
            if (updateError) throw updateError;
            if (!changed?.length) throw new Error('This milestone was not updated. Your account may not have permission.');
            await onSaved(submitted ? 'Submission withdrawn.' : 'Milestone submitted for review.');
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : typeof cause === 'object' && cause && 'message' in cause ? String(cause.message) : 'Unable to update this milestone.');
          } finally { setBusy(null); }
        }}>{busy === task.id ? <Clock3 size={17} /> : complete || submitted ? <CheckCircle2 size={19} /> : <Circle size={19} />}</button>
        <div className="dash-task-copy"><h3>{task.name}</h3><p><Link to={`/dashboard/projects/${encodeURIComponent(task.squad_id)}`}>{data.squads.find(squad => squad.id === task.squad_id)?.title || 'Project'}</Link><span>·</span>{task.phase}</p>{task.mentor_feedback && <p>Feedback: {task.mentor_feedback}</p>}<Link className="dash-text-link" to={`/dashboard/projects/${encodeURIComponent(task.squad_id)}`}>Details & submission links</Link></div>
        <div className="dash-task-meta"><Status value={task.status} /><span className={overdue ? 'dash-overdue' : ''}>{overdue && 'Overdue · '}{formatDate(task.due_date)}</span></div>
      </article>;
    })}
  </div>;
}

export default function DashboardViews({ view, data, user, onCreate, onSaved }: Props) {
  const [query, setQuery] = useState('');
  const [taskFilter, setTaskFilter] = useState('all');
  const stats = getDashboardStats(data);
  const upcoming = upcomingMilestones(data.milestones);
  const search = query.trim().toLowerCase();
  const projectAction = <button className="dash-button dash-button-primary" onClick={() => onCreate('project')}><Plus size={15} />Create project</button>;
  const taskAction = <button className="dash-button dash-button-primary" disabled={!data.squads.length} onClick={() => onCreate('milestone')}><Plus size={15} />Add milestone</button>;
  const projectError = data.errors.some(error => ['Projects', 'Team projects', 'Memberships', 'Mentorship'].includes(error.section));
  const taskError = projectError || data.errors.some(error => error.section === 'Milestones');

  if (['integrations', 'repositories', 'figma', 'miro'].includes(view)) return <IntegrationWorkspace view={view} data={data} />;
  if (view === 'sessions') return <SessionsView />;
  if (['research', 'resources', 'documents'].includes(view)) return <LibraryView kind={view === 'research' ? 'research' : view === 'resources' ? 'resource' : 'document'} data={data} user={user} />;
  if (view === 'blackbook') return <BlackbookView data={data} user={user} />;
  if (view.startsWith('projects/')) return <ProjectDetails id={decodeURIComponent(view.slice('projects/'.length))} data={data} user={user} onSaved={onSaved} onCreate={onCreate} />;

  if (view === 'overview') return <>
    <div className="dash-stats">
      {[
        { label: 'Active projects', value: projectError ? '—' : stats.activeProjects, description: 'Projects in your workspace', icon: <FolderKanban size={19} />, color: 'green', link: 'projects' },
        { label: 'Pending milestones', value: taskError ? '—' : stats.pendingTasks, description: taskError ? 'Data unavailable' : stats.overdueTasks ? `${stats.overdueTasks} overdue` : 'Keep your next delivery on track', icon: <Clock3 size={19} />, color: 'amber', link: 'tasks' },
        { label: 'Completed milestones', value: taskError ? '—' : stats.completedTasks, description: 'Your team’s delivered work', icon: <CheckCircle2 size={19} />, color: 'blue', link: 'tasks' },
        { label: 'Team members', value: projectError || data.errors.some(error => error.section === 'Team members') ? '—' : stats.members, description: 'Across your project teams', icon: <Users size={19} />, color: 'purple', link: 'projects' },
      ].map(stat => <Link to={`/dashboard/${stat.link}`} className="dash-stat" key={stat.label}><div className="dash-row"><span>{stat.label}</span><span className={`dash-stat-icon ${stat.color}`}>{stat.icon}</span></div><strong>{stat.value}</strong><p>{stat.description}<ArrowUpRight size={14} /></p></Link>)}
    </div>
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
    const projects = data.squads.filter(project => `${project.title} ${project.domain ?? ''} ${project.summary ?? ''}`.toLowerCase().includes(search));
    return <Panel title="Projects" subtitle="Your projects and the teams you belong to." action={projectAction}><div className="dash-toolbar"><label className="dash-search"><Search size={16} /><input aria-label="Search projects" placeholder="Search your projects…" value={query} onChange={event => setQuery(event.target.value)} /></label><span>{projects.length} project{projects.length === 1 ? '' : 's'}</span></div>{projects.length ? <div className="dash-project-grid">{projects.map(project => <ProjectCard key={project.id} project={project} data={data} />)}</div> : <EmptyState title={search ? 'No matching projects' : projectError ? 'Projects unavailable' : 'No projects yet'} description={search ? 'Try another project name or domain.' : projectError ? 'Refresh after checking the connection error above.' : 'Create a project to start building your workspace.'} action={!search && !projectError && projectAction} />}</Panel>;
  }

  if (view === 'tasks') {
    const tasks = data.milestones.filter(task => `${task.name} ${task.phase}`.toLowerCase().includes(search) && (taskFilter === 'all' || (taskFilter === 'complete' ? isComplete(task.status) : !isComplete(task.status) && !isInactive(task.status))));
    return <Panel title="My tasks & milestones" subtitle="Milestones shared across your project teams." action={taskAction}><div className="dash-toolbar"><label className="dash-search"><Search size={16} /><input aria-label="Search milestones" placeholder="Search milestones…" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="Filter milestone status" value={taskFilter} onChange={event => setTaskFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="complete">Completed</option></select></div>{tasks.length ? <TaskList tasks={tasks} data={data} onSaved={onSaved} /> : <EmptyState icon={<CheckCircle2 size={25} />} title={taskError ? 'Milestones unavailable' : 'No milestones to show'} description={taskError ? 'Check the connection error above.' : data.squads.length ? 'Add a milestone or change your filters.' : 'Create a project first, then add its milestones.'} />}</Panel>;
  }

  if (view === 'calendar') {
    return <CalendarView milestones={data.milestones} action={taskAction} renderTasks={tasks => <TaskList tasks={tasks} data={data} onSaved={onSaved} />} />;
  }

  if (view === 'mentorship') {
    const mentored = data.squads.filter(squad => squad.mentor_id || squad.mentor_name);
    return <Panel title="Mentorship" subtitle="Assign mentors from project settings. Assigned mentors can approve submissions, request revisions, and leave scores.">{mentored.length ? <div className="dash-project-grid">{mentored.map(squad => <article className="dash-project-card" key={squad.id}><span className="dash-project-icon"><GraduationCap size={22} /></span><h3>{squad.mentor_name || 'Assigned mentor'}</h3><p>{squad.title}</p><div className="dash-tags"><span>{squad.current_phase || 'Phase not set'}</span></div><Link className="dash-text-link" to={`/dashboard/projects/${encodeURIComponent(squad.id)}`}>Open submissions & feedback <ChevronRight size={14} /></Link>{data.milestones.filter(task => task.squad_id === squad.id && task.mentor_feedback).map(task => <div className="dash-feedback" key={task.id}><strong>{task.name}</strong><p>{task.mentor_feedback}</p>{task.score !== null && <span>Score: {task.score}</span>}</div>)}</article>)}</div> : <EmptyState icon={<GraduationCap size={25} />} title="No mentor assigned yet" description="Open one of your projects and use Edit project to assign a mentor by their registered email." action={<Link className="dash-button" to="/dashboard/projects">Choose a project</Link>} />}</Panel>;
  }

  if (view === 'portfolio') {
    const profile = data.profile;
    return <Panel title="Your portfolio" subtitle="Your profile and project work, together." action={<button className="dash-button" onClick={() => onCreate('profile')}>Edit profile</button>}><div className="dash-profile-summary"><span className="dash-profile-large"><GraduationCap size={34} /></span><div><h2>{profile?.full_name || user.user_metadata.full_name || user.email}</h2><p>{user.email}</p></div></div><dl className="dash-profile-details">{[['Institution', profile?.college || user.user_metadata.college], ['Program', profile?.program], ['Batch', profile?.batch], ['Division', profile?.division], ['Roll number', profile?.roll_number], ['Role', profile?.role]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not added'}</dd></div>)}</dl><div className="dash-section-divider"><h3>Your projects</h3></div>{data.squads.length ? <div className="dash-project-grid">{data.squads.map(project => <ProjectCard key={project.id} project={project} data={data} />)}</div> : <EmptyState title="Your work belongs here" description="Projects you create or join will become part of your portfolio." action={projectAction} />}</Panel>;
  }

  return <Panel title="Page not found"><EmptyState icon={<FileText size={25} />} title="This page does not exist" description="Return to the overview to continue working." action={<Link className="dash-button" to="/dashboard">Back to overview</Link>} /></Panel>;
}
