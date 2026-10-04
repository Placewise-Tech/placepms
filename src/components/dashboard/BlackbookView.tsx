import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Download, FileText, Printer, Save } from 'lucide-react';
import type { DashboardData } from '../../lib/dashboard-data';
import { buildBlackbook, readBlackbookDraft, reportHtml, type LibraryEntry } from '../../lib/workspace-library';
import { downloadText, errorMessage } from '../../lib/workspace-api';
import { supabase } from '../../lib/supabase';

const blankSections = { 'Abstract': '', 'Problem statement & objectives': '', 'Methodology': '', 'System architecture': '', 'Testing & results': '', 'Conclusion & future scope': '' };

export default function BlackbookView({ data, user }: { data: DashboardData; user: User }) {
  const [projectId, setProjectId] = useState(data.squads[0]?.id || '');
  const [sections, setSections] = useState<Record<string, string>>(blankSections);
  const [report, setReport] = useState(''); const [reportTitle, setReportTitle] = useState('Project report');
  const [draftId, setDraftId] = useState(''); const [documentId, setDocumentId] = useState(''); const [dirty, setDirty] = useState(false);
  const [draftLoading, setDraftLoading] = useState(Boolean(projectId)); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const project = data.squads.find(item => item.id === projectId);

  useEffect(() => {
    if (!projectId || !supabase) return;
    const client = supabase;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setDraftLoading(true); setDraftId(''); setDocumentId(''); setSections(blankSections); setReport(''); setDirty(false); setError(''); setNotice('');
      void client.from('workspace_library').select('id,notes,updated_at').eq('user_id', user.id).eq('kind', 'document').eq('project_id', projectId).contains('tags', ['blackbook-draft']).order('updated_at', { ascending: false }).limit(1).abortSignal(controller.signal).then(result => {
        if (controller.signal.aborted) return;
        if (result.error) setError(result.error.message);
        else if (result.data?.[0]) {
          const row = result.data[0]; const draft = readBlackbookDraft(row.notes, Object.keys(blankSections));
          if (draft) { setDraftId(row.id); setSections(draft.sections); setReport(draft.report); setReportTitle(draft.title); setNotice(`Saved draft restored · ${new Date(row.updated_at).toLocaleString()}`); }
          else setError('The saved draft could not be read. You can find the original entry in Documents.');
        }
        setDraftLoading(false);
      }, cause => { if (!controller.signal.aborted) { setError(errorMessage(cause)); setDraftLoading(false); } });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [projectId, user.id]);

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  const saveDraft = async () => {
    if (!supabase || !project) return;
    const notes = JSON.stringify({ version: 1, title: reportTitle, sections, report });
    if (notes.length > 20000) { setError('The draft exceeds the 20,000-character saved-note limit. Download your full draft or shorten the report before saving.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const record = { user_id: user.id, kind: 'document', title: `Blackbook draft — ${project.title}`.slice(0, 200), notes, project_id: project.id, tags: ['blackbook-draft'], updated_at: new Date().toISOString() };
      const result = draftId ? await supabase.from('workspace_library').update(record).eq('id', draftId).eq('user_id', user.id).select('id').single() : await supabase.from('workspace_library').insert(record).select('id').single();
      if (result.error) throw result.error;
      setDraftId(result.data.id); setDirty(false); setNotice('Draft saved to your private Documents library. You can continue it on another device.');
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };

  return <section className="dash-panel"><div className="dash-panel-heading"><div><h2>Blackbook report builder</h2><p>Write, save, and restore project-specific drafts. Generate reports from actual project evidence and research.</p></div><FileText size={23} /></div><div className="workspace-content">
    {error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}{notice && <div className="dash-alert" role="status">{notice}</div>}
    {!data.squads.length ? <p>Create a project first to generate its blackbook.</p> : <form className="dash-form" onSubmit={async event => {
      event.preventDefault(); if (!supabase || !project) return;
      setBusy(true); setError(''); setNotice('');
      try {
        const result = await supabase.from('workspace_library').select('*').eq('user_id', user.id).eq('kind', 'research').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(200);
        if (result.error) throw result.error;
        setReport(buildBlackbook(project, data, sections, result.data as LibraryEntry[])); setReportTitle(project.title); setDirty(true);
        setNotice(result.data.length === 200 ? 'Report generated with the latest 200 research references.' : 'Report generated from saved records. Edit the report below, then save or export it.');
      } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
    }}><label>Project<select disabled={busy || draftLoading} value={projectId} onChange={event => { if (!dirty || window.confirm('Switch projects and discard unsaved report changes? Save your draft first to keep them.')) setProjectId(event.target.value); }}>{data.squads.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {draftLoading && <p role="status">Loading your saved project draft…</p>}
      <fieldset disabled={busy || draftLoading}><div className="workspace-actions"><span className="workspace-muted">{dirty ? 'Unsaved changes' : draftId ? 'Draft saved' : 'New draft'} · {Object.values(sections).filter(value => value.trim()).length} of {Object.keys(sections).length} sections written</span><button type="button" className="dash-button" onClick={() => void saveDraft()}><Save size={14} />Save draft</button><button type="button" className="dash-button" onClick={() => downloadText('placepms-blackbook-draft.json', JSON.stringify({ version: 1, title: project?.title || reportTitle, sections, report }, null, 2), 'application/json')}>Download draft</button></div><div className="dash-form-grid">{Object.entries(sections).map(([title, value]) => <label key={title}>{title}<textarea rows={4} maxLength={10000} value={value} placeholder={`Write your ${title.toLowerCase()}…`} onChange={event => { setSections(current => ({ ...current, [title]: event.target.value })); setDirty(true); }} /></label>)}</div><button className="dash-button dash-button-primary" disabled={busy || draftLoading}>{busy ? 'Working…' : 'Generate report from saved records'}</button></fieldset></form>}
    {report && <div className="workspace-spaced"><div className="workspace-actions"><button className="dash-button" onClick={() => downloadText('placepms-blackbook.md', report)}><Download size={15} />Markdown</button><button className="dash-button" onClick={() => downloadText('placepms-blackbook.html', reportHtml(reportTitle, report), 'text/html;charset=utf-8')}><Download size={15} />Printable HTML</button><button className="dash-button" onClick={() => window.print()}><Printer size={15} />Print / Save PDF</button><button className="dash-button" disabled={busy || report.length > 20000 || !project} onClick={async () => {
      if (!supabase || !project) return; setBusy(true); setError('');
      try {
        const record = { user_id: user.id, kind: 'document', title: `Blackbook — ${reportTitle}`.slice(0, 200), notes: report, project_id: project.id, tags: ['blackbook', 'report'], updated_at: new Date().toISOString() };
        const result = documentId ? await supabase.from('workspace_library').update(record).eq('id', documentId).eq('user_id', user.id).select('id').single() : await supabase.from('workspace_library').insert(record).select('id').single();
        if (result.error) throw result.error; setDocumentId(result.data.id); setNotice('Report saved to Documents.');
      } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
    }}><Save size={15} />Save to Documents</button></div>{report.length > 20000 && <p className="workspace-muted">This report exceeds the saved-note limit; download the full report instead.</p>}<label className="dash-form workspace-spaced">Edit generated Markdown<textarea aria-label="Generated report" rows={14} disabled={busy} value={report} onChange={event => { setReport(event.target.value); setDirty(true); }} /></label><article id="blackbook-print" className="workspace-report"><h2>Report preview</h2><pre>{report}</pre></article></div>}
  </div></section>;
}
