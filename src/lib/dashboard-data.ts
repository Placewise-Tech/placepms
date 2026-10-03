export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  roll_number: string | null;
  division: string | null;
  batch: string | null;
  program: string | null;
  college: string | null;
  avatar_url: string | null;
}

export interface Squad {
  id: string;
  title: string;
  tagline: string | null;
  domain: string | null;
  summary: string | null;
  leader_email: string;
  mentor_id: string | null;
  mentor_name: string | null;
  github_repo: string | null;
  figma_url: string | null;
  miro_url: string | null;
  current_phase: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Milestone {
  id: string;
  squad_id: string;
  name: string;
  phase: string;
  description: string | null;
  start_date: string | null;
  due_date: string | null;
  status: string | null;
  submission_files: unknown;
  mentor_feedback: string | null;
  score: number | null;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Member {
  id: string;
  squad_id: string;
  name: string;
  email: string;
  role: string | null;
  skills: string[] | null;
}

export interface Integration {
  id: string;
  tool_name: string;
  account: string | null;
  is_connected: boolean;
  updated_at: string | null;
}

export interface UserSession {
  id: string;
  device_name: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  location: string | null;
  status: string | null;
  created_at: string | null;
  last_active_at: string | null;
}

export interface DashboardData {
  profile: Profile | null;
  squads: Squad[];
  milestones: Milestone[];
  members: Member[];
  integrations: Integration[];
  sessions: UserSession[];
  errors: { section: string; message: string }[];
}

export const emptyDashboard: DashboardData = {
  profile: null, squads: [], milestones: [], members: [], integrations: [], sessions: [], errors: [],
};

export function isComplete(status: string | null) {
  return ['COMPLETED', 'COMPLETE', 'DONE', 'APPROVED'].includes((status ?? '').toUpperCase());
}

export function isInactive(status: string | null) {
  return ['CANCELLED', 'CANCELED', 'ARCHIVED', 'REJECTED'].includes((status ?? '').toUpperCase());
}

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getDashboardStats(data: Pick<DashboardData, 'squads' | 'milestones' | 'members'>, today = localDateKey()) {
  const pending = data.milestones.filter(task => !isComplete(task.status) && !isInactive(task.status));
  const completed = data.milestones.filter(task => isComplete(task.status)).length;
  const eligible = data.milestones.filter(task => !isInactive(task.status)).length;
  return {
    activeProjects: data.squads.filter(project => !['COMPLETED', 'COMPLETE', 'DONE', 'FINISHED'].includes((project.status ?? '').toUpperCase()) && !isInactive(project.status)).length,
    pendingTasks: pending.length,
    completedTasks: completed,
    overdueTasks: pending.filter(task => task.due_date && task.due_date < today).length,
    members: new Set(data.members.map(member => member.email.toLowerCase())).size,
    completion: eligible ? Math.round(completed / eligible * 100) : 0,
  };
}

export function upcomingMilestones(milestones: Milestone[], today = localDateKey()) {
  return milestones.filter(task => task.due_date && task.due_date >= today && !isComplete(task.status) && !isInactive(task.status))
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
}

export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

export function getDocuments(milestones: Milestone[]) {
  return milestones.flatMap(milestone => {
    if (!Array.isArray(milestone.submission_files)) return [];
    return milestone.submission_files.flatMap((file: unknown, index) => {
      const record = typeof file === 'object' && file !== null ? file as Record<string, unknown> : {};
      const url = safeExternalUrl(typeof file === 'string' ? file : record.url ?? record.file_url);
      if (!url) return [];
      return [{
        id: `${milestone.id}-${index}`,
        name: typeof record.name === 'string' ? record.name : typeof record.file_name === 'string' ? record.file_name : `Submission ${index + 1}`,
        url,
        milestone: milestone.name,
        submittedAt: milestone.submitted_at,
      }];
    });
  });
}

function escapeCalendarText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export function calendarExport(milestones: Milestone[], now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const events = milestones.filter(task => task.due_date && !isInactive(task.status)).map(task => [
    'BEGIN:VEVENT', `UID:${escapeCalendarText(task.id)}@placepms`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${task.due_date!.replace(/-/g, '')}`,
    `SUMMARY:${escapeCalendarText(task.name)}`,
    `DESCRIPTION:${escapeCalendarText(task.description || task.phase)}`, 'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PlacePMS//Project Deadlines//EN', ...events, 'END:VCALENDAR'].join('\r\n');
}
