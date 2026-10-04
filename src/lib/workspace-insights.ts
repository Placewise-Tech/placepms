import type { DashboardData, Milestone, Profile } from './dashboard-data';
import { isComplete, isInactive, localDateKey } from './dashboard-data';

export function milestoneMatches(task: Milestone, filter: string, today = localDateKey()) {
  if (filter === 'all') return true;
  if (filter === 'complete') return isComplete(task.status);
  if (filter === 'inactive') return isInactive(task.status);
  if (isComplete(task.status) || isInactive(task.status)) return false;
  if (filter === 'submitted') return task.status?.toUpperCase() === 'SUBMITTED';
  if (filter === 'revision') return task.status?.toUpperCase() === 'REVISION_REQUESTED';
  if (filter === 'overdue') return Boolean(task.due_date && task.due_date < today);
  if (filter === 'today') return task.due_date === today;
  if (filter === 'unscheduled') return !task.due_date;
  return true;
}

export function sortMilestones(tasks: Milestone[], sort = 'due') {
  return [...tasks].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'updated') return (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '');
    return (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.name.localeCompare(b.name);
  });
}

export function profileCompletion(profile: Profile | null) {
  const fields = ['full_name', 'college', 'program', 'batch', 'division', 'roll_number'] as const;
  const missing = fields.filter(field => !profile?.[field]?.trim());
  return { percent: Math.round((fields.length - missing.length) / fields.length * 100), missing };
}

export function projectHealth(data: DashboardData, today = localDateKey()) {
  return data.squads.filter(project => !isInactive(project.status)).map(project => {
    const tasks = data.milestones.filter(task => task.squad_id === project.id && !isInactive(task.status));
    const overdue = tasks.filter(task => milestoneMatches(task, 'overdue', today)).length;
    const revisions = tasks.filter(task => milestoneMatches(task, 'revision', today)).length;
    const submitted = tasks.filter(task => milestoneMatches(task, 'submitted', today)).length;
    const complete = tasks.filter(task => isComplete(task.status)).length;
    return { project, tasks: tasks.length, overdue, revisions, submitted, completion: tasks.length ? Math.round(complete / tasks.length * 100) : 0 };
  }).sort((a, b) => b.overdue - a.overdue || b.revisions - a.revisions || a.project.title.localeCompare(b.project.title));
}

// Quote every value and neutralize spreadsheet formulas in user-authored fields.
export function csvExport(rows: unknown[][]) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    const text = String(value ?? '');
    const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
}

export function milestoneCsv(tasks: Milestone[], data: DashboardData) {
  return csvExport([
    ['Milestone', 'Project', 'Phase', 'Start date', 'Due date', 'Status', 'Score', 'Mentor feedback'],
    ...tasks.map(task => [task.name, data.squads.find(project => project.id === task.squad_id)?.title, task.phase, task.start_date, task.due_date, task.status, task.score, task.mentor_feedback]),
  ]);
}
