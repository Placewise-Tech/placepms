import { useCallback, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Check, CheckCircle2, Download, FileText, FolderKanban, Gauge, Layers3, Pause, Play, RotateCcw, Sparkles, Workflow } from 'lucide-react';
import type { DashboardData, Milestone } from '../lib/dashboard-data';
import { calendarExport, emptyDashboard, localDateKey } from '../lib/dashboard-data';
import { projectHealth } from '../lib/workspace-insights';
import { buildBlackbook } from '../lib/workspace-library';
import { downloadText } from '../lib/workspace-api';
import { useHomeAutoplay } from '../hooks/useHomeAutoplay';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Flow = 'insights' | 'blackbook' | 'deadlines';
const flows = [
  { id: 'insights', label: 'Project insights', icon: Gauge, description: 'Turn milestones into a clear picture of progress.', steps: ['Read milestones', 'Calculate project health', 'Surface priorities'] },
  { id: 'blackbook', label: 'Blackbook builder', icon: FileText, description: 'Bring your project, team, and evidence into a report.', steps: ['Collect project records', 'Assemble authored sections', 'Build the report'] },
  { id: 'deadlines', label: 'Deadline planning', icon: CalendarDays, description: 'Package project dates for your calendar.', steps: ['Read project dates', 'Organize milestones', 'Prepare calendar export'] },
] as const;

function sampleWorkspace(): DashboardData {
  const date = (offset: number) => { const value = new Date(); value.setDate(value.getDate() + offset); return localDateKey(value); };
  const project = {
    id: 'home-demo-project', title: 'Campus Compass', tagline: 'A better-connected campus', domain: 'Web development',
    summary: 'A sample student project that brings campus resources, events, and opportunities into one accessible workspace.',
    leader_email: 'avery@example.com', mentor_id: null, mentor_name: 'Demo mentor', github_repo: null, figma_url: null, miro_url: null,
    current_phase: 'Development', status: 'ACTIVE', created_at: null, updated_at: null,
  };
  const milestones: Milestone[] = [
    { name: 'Research & discovery', status: 'APPROVED', offset: -8, phase: 'Research' },
    { name: 'Interactive prototype', status: 'APPROVED', offset: -4, phase: 'Design' },
    { name: 'Usability review', status: 'SUBMITTED', offset: 2, phase: 'Testing' },
    { name: 'Implementation demo', status: 'IN_PROGRESS', offset: -1, phase: 'Development' },
  ].map((task, index) => ({
    id: `home-demo-${index}`, squad_id: project.id, name: task.name, phase: task.phase, description: `Sample milestone: ${task.name}.`,
    start_date: null, due_date: date(task.offset), status: task.status, submission_files: [], mentor_feedback: null,
    score: null, submitted_at: null, created_at: null, updated_at: null,
  }));
  return { ...emptyDashboard, squads: [project], milestones, members: [
    { id: 'demo-avery', squad_id: project.id, name: 'Avery', email: 'avery@example.com', role: 'Project lead', skills: ['Development'] },
    { id: 'demo-jordan', squad_id: project.id, name: 'Jordan', email: 'jordan@example.com', role: 'Designer', skills: ['Design'] },
  ] };
}

export default function HomeAutomation({ motionPaused }: { motionPaused: boolean }) {
  const [flow, setFlow] = useState<Flow>('insights');
  const [run, setRun] = useState({ phase: 0, running: false });
  const reduced = useReducedMotion();
  const data = useMemo(() => sampleWorkspace(), []);
  const health = useMemo(() => projectHealth(data)[0], [data]);
  const report = useMemo(() => '> Interactive PlacePMS demo — sample project data.\n\n' + buildBlackbook(data.squads[0], data, {
    Abstract: 'Campus Compass is a sample academic project exploring a more accessible way to discover campus resources and opportunities.',
    Methodology: 'The sample team follows discovery, prototyping, usability review, and implementation milestones.',
  }, []), [data]);
  const current = flows.find(item => item.id === flow)!;
  const complete = run.phase === current.steps.length;
  const advance = useCallback(() => setRun(value => {
    const phase = Math.min(value.phase + 1, 3);
    return { phase, running: phase < 3 };
  }), []);
  const panelRef = useHomeAutoplay<HTMLDivElement>({ enabled: run.running && !motionPaused && !reduced, delay: 950, onAdvance: advance, pauseOnInteraction: false });

  const selectFlow = (value: Flow) => { setFlow(value); setRun({ phase: 0, running: false }); };
  const toggleRun = () => {
    if (run.running) { setRun(value => ({ ...value, running: false })); return; }
    if (reduced || motionPaused) { setRun({ phase: 3, running: false }); return; }
    setRun(value => ({ phase: value.phase === 3 ? 0 : value.phase, running: true }));
  };
  const exportResult = () => {
    if (flow === 'blackbook') downloadText('placepms-demo-blackbook.md', report, 'text/markdown;charset=utf-8');
    else if (flow === 'deadlines') downloadText('placepms-demo-deadlines.ics', calendarExport(data.milestones), 'text/calendar;charset=utf-8');
    else downloadText('placepms-demo-insights.json', JSON.stringify({ sample: true, project: data.squads[0].title, completion: health.completion, overdue: health.overdue, awaitingReview: health.submitted }, null, 2), 'application/json');
  };

  return <section id="automation" className="home-section home-automation" aria-labelledby="home-automation-title">
    <div className="home-container home-automation-grid">
      <div className="home-automation-copy">
        <span className="home-eyebrow"><Workflow size={14} /> Connected by design</span>
        <h2 id="home-automation-title">Less manual.<br /><span>More momentum.</span></h2>
        <p>Watch project records become useful insights, a structured report, or calendar-ready deadlines. Pick a workflow and give it a spin.</p>
        <div className="home-flow-options" aria-label="Choose a sample workflow">{flows.map(({ id, label, icon: Icon, description }) => <button key={id} aria-pressed={flow === id} onClick={() => selectFlow(id)}>
          <span className="home-flow-option-icon"><Icon size={19} /></span><span><strong>{label}</strong><small>{description}</small></span><ArrowRight size={16} />
        </button>)}</div>
        <span className="home-demo-note"><Sparkles size={13} /> Interactive preview using sample data</span>
      </div>

      <div className="home-automation-panel" ref={panelRef}>
        <div className="home-automation-chrome"><span><Workflow size={15} /> placepms / workflow studio</span><span className={run.running ? 'is-running' : ''}><span className="home-live-dot" />{run.running ? motionPaused ? 'Paused' : 'Running' : complete ? 'Complete' : run.phase ? 'Paused' : 'Ready'}</span></div>
        <div className="home-flow-source"><span className="home-flow-source-icon"><FolderKanban size={21} /></span><div><small>Sample project</small><strong>{data.squads[0].title}</strong></div><span>{data.milestones.length} milestones <Layers3 size={14} /></span></div>
        <ol className="home-flow-pipeline" aria-label="Workflow progress">{current.steps.map((label, index) => <li key={`${flow}-${label}`} className={run.phase > index ? 'is-done' : run.running && run.phase === index ? 'is-active' : ''}>
          <span>{run.phase > index ? <Check size={15} /> : `0${index + 1}`}</span><strong>{label}</strong>
        </li>)}</ol>

        <div className={`home-flow-result ${complete ? 'is-complete' : ''}`}>
          {complete ? <>
            <div className="home-flow-result-heading"><CheckCircle2 size={17} /><strong>{flow === 'insights' ? 'A clearer picture of your project.' : flow === 'blackbook' ? 'Your evidence. Ready to tell its story.' : 'Your next deadlines. All in one place.'}</strong></div>
            {flow === 'insights' ? <div className="home-flow-metrics"><div><strong>{health.completion}%</strong><span>Completed</span></div><div><strong>{health.submitted.toString().padStart(2, '0')}</strong><span>Awaiting review</span></div><div><strong>{health.overdue.toString().padStart(2, '0')}</strong><span>Needs attention</span></div></div> : flow === 'blackbook' ? <div className="home-flow-document"><span><FileText size={25} /></span><div><strong>Campus Compass / Blackbook</strong><p>Project overview, team, authored sections, and milestone evidence.</p><small>Markdown · editable · export-ready</small></div></div> : <div className="home-flow-deadlines">{data.milestones.slice(2).map(task => <div key={task.id}><CalendarDays size={16} /><span>{task.name}</span><time dateTime={task.due_date!}>{new Date(`${task.due_date}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</time></div>)}</div>}
            <p className="home-flow-result-note">{flow === 'insights' ? 'Calculated from the four sample milestones above.' : flow === 'blackbook' ? 'Built with the same report generator used in your workspace.' : 'Download the .ics file to add all four sample milestones to your calendar.'}</p>
          </> : <div className="home-flow-empty"><span><Sparkles size={25} /></span><strong>{run.running ? 'Connecting the dots…' : run.phase ? 'Your workflow is paused.' : 'A little input. A useful outcome.'}</strong><p>{run.running ? current.steps[run.phase] : 'Run the workflow to see what your project records can do.'}</p><div aria-hidden="true"><i /><i /><i /></div></div>}
        </div>

        <div className="home-flow-actions"><button className="home-button home-button-primary" onClick={toggleRun}>{run.running ? <Pause size={15} /> : complete ? <RotateCcw size={15} /> : <Play size={15} />}{run.running ? 'Pause workflow' : complete ? 'Run again' : run.phase ? 'Resume workflow' : 'Run workflow'}</button><button className="home-button home-button-glass" disabled={!complete} onClick={exportResult}><Download size={15} />Download sample</button></div>
        <p className="home-flow-status" role="status">{complete ? `${current.label} complete. Your sample is ready to download.` : run.running && motionPaused ? 'Workflow paused by your page motion setting.' : run.running ? `Step ${run.phase + 1} of 3: ${current.steps[run.phase]}.` : run.phase ? `Workflow paused. Resume to continue with ${current.steps[run.phase].toLowerCase()}.` : 'Choose a workflow. No account needed to try the demo.'}</p>
      </div>
    </div>
  </section>;
}
