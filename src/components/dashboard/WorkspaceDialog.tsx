import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { X } from 'lucide-react';
import { isInactive, safeExternalUrl, type DashboardData } from '../../lib/dashboard-data';
import { supabase } from '../../lib/supabase';

interface Props {
  kind: 'project' | 'milestone' | 'profile';
  data: DashboardData;
  user: User;
  initialProjectId?: string;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}
function savedAt() { return new Date().toISOString(); }

export default function WorkspaceDialog({ kind, data, user, initialProjectId, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const title = kind === 'project' ? 'Create a project' : kind === 'milestone' ? 'Add a milestone' : 'Edit your profile';
  const projects = data.squads.filter(project => !isInactive(project.status));
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} className="dash-dialog" aria-labelledby="workspace-dialog-title" onCancel={event => {
      event.preventDefault();
      if (!saving) onClose();
    }}>
      <div className="dash-dialog-heading">
        <div><span className="dash-eyebrow">YOUR WORKSPACE</span><h2 id="workspace-dialog-title">{title}</h2></div>
        <button type="button" className="dash-icon-button" aria-label="Close dialog" disabled={saving} onClick={onClose}><X size={19} /></button>
      </div>
      <form className="dash-form" onSubmit={async event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const value = (name: string) => String(form.get(name) ?? '').trim();
        const optional = (name: string) => value(name) || null;
        setSaving(true);
        setError('');
        try {
          if (!supabase || !user.email) throw new Error('Sign in again to save changes.');
          if (kind === 'project') {
            if (!value('title')) throw new Error('Enter a project title.');
            if (['github_repo', 'figma_url', 'miro_url'].some(field => value(field) && !safeExternalUrl(value(field)))) throw new Error('Use valid HTTP or HTTPS URLs for project tools.');
            const { error: saveError } = await supabase.from('pms_squads').insert({
              title: value('title'), tagline: optional('tagline'), domain: optional('domain'),
              summary: optional('summary'), leader_email: user.email, current_phase: optional('current_phase'),
              github_repo: optional('github_repo'), figma_url: optional('figma_url'), miro_url: optional('miro_url'),
            }).select('id').single();
            if (saveError) throw saveError;
          } else if (kind === 'milestone') {
            if (!value('name') || !value('phase')) throw new Error('Enter a milestone name and phase.');
            if (!projects.some(squad => squad.id === value('squad_id'))) throw new Error('Select a current project. Restore an archived project before adding milestones.');
            if (value('start_date') && value('due_date') && value('start_date') > value('due_date')) throw new Error('The due date must be on or after the start date.');
            const { error: saveError } = await supabase.from('milestones').insert({
              squad_id: value('squad_id'), name: value('name'), phase: value('phase'),
              description: optional('description'), start_date: optional('start_date'), due_date: optional('due_date'),
            }).select('id').single();
            if (saveError) throw saveError;
          } else {
            if (!value('full_name')) throw new Error('Enter your full name.');
            const { error: saveError } = await supabase.from('profiles').upsert({
              id: user.id, email: user.email, full_name: value('full_name'),
              college: optional('college'), program: optional('program'), batch: optional('batch'),
              division: optional('division'), roll_number: optional('roll_number'), updated_at: savedAt(),
            }, { onConflict: 'id' }).select('id').single();
            if (saveError) throw saveError;
          }
          await onSaved(kind === 'project' ? 'Your project was saved to Supabase.' : kind === 'milestone' ? 'Your milestone was saved to Supabase.' : 'Your profile has been updated.');
          onClose();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : typeof cause === 'object' && cause && 'message' in cause ? String(cause.message) : 'Unable to save. Please try again.');
        } finally { setSaving(false); }
      }}>
        {error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}
        <fieldset disabled={saving}>
          {kind === 'project' && <>
            <label>Project title<input name="title" required maxLength={160} autoFocus placeholder="Give your project a name" /></label>
            <div className="dash-form-grid">
              <label>Domain<input name="domain" maxLength={120} placeholder="Your area of work" /></label>
              <label>Tagline<input name="tagline" maxLength={200} placeholder="A short description" /></label>
            </div>
            <label>Project summary<textarea name="summary" rows={3} maxLength={4000} placeholder="What are you building?" /></label>
            <label>Current phase<input name="current_phase" maxLength={120} placeholder="Planning, Research, Design, Build…" /></label>
            <label>Repository URL<input name="github_repo" type="url" placeholder="https://github.com/…" /></label>
            <div className="dash-form-grid">
              <label>Figma URL<input name="figma_url" type="url" placeholder="https://figma.com/…" /></label>
              <label>Miro URL<input name="miro_url" type="url" placeholder="https://miro.com/…" /></label>
            </div>
          </>}
          {kind === 'milestone' && <>
            <label>Project<select name="squad_id" required defaultValue={projects.some(project => project.id === initialProjectId) ? initialProjectId : projects[0]?.id}>
              {projects.map(squad => <option key={squad.id} value={squad.id}>{squad.title}</option>)}
            </select></label>
            <label>Milestone name<input name="name" required maxLength={160} autoFocus placeholder="What needs to be delivered?" /></label>
            <label>Phase<input name="phase" required maxLength={120} placeholder="Project phase" /></label>
            <label>Description<textarea name="description" rows={3} maxLength={4000} /></label>
            <div className="dash-form-grid">
              <label>Start date<input name="start_date" type="date" /></label>
              <label>Due date<input name="due_date" type="date" /></label>
            </div>
          </>}
          {kind === 'profile' && <>
            <label>Full name<input name="full_name" required maxLength={160} autoFocus defaultValue={data.profile?.full_name || user.user_metadata.full_name || ''} /></label>
            <label>Institution<input name="college" maxLength={200} defaultValue={data.profile?.college || user.user_metadata.college || ''} /></label>
            <label>Program<input name="program" maxLength={120} defaultValue={data.profile?.program || ''} /></label>
            <div className="dash-form-grid">
              <label>Batch<input name="batch" maxLength={40} defaultValue={data.profile?.batch || ''} /></label>
              <label>Division<input name="division" maxLength={40} defaultValue={data.profile?.division || ''} /></label>
            </div>
            <label>Roll number<input name="roll_number" maxLength={60} defaultValue={data.profile?.roll_number || ''} /></label>
          </>}
        </fieldset>
        <div className="dash-dialog-actions">
          <button type="button" className="dash-button" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="dash-button dash-button-primary" disabled={saving}>{saving ? 'Saving…' : kind === 'project' ? 'Create project' : kind === 'milestone' ? 'Add milestone' : 'Save profile'}</button>
        </div>
      </form>
    </dialog>
  );
}
