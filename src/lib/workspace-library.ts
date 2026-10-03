import type { DashboardData, Squad } from './dashboard-data';
import { getDocuments, getDashboardStats, safeExternalUrl } from './dashboard-data';

export interface LibraryEntry {
  id: string; user_id: string; kind: 'research' | 'resource' | 'document'; title: string;
  url: string | null; notes: string; tags: string[]; project_id: string | null; created_at: string; updated_at: string;
}
export function buildBlackbook(project: Squad, data: DashboardData, sections: Record<string, string>, references: LibraryEntry[]) {
  const tasks = data.milestones.filter(task => task.squad_id === project.id);
  const members = data.members.filter(member => member.squad_id === project.id);
  const stats = getDashboardStats({ squads: [project], milestones: tasks, members });
  const cell = (value: unknown) => String(value ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  const heading = (value: string) => value.replace(/[\r\n]+/g, ' ');
  return [
    `# ${heading(project.title)}`, '\n## Project overview', project.summary || 'Project summary has not been added.',
    `\n- Domain: ${heading(project.domain || 'Not specified')}`, `- Phase: ${heading(project.current_phase || 'Not specified')}`,
    `- Project lead: ${heading(project.leader_email)}`, `- Mentor: ${heading(project.mentor_name || project.mentor_id || 'Not assigned')}`,
    '\n## Team', ...(members.length ? members.map(member => `- ${heading(member.name)} (${heading(member.email)}) — ${heading(member.role || 'Member')}`) : ['No team members recorded.']),
    ...Object.entries(sections).flatMap(([title, content]) => [`\n## ${heading(title)}`, content.trim() || 'To be completed by the project team.']),
    '\n## Milestone evidence', `${stats.completedTasks} of ${tasks.filter(task => !['ARCHIVED', 'CANCELLED', 'REJECTED'].includes(task.status || '')).length} milestones completed (${stats.completion}%).`,
    '| Milestone | Phase | Due date | Status | Feedback |', '| --- | --- | --- | --- | --- |',
    ...tasks.map(task => `| ${cell(task.name)} | ${cell(task.phase)} | ${cell(task.due_date)} | ${cell(task.status)} | ${cell(task.mentor_feedback)} |`),
    '\n## Connected project tools', ...[['GitHub', project.github_repo], ['Figma', project.figma_url], ['Miro', project.miro_url]].flatMap(([name, value]) => safeExternalUrl(value) ? [`- ${name}: ${safeExternalUrl(value)}`] : []),
    '\n## Submission documents', ...getDocuments(tasks).map(item => `- ${heading(item.name)}: ${item.url}`),
    '\n## References and research notes', ...references.filter(item => item.project_id === project.id && item.kind === 'research').flatMap(item => [`### ${heading(item.title)}`, item.url && safeExternalUrl(item.url) ? item.url : '', item.notes]),
    '\n---', 'Generated from saved PlacePMS records and the team’s authored sections. Review the content and your institution’s formatting requirements before submission.',
  ].join('\n');
}
export function reportHtml(title: string, content: string) {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:15px/1.7 Georgia,serif;max-width:850px;margin:40px auto;padding:20px;color:#182230}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}@page{size:A4;margin:20mm}@media print{body{margin:0;padding:0;max-width:none}}</style></head><body><pre>${escape(content)}</pre></body></html>`;
}
