export type IdeaDomain = 'auto' | 'web' | 'mobile' | 'data' | 'iot' | 'research';
export interface IdeaInput {
  idea: string;
  weeks: number;
  startDate: string;
  teamSize: number;
  domain: IdeaDomain;
  audience?: string;
  successCriteria?: string;
  constraints?: string;
}
export interface IdeaPhase { id: string; title: string; startDate: string; dueDate: string }
export interface IdeaMilestone { id: string; name: string; phase: string; description: string; startDate: string; dueDate: string }
export interface IdeaRole { title: string; responsibility: string }
export interface IdeaChapter { title: string; prompt: string }
export interface IdeaPlan {
  version: 1; id: string; idea: string; title: string; summary: string; domain: string;
  weeks: number; startDate: string; teamSize: number; source: 'starter' | 'ai';
  audience: string; successCriteria: string; constraints: string;
  objectives: string[]; phases: IdeaPhase[]; milestones: IdeaMilestone[]; roles: IdeaRole[]; chapters: IdeaChapter[];
}
export const ideaDomains = [{ id: 'auto', label: 'Detect from my idea' }, { id: 'web', label: 'Web platform' }, { id: 'mobile', label: 'Mobile application' }, { id: 'data', label: 'Data & AI' }, { id: 'iot', label: 'IoT & hardware' }, { id: 'research', label: 'Research study' }] as const;
export const ideaChapterNames = ['Abstract', 'Problem statement & objectives', 'Methodology', 'System architecture', 'Testing & results', 'Conclusion & future scope'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function planDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('Choose a valid calendar date.');
  return value;
}
export function addPlanDays(value: string, days: number) {
  const date = new Date(`${planDate(value)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function planEndDate(plan: Pick<IdeaPlan, 'startDate' | 'weeks'>) { return addPlanDays(plan.startDate, plan.weeks * 7 - 1); }
function text(value: unknown, label: string, limit: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit || [...value].some(char => char.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(char))) throw new Error(`${label} must contain 1–${limit} characters.`);
  return value.trim();
}
function optionalText(value: unknown, label: string, limit: number) {
  if (value === undefined || value === null || value === '') return '';
  return text(value, label, limit);
}
function number(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}
function record(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The project plan could not be read. Build a new plan.');
  return value as Record<string, unknown>;
}
function list(value: unknown, label: string, max: number) {
  if (!Array.isArray(value) || !value.length || value.length > max) throw new Error(`Include 1–${max} ${label}.`);
  return value;
}
function id(value: unknown) {
  if (typeof value !== 'string' || !uuid.test(value)) throw new Error('The draft has an invalid record ID. Build a new plan.');
  return value.toLowerCase();
}

export function validateIdeaInput(value: unknown): IdeaInput {
  const input = record(value);
  const idea = text(input.idea, 'Your idea', 1500);
  if (idea.length < 12) throw new Error('Describe your idea in at least 12 characters.');
  const domain = input.domain ?? 'auto';
  if (!ideaDomains.some(item => item.id === domain)) throw new Error('Choose a supported project domain.');
  return {
    idea,
    weeks: number(input.weeks, 'Timeline in weeks', 1, 24),
    startDate: planDate(input.startDate),
    teamSize: number(input.teamSize, 'Team size', 1, 8),
    domain: domain as IdeaDomain,
    audience: optionalText(input.audience, 'Intended audience', 240),
    successCriteria: optionalText(input.successCriteria, 'Definition of success', 240),
    constraints: optionalText(input.constraints, 'Constraints or must-haves', 400),
  };
}

export function validateIdeaPlan(value: unknown): IdeaPlan {
  const input = record(value);
  if (input.version !== 1 || !['starter', 'ai'].includes(String(input.source))) throw new Error('This draft format is not supported. Build a new plan.');
  const startDate = planDate(input.startDate);
  const weeks = number(input.weeks, 'Timeline in weeks', 1, 24);
  const end = planEndDate({ startDate, weeks });
  const dates = (row: Record<string, unknown>) => {
    const start = planDate(row.startDate); const due = planDate(row.dueDate);
    if (start < startDate || due > end || start > due) throw new Error(`Milestone and phase dates must fall between ${startDate} and ${end}, with the due date on or after the start.`);
    return { startDate: start, dueDate: due };
  };
  const phases = list(input.phases, 'phases', 8).map(value => { const row = record(value); return { id: id(row.id), title: text(row.title, 'Phase name', 80), ...dates(row) }; });
  if (new Set(phases.map(item => item.title)).size !== phases.length || new Set(phases.map(item => item.id)).size !== phases.length) throw new Error('Give each phase a unique name and ID.');
  const milestones = list(input.milestones, 'milestones', 12).map(value => {
    const row = record(value); const phase = text(row.phase, 'Milestone phase', 80);
    if (!phases.some(item => item.title === phase)) throw new Error('Assign every milestone to a phase in your roadmap.');
    return { id: id(row.id), name: text(row.name, 'Milestone name', 160), phase, description: text(row.description, 'Milestone description', 800), ...dates(row) };
  });
  if (new Set(milestones.map(item => item.id)).size !== milestones.length) throw new Error('Each milestone needs a unique record ID.');
  const plan: IdeaPlan = {
    version: 1, id: id(input.id), idea: text(input.idea, 'Original idea', 1500), title: text(input.title, 'Project title', 160), summary: text(input.summary, 'Project summary', 800), domain: text(input.domain, 'Project domain', 120),
    startDate, weeks, teamSize: number(input.teamSize, 'Team size', 1, 8), source: input.source as IdeaPlan['source'],
    audience: optionalText(input.audience, 'Intended audience', 240), successCriteria: optionalText(input.successCriteria, 'Definition of success', 240), constraints: optionalText(input.constraints, 'Constraints or must-haves', 400),
    objectives: list(input.objectives, 'objectives', 6).map(value => text(value, 'Objective', 160)), phases, milestones,
    roles: list(input.roles, 'suggested roles', 8).map(value => { const row = record(value); return { title: text(row.title, 'Role title', 60), responsibility: text(row.responsibility, 'Role responsibility', 160) }; }),
    chapters: list(input.chapters, 'report chapters', 8).map(value => { const row = record(value); return { title: text(row.title, 'Chapter title', 100), prompt: text(row.prompt, 'Chapter outline', 500) }; }),
  };
  if (planMarkdown(plan).length > 20000 || ideaProjectSummary(plan).length > 4000 || new TextEncoder().encode(JSON.stringify({ action: 'project.from-plan', plan })).length > 32000) throw new Error('Shorten your planning notes so the draft fits your workspace’s saved-document limits.');
  return plan;
}

export function detectIdeaDomain(idea: string): Exclude<IdeaDomain, 'auto'> {
  if (/\b(sensor|iot|arduino|raspberry|hardware|embedded|robot)\b/i.test(idea)) return 'iot';
  if (/\b(machine learning|prediction|predict|dataset|ai|analytics|classifier|data science)\b/i.test(idea)) return 'data';
  if (/\b(research|study|survey|hypothesis|experiment|dissertation)\b/i.test(idea)) return 'research';
  if (/\b(mobile|android|ios|flutter|react native)\b/i.test(idea)) return 'mobile';
  return 'web';
}
export function ideaWeeks(idea: string): number | null {
  const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const match = idea.match(/\b(?:in|within|over)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(weeks?|months?)\b/i);
  if (!match) return null;
  const amount = /^\d/.test(match[1]) ? Number(match[1]) : words.indexOf(match[1].toLowerCase()) + 1;
  const weeks = amount * (/month/i.test(match[2]) ? 4 : 1);
  return weeks >= 1 && weeks <= 24 ? weeks : null;
}

const domainBriefs = {
  web: { label: 'Web platform', design: 'User journeys & prototype', build: 'Working web platform', testing: 'Usability & reliability review', focus: 'core user journeys, accessible interfaces, and reliable data flows', role: 'Application developer' },
  mobile: { label: 'Mobile application', design: 'Mobile flows & prototype', build: 'Working mobile application', testing: 'Device & usability review', focus: 'mobile navigation, device behavior, and reliable application state', role: 'Mobile developer' },
  data: { label: 'Data & AI', design: 'Dataset & baseline design', build: 'Reproducible analysis pipeline', testing: 'Evaluation & error analysis', focus: 'data quality, a reproducible baseline, and measurable evaluation criteria', role: 'Data & modeling lead' },
  iot: { label: 'IoT & hardware', design: 'Hardware & system design', build: 'Working device prototype', testing: 'Integration & measurement review', focus: 'component selection, device integration, and repeatable measurements', role: 'Hardware & integration lead' },
  research: { label: 'Research study', design: 'Study protocol & instruments', build: 'Research evidence collection', testing: 'Analysis & limitations review', focus: 'a clear research question, a documented method, and defensible evidence', role: 'Research & analysis lead' },
} as const;

export function generateStarterPlan(raw: IdeaInput, makeId: () => string): IdeaPlan {
  const input = validateIdeaInput(raw);
  const domain = domainBriefs[input.domain === 'auto' ? detectIdeaDomain(input.idea) : input.domain];
  const subject = input.idea.replace(/^(?:i\s+(?:want|would like|need)\s+to\s+|we\s+(?:want|need)\s+to\s+)?(?:build|create|develop|make|design|research|study)\s+(?:an?\s+)?/i, '').replace(/\s+\b(?:in|within|over)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:weeks?|months?)\b[.!]?/gi, '').split(/[.!?\n]/)[0].trim();
  const title = (subject || 'My academic project').split(/\s+/).slice(0, 10).join(' ').slice(0, 100).replace(/\b[a-z]/g, letter => letter.toUpperCase());
  const names = ['Discovery', 'Design', 'Build', 'Validation', 'Presentation'];
  const weights = [0.15, 0.2, 0.35, 0.2, 0.1];
  const days = input.weeks * 7;
  const lengths = weights.map(weight => Math.max(1, Math.floor(weight * days)));
  while (lengths.reduce((sum, length) => sum + length, 0) < days) for (const index of [2, 1, 3, 0, 4]) { if (lengths.reduce((sum, length) => sum + length, 0) < days) lengths[index]++; }
  while (lengths.reduce((sum, length) => sum + length, 0) > days) for (const index of [2, 1, 3, 0, 4]) { if (lengths[index] > 1 && lengths.reduce((sum, length) => sum + length, 0) > days) lengths[index]--; }
  let offset = 0;
  const phases = names.map((name, index) => { const phase = { id: makeId(), title: name, startDate: addPlanDays(input.startDate, offset), dueDate: addPlanDays(input.startDate, offset + lengths[index] - 1) }; offset += lengths[index]; return phase; });
  const milestoneNames = ['Problem statement & scope', domain.design, domain.build, domain.testing, 'Final report & project presentation'];
  const audience = input.audience || 'the intended audience';
  const successCriteria = input.successCriteria || 'measurable success criteria';
  const constraints = input.constraints ? ` Work within these constraints: ${input.constraints}.` : '';
  const descriptions = [
    `Define ${audience}, the problem, objectives, and success criteria for ${title}. Agree on a realistic first-version scope.`,
    `Design ${domain.focus}. Document the approach and collect feedback before implementation.`,
    `Produce the first complete version of ${title}. Track decisions, contributions, and evidence against the agreed scope.${constraints}`,
    `Evaluate the work against ${successCriteria}. Record results, address important issues, and document limitations.`,
    'Prepare the Blackbook report, demonstrate the outcomes, and organize the evidence for your final presentation.',
  ];
  const roles: IdeaRole[] = [
    { title: 'Project lead', responsibility: 'Coordinate scope, milestones, team communication, and the final presentation.' },
    { title: domain.role, responsibility: `Lead ${domain.focus}.`.slice(0, 160) },
    { title: 'Design & research lead', responsibility: 'Understand the intended audience, shape the proposed approach, and maintain the research evidence.' },
    { title: 'Quality & documentation lead', responsibility: 'Maintain evaluation criteria, test evidence, the report outline, and delivery documentation.' },
    { title: 'Integration lead', responsibility: 'Connect components, review interfaces, and keep integration evidence organized.' },
    { title: 'Evidence & analysis lead', responsibility: 'Organize measurements and project evidence, and summarize the outcomes clearly.' },
    { title: 'Experience reviewer', responsibility: 'Review the end-to-end experience and prioritize feedback from representative users.' },
    { title: 'Delivery coordinator', responsibility: 'Keep checkpoints, handoffs, and presentation materials aligned with the roadmap.' },
  ];
  if (input.teamSize === 1) roles[0].responsibility = 'Own planning, research, implementation, evaluation, documentation, and presentation. Seek mentor feedback at each checkpoint.';
  const prompts = [
    `Summarize the problem addressed by ${title}, your proposed approach, and the outcomes you will evaluate.`,
    'Explain the intended audience, the existing gap, the project scope, and measurable objectives. Distinguish planned goals from achieved results.',
    `Describe how you will investigate, design, build, and evaluate the project, including ${domain.focus}.`,
    'Describe the components, interfaces, tools, and flow of information or research evidence. Include a diagram appropriate to the project.',
    'Document evaluation criteria, test procedures, actual findings, and limitations. Add evidence as the project progresses.',
    'Summarize the actual contribution, lessons learned, remaining limitations, and realistic next steps after the first version.',
  ];
  return validateIdeaPlan({
    version: 1, id: makeId(), idea: input.idea, title, summary: `Develop ${title} as a ${input.weeks}-week ${domain.label.toLowerCase()} project for ${audience}. The plan focuses on ${domain.focus}, with a documented path from discovery to presentation.${input.successCriteria ? ` Success will be assessed using ${input.successCriteria}.` : ''}${constraints}`,
    audience: input.audience, successCriteria: input.successCriteria, constraints: input.constraints,
    domain: domain.label, weeks: input.weeks, startDate: input.startDate, teamSize: input.teamSize, source: 'starter',
    objectives: [`Define a clear problem, audience, and first-version scope for ${title}.`.slice(0, 160), `Create a working outcome grounded in ${domain.focus}.`.slice(0, 160), `Evaluate the outcome against ${successCriteria}.`.slice(0, 160), 'Present the project through a structured report, demonstration, and portfolio-ready summary.'],
    phases, milestones: phases.map((phase, index) => ({ id: makeId(), name: milestoneNames[index], phase: phase.title, description: descriptions[index], startDate: phase.startDate, dueDate: phase.dueDate })),
    roles: roles.slice(0, input.teamSize), chapters: ideaChapterNames.map((title, index) => ({ title, prompt: prompts[index] })),
  });
}

export function ideaProjectSummary(plan: IdeaPlan) {
  return [plan.summary, '\nPlanning brief', `• Intended audience: ${plan.audience || 'To be confirmed'}`, `• Definition of success: ${plan.successCriteria || 'To be agreed with the team'}`, `• Constraints or must-haves: ${plan.constraints || 'None supplied'}`, '\nObjectives', ...plan.objectives.map(item => `• ${item}`), '\nSuggested team responsibilities', ...plan.roles.map(item => `• ${item.title}: ${item.responsibility}`)].join('\n');
}
export function planMarkdown(plan: IdeaPlan) {
  return [
    `# ${plan.title}`, '\n> Editable project plan — suggested work, not completed results.', '\n## Original idea', plan.idea,
    '\n## Project overview', plan.summary, `\n- Domain: ${plan.domain}`, `- Timeline: ${plan.weeks} weeks (${plan.startDate} to ${planEndDate(plan)})`, `- Planned team size: ${plan.teamSize}`,
    '\n## Planning brief', `- Intended audience: ${plan.audience || 'To be confirmed'}`, `- Definition of success: ${plan.successCriteria || 'To be agreed with the team'}`, `- Constraints or must-haves: ${plan.constraints || 'None supplied'}`,
    '\n## Objectives', ...plan.objectives.map(item => `- ${item}`), '\n## Roadmap', ...plan.phases.map(item => `- ${item.title}: ${item.startDate} → ${item.dueDate}`),
    '\n## Milestones', ...plan.milestones.flatMap(item => [`### ${item.name}`, `${item.phase} · ${item.startDate} → ${item.dueDate}`, item.description]),
    '\n## Suggested team responsibilities', ...plan.roles.map(item => `- **${item.title}:** ${item.responsibility}`),
    '\n## Blackbook chapter outline', ...plan.chapters.flatMap(item => [`### ${item.title}`, item.prompt]),
  ].join('\n');
}
