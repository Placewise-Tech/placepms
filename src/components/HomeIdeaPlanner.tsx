import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, CheckCircle2, Download, Lightbulb, LoaderCircle, RotateCcw, Sparkles, WandSparkles, Workflow } from 'lucide-react';
import { localDateKey } from '../lib/dashboard-data';
import { generateStarterPlan, ideaDomains, ideaWeeks, planMarkdown, validateIdeaInput, validateIdeaPlan, type IdeaInput, type IdeaPlan } from '../lib/idea-plan';
import { clearIdeaDraft, prepareIdeaHandoff, readIdeaDraft, saveIdeaDraft } from '../lib/idea-draft';
import { downloadText } from '../lib/workspace-api';
import IdeaPlanEditor from './IdeaPlanEditor';
import { useReducedMotion } from '../hooks/useReducedMotion';

const examples = ['Build a campus placement portal in six weeks', 'Create a mobile app for student wellbeing in eight weeks', 'Build an IoT system to monitor classroom air quality in four weeks'];
type Inputs = Omit<IdeaInput, 'weeks' | 'teamSize'> & { weeks: string; teamSize: string };

export default function HomeIdeaPlanner({ onOpenAuth, motionPaused }: { onOpenAuth: (mode: 'signin' | 'signup') => void; motionPaused: boolean }) {
  const reduced = useReducedMotion();
  const [restored] = useState(() => readIdeaDraft());
  const [plan, setPlan] = useState<IdeaPlan | null>(restored?.plan || null);
  const [input, setInput] = useState<Inputs>(() => ({ idea: restored?.plan.idea || '', audience: restored?.plan.audience || '', successCriteria: restored?.plan.successCriteria || '', constraints: restored?.plan.constraints || '', weeks: String(restored?.plan.weeks || 6), teamSize: String(restored?.plan.teamSize || 4), startDate: restored?.plan.startDate || localDateKey(), domain: 'auto' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(restored ? 'Your project draft is restored. Continue where you left off.' : '');
  const [saved, setSaved] = useState(Boolean(restored));
  const [saveError, setSaveError] = useState('');
  const [handedOff, setHandedOff] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const result = useRef<HTMLDivElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!plan || handedOff) return;
    const timer = setTimeout(() => {
      try { saveIdeaDraft(plan); setSaved(true); setSaveError(''); }
      catch (cause) { setSaved(false); setSaveError(cause instanceof Error ? cause.message : 'Your browser could not save this draft.'); }
    }, 350);
    return () => clearTimeout(timer);
  }, [plan, handedOff]);
  const edit = (value: IdeaPlan) => { setHandedOff(false); setPlan(value); setSaved(false); setError(''); };
  const inputValue = () => validateIdeaInput({ ...input, weeks: Number(input.weeks), teamSize: Number(input.teamSize) });
  const adopt = (value: IdeaPlan, message: string) => {
    setHandedOff(false); setPlan(value); setSaved(false); setNotice(message);
    requestAnimationFrame(() => {
      const element = result.current;
      element?.focus({ preventScroll: true });
      if (element && element.getBoundingClientRect().top > innerHeight * 0.8) element.scrollIntoView({ behavior: reduced || motionPaused ? 'instant' : 'smooth', block: 'start' });
    });
  };
  const build = async () => {
    setError(''); setSaveError('');
    let value: IdeaInput;
    try { value = inputValue(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Describe your idea.'); return; }
    setBusy(true); setNotice('Building a roadmap around your idea…');
    const abort = new AbortController(); controller.current = abort;
    try {
      const response = await fetch('/api/idea-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(35_000)]) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Plan generation could not finish. Please try again.');
      adopt(validateIdeaPlan(data.plan), typeof data.notice === 'string' ? data.notice : 'Your editable plan is ready.');
    } catch (cause) { if (!abort.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Plan generation could not finish.'); setNotice(''); } }
    finally { if (!abort.signal.aborted) setBusy(false); }
  };
  const buildLocally = () => {
    try { adopt(generateStarterPlan(inputValue(), () => crypto.randomUUID()), 'Your domain-aware starter plan is ready to edit.'); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Describe your idea.'); }
  };
  const handoff = (mode: 'signin' | 'signup') => {
    if (!plan) return;
    try {
      const draft = prepareIdeaHandoff(validateIdeaPlan(plan));
      setHandedOff(true); setPlan(draft.plan); setSaved(true); setError(''); setSaveError('');
      onOpenAuth(mode);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your draft could not be saved.'); }
  };
  const download = () => {
    if (!plan) return;
    try { const value = validateIdeaPlan(plan); downloadText('placepms-project-plan.md', planMarkdown(value), 'text/markdown;charset=utf-8'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Complete your plan before downloading.'); }
  };
  const chooseExample = (idea: string) => { setInput(current => ({ ...current, idea, weeks: String(ideaWeeks(idea) || 6), domain: 'auto' })); setError(''); };

  return <section id="idea-planner" className="home-section home-idea-planner" aria-labelledby="home-idea-title"><div className="home-container">
    <div className="home-idea-heading"><div className="home-section-heading"><span className="home-eyebrow"><Lightbulb size={14} /> Idea → validated workspace plan</span><h2 id="home-idea-title">Turn a rough idea<br /><span>into a clear next step.</span></h2></div><div className="home-idea-heading-side"><p>Answer a few focused questions. Get an editable roadmap with dated milestones, team responsibilities, and a report outline.</p><span><CheckCircle2 size={13} /> No account needed to explore</span></div></div>
    <div className="home-idea-grid">
      <form className="home-idea-input" onSubmit={event => { event.preventDefault(); void build(); }}>
        <div className="home-idea-form-intro"><span className="home-idea-label"><Sparkles size={15} /> START WITH A SPARK</span><strong>Give your project enough context to stay useful.</strong><p>Specific inputs produce a more realistic first version. You can edit every generated detail before saving it.</p></div>
        <fieldset disabled={busy}>
          <label htmlFor="home-project-idea">What do you want to build?<textarea id="home-project-idea" required minLength={12} maxLength={1500} rows={5} placeholder="I want to build a campus placement portal in six weeks…" value={input.idea} onChange={event => { const idea = event.target.value; setInput(current => ({ ...current, idea, weeks: String(ideaWeeks(idea) || current.weeks) })); setError(''); }} /></label>
          <div className="home-idea-input-meta"><span>Include the problem, who it affects, and the outcome you want.</span><span>{input.idea.length}/1500</span></div>
          <div className="home-idea-context-heading"><strong>Make the plan specific</strong><span>Optional details improve the recommendations.</span></div>
          <label htmlFor="home-project-audience">Who is this for?<input id="home-project-audience" maxLength={240} placeholder="Students looking for campus placements" value={input.audience} onChange={event => setInput(current => ({ ...current, audience: event.target.value }))} /></label>
          <label htmlFor="home-project-success">How will you know it works?<input id="home-project-success" maxLength={240} placeholder="Students can find and track suitable opportunities" value={input.successCriteria} onChange={event => setInput(current => ({ ...current, successCriteria: event.target.value }))} /></label>
          <label htmlFor="home-project-constraints">Constraints or must-haves<input id="home-project-constraints" maxLength={400} placeholder="Use existing campus data; keep the first version web-based" value={input.constraints} onChange={event => setInput(current => ({ ...current, constraints: event.target.value }))} /></label>
          <label htmlFor="home-project-domain">Project type<select id="home-project-domain" value={input.domain} onChange={event => setInput(current => ({ ...current, domain: event.target.value as IdeaInput['domain'] }))}>{ideaDomains.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <div className="home-idea-form-grid"><label>Timeline (weeks)<input type="number" min={1} max={24} required value={input.weeks} onChange={event => setInput(current => ({ ...current, weeks: event.target.value }))} /></label><label>Team size<input type="number" min={1} max={8} required value={input.teamSize} onChange={event => setInput(current => ({ ...current, teamSize: event.target.value }))} /></label></div>
          <label>Project start date<input type="date" required value={input.startDate} onChange={event => setInput(current => ({ ...current, startDate: event.target.value }))} /></label>
          <button className="home-button home-button-primary home-idea-build" type="submit">{busy ? <LoaderCircle size={17} className="idea-spinner" /> : <WandSparkles size={17} />}{busy ? 'Building your plan…' : plan ? 'Rebuild my plan' : 'Build my project plan'}<ArrowRight size={17} /></button>
        </fieldset>
        <div className="home-idea-examples"><span>Need a starting point?</span>{examples.map(idea => <button key={idea} type="button" disabled={busy} onClick={() => chooseExample(idea)}>{idea}<ArrowUpRight size={13} /></button>)}</div>
        <p className="home-idea-note"><strong>Accurate by design:</strong> dates are calculated from your start date and timeline. Generated text is a suggested starting point, so review it against your real requirements before creating a workspace.</p>
      </form>

      <div className="home-idea-result" ref={result} tabIndex={-1} aria-label="Your editable project plan" aria-busy={busy}>
        <div className="home-idea-result-top"><span><span className="home-live-dot" />{plan ? plan.source === 'ai' ? 'AI-assisted project draft' : 'Domain-aware starter draft' : 'IDEA → WORKSPACE'}</span>{plan && <span>{saved ? <CheckCircle2 size={13} /> : <RotateCcw size={13} />}{saved ? 'Saved in this browser' : 'Editing draft'}</span>}</div>
        {error && <div className="idea-error" role="alert">{error}{!busy && !plan && <button type="button" onClick={buildLocally}>Build a starter plan locally <ArrowRight size={13} /></button>}</div>}
        {saveError && <p className="idea-error" role="status">{saveError}</p>}
        {plan ? <>
          <IdeaPlanEditor plan={plan} onChange={edit} disabled={busy} />
          <p className="home-idea-notice" role="status">{notice}</p>
          <div className="home-idea-result-actions"><button className="home-button home-button-primary" disabled={busy} onClick={() => handoff('signup')}>Create a workspace with this plan <ArrowUpRight size={16} /></button><button className="home-button home-button-glass" disabled={busy} onClick={download}><Download size={15} />Download plan</button></div>
          <div className="home-idea-result-footer"><button disabled={busy} onClick={() => handoff('signin')}>Already have an account? Continue with this plan <ArrowRight size={13} /></button><button disabled={busy} onClick={() => { try { clearIdeaDraft(); setPlan(null); setNotice(''); setError(''); setSaveError(''); setSaved(false); } catch { setSaveError('Your browser could not clear the draft.'); } }}>Clear draft</button></div>
        </> : <div className="home-idea-empty"><span><Lightbulb size={36} /></span><h3>A thought today.<br />A plan you can act on.</h3><p>Your objectives, timeline, deliverables, suggested roles, and report outline will come together here.</p><div>{['Clear objectives', 'Dated milestones', 'Team responsibilities', 'Blackbook outline'].map((item, index) => <span key={item}><b>0{index + 1}</b>{item}<CheckCircle2 size={13} /></span>)}</div><p role="status">{notice || 'Start with your idea or try an example.'}</p></div>}
      </div>
    </div>
    <a className="home-idea-next-step" href="#automation"><span><Workflow size={17} /></span><div><strong>When your plan is ready, automate the follow-through.</strong><small>Preview project insights, Blackbook preparation, and calendar-ready deadlines in Workflow Studio.</small></div><ArrowRight size={16} /></a>
  </div></section>;
}
