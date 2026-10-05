import type { DashboardData, Squad } from './dashboard-data';
import { getDocuments, getDashboardStats, safeExternalUrl } from './dashboard-data';

export interface LibraryEntry {
  id: string; user_id: string; kind: 'research' | 'resource' | 'document'; title: string;
  url: string | null; notes: string; tags: string[]; project_id: string | null; created_at: string; updated_at: string;
}
export function readBlackbookDraft(notes: string, sectionNames: string[]) {
  try {
    const value = JSON.parse(notes);
    if (!value || value.version !== 1 || typeof value.title !== 'string' || typeof value.report !== 'string' || !value.sections || typeof value.sections !== 'object') return null;
    const sections = Object.fromEntries(sectionNames.map(name => [name, typeof value.sections[name] === 'string' ? value.sections[name] : '']));
    return { title: value.title, report: value.report, sections };
  } catch { return null; }
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
export type ReportBlock = { kind: 'heading'; level: 1 | 2 | 3; text: string } | { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] } | { kind: 'table'; headers: string[]; rows: string[][] } | { kind: 'divider' };

export function reportBlocks(content: string): ReportBlock[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n'); const blocks: ReportBlock[] = [];
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
  const tableStart = (index: number) => lines[index]?.trim().startsWith('|') && lines[index + 1]?.trim().startsWith('|') && cells(lines[index + 1]).every(cell => /^:?-{3,}:?$/.test(cell));
  for (let index = 0; index < lines.length;) {
    const line = lines[index]; if (!line.trim()) { index++; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2] }); index++; continue; }
    if (line.trim() === '---') { blocks.push({ kind: 'divider' }); index++; continue; }
    if (tableStart(index)) { const headers = cells(line); const rows: string[][] = []; index += 2; while (index < lines.length && lines[index].trim().startsWith('|')) { rows.push(cells(lines[index])); index++; } blocks.push({ kind: 'table', headers, rows }); continue; }
    if (/^\s*-\s+/.test(line)) { const items: string[] = []; while (index < lines.length && /^\s*-\s+/.test(lines[index])) { items.push(lines[index].replace(/^\s*-\s+/, '')); index++; } blocks.push({ kind: 'list', items }); continue; }
    const paragraph: string[] = [line]; index++;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+/.test(lines[index]) && !/^\s*-\s+/.test(lines[index]) && lines[index].trim() !== '---' && !tableStart(index)) { paragraph.push(lines[index]); index++; }
    blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
  }
  return blocks;
}

export function reportHtml(title: string, content: string) {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  const body = reportBlocks(content).map(block => block.kind === 'heading' ? `<h${block.level}>${escape(block.text)}</h${block.level}>` : block.kind === 'list' ? `<ul>${block.items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : block.kind === 'table' ? `<table><thead><tr>${block.headers.map(header => `<th>${escape(header)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : block.kind === 'divider' ? '<hr>' : `<p>${escape(block.text)}</p>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:15px/1.8 Georgia,serif;max-width:850px;margin:40px auto;padding:28px;color:#182230}header{font:10px/1.5 system-ui,sans-serif;letter-spacing:2px;color:#607055;border-bottom:1px solid #dce2d7;padding-bottom:18px}h1{font-size:34px;line-height:1.25;margin:28px 0}h2{font-size:23px;margin:28px 0 12px}h3{font-size:18px;margin:23px 0 10px}p{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font:12px/1.6 system-ui,sans-serif;margin:20px 0;table-layout:fixed}th,td{text-align:left;padding:10px;border:1px solid #dce2d7;overflow-wrap:anywhere}th{background:#f1f4ee}li{margin:6px 0;overflow-wrap:anywhere}hr{border:0;border-top:1px solid #dce2d7;margin:28px 0}@page{size:A4;margin:20mm}@media print{body{margin:0;padding:0;max-width:none}h1,h2,h3{break-after:avoid}tr{break-inside:avoid}thead{display:table-header-group}}</style></head><body><header>PLACEPMS / ACADEMIC PORTFOLIO &amp; PROJECT RECORD</header>${body}</body></html>`;
}
