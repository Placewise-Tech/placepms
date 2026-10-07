import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowUpRight, Download, FolderKanban, LoaderCircle, Pencil, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { completeIdeaDraft, readIdeaDraft, saveIdeaDraft, type IdeaDraft } from '../../lib/idea-draft';
import { planMarkdown, validateIdeaPlan, type IdeaPlan } from '../../lib/idea-plan';
import { downloadText, errorMessage, workspaceRequest } from '../../lib/workspace-api';
import { useWorkspaceRoot } from '../../lib/workspace-roles';
import IdeaPlanEditor from '../IdeaPlanEditor';
import { DetailDialog } from './WorkspaceUI';

export default function IdeaPlanHandoff({ user, onSaved }: { user: User; onSaved: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState<IdeaDraft | null>(() => { const value = readIdeaDraft(); return value?.pending && (!value.ownerId || value.ownerId === user.id) ? value : null; });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate(); const root = useWorkspaceRoot();
  if (!draft) return null;
  const update = (plan: IdeaPlan) => { setDraft(current => current ? { ...current, plan } : null); setError(''); };
  const saveEdit = () => {
    try { const value = saveIdeaDraft(validateIdeaPlan(draft.plan), { pending: true, ownerId: draft.ownerId }); setDraft(value); setEditing(false); setError(''); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  const create = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const value = saveIdeaDraft(validateIdeaPlan(draft.plan), { pending: true, ownerId: user.id }); setDraft(value);
      const result = await workspaceRequest<{ projectId: string; milestones: number; documentSaved: boolean; blackbookSaved: boolean }>('workspace', { action: 'project.from-plan', plan: value.plan });
      try { completeIdeaDraft(value.plan.id, user.id, result.projectId); } catch { /* Stable server record IDs still make retries safe if browser storage is unavailable. */ }
      setDraft(null);
      await onSaved(`Your project and ${result.milestones} milestones are ready.${result.blackbookSaved ? ' Your Blackbook outline is saved.' : result.documentSaved ? ' Your project plan is saved in Documents.' : ' Documents are disabled; keep your downloaded plan.'}`);
      navigate(`${root}/projects/${encodeURIComponent(result.projectId)}`);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  return <>
    <section className="dash-panel idea-handoff" aria-labelledby="idea-handoff-title"><div className="idea-handoff-heading"><span><FolderKanban size={23} /></span><div><span className="dash-eyebrow">YOUR HOMEPAGE IDEA, READY TO BUILD</span><h2 id="idea-handoff-title">Bring your plan into this workspace.</h2><p>{draft.plan.title} · {draft.plan.weeks} weeks · {draft.plan.milestones.length} milestones</p></div><button className="dash-icon-button" aria-label="Keep plan for later" disabled={busy} onClick={() => setDraft(null)}><X size={17} /></button></div><p className="idea-handoff-copy">Create your project, dated milestones, and planning notes together. Suggested roles stay in your plan until you add real teammates.</p>
      {error && <div className="dash-alert dash-alert-error" role="alert">{error}<span className="idea-handoff-retry">Your draft is kept. Retry to finish the same project.</span></div>}
      <div className="workspace-actions"><button className="dash-button dash-button-primary" disabled={busy} onClick={() => void create()}>{busy ? <LoaderCircle size={15} className="idea-spinner" /> : <ArrowUpRight size={15} />}{busy ? 'Creating your project…' : draft.ownerId ? 'Continue creating project' : 'Create project from my plan'}</button><button className="dash-button" disabled={busy || Boolean(draft.ownerId)} onClick={() => { setError(''); setEditing(true); }}><Pencil size={14} />Review plan</button><button className="dash-button" disabled={busy} onClick={() => downloadText('placepms-project-plan.md', planMarkdown(draft.plan), 'text/markdown;charset=utf-8')}><Download size={14} />Download plan</button></div>
    </section>
    {editing && <DetailDialog title="Review your project plan" subtitle="Make the plan yours before creating the project." busy={busy} onClose={() => setEditing(false)}>{error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}<IdeaPlanEditor plan={draft.plan} onChange={update} disabled={busy} /><div className="dash-dialog-actions"><button className="dash-button" onClick={() => { const saved = readIdeaDraft(); if (saved?.plan.id === draft.plan.id) setDraft(saved); setEditing(false); }}>Cancel edits</button><button className="dash-button dash-button-primary" onClick={saveEdit}>Save plan edits</button></div></DetailDialog>}
  </>;
}
