import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { CheckCircle2, Download, FileText, Printer, Save } from 'lucide-react';
import type { DashboardData } from '../../lib/dashboard-data';
import { buildBlackbook, readBlackbookDraft, reportBlocks, reportHtml, type LibraryEntry } from '../../lib/workspace-library';
import { downloadText, errorMessage } from '../../lib/workspace-api';
import { supabase } from '../../lib/supabase';
import { WorkspaceSections } from './WorkspaceUI';

const blankSections = { 'Abstract': '', 'Problem statement & objectives': '', 'Methodology': '', 'System architecture': '', 'Testing & results': '', 'Conclusion & future scope': '' };

export default function BlackbookView({ data, user }: { data: DashboardData; user: User }) {
  const [projectId, setProjectId] = useState(data.squads[0]?.id || ''); const [sections, setSections] = useState<Record<string, string>>(blankSections);
  const [chapter, setChapter] = useState('Abstract'); const [tab, setTab] = useState('draft'); const [printing, setPrinting] = useState(false);
  const [report, setReport] = useState(''); const [reportTitle, setReportTitle] = useState('Project report'); const [draftId, setDraftId] = useState(''); const [documentId, setDocumentId] = useState(''); const [dirty, setDirty] = useState(false);
  const [draftLoading, setDraftLoading] = useState(Boolean(projectId)); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const project = data.squads.find(item => item.id === projectId);
  useEffect(() => {
    if (!projectId || !supabase) return; const client = supabase; const controller = new AbortController();
    const timer = setTimeout(() => {
      setDraftLoading(true); setDraftId(''); setDocumentId(''); setSections(blankSections); setReport(''); setDirty(false); setError(''); setNotice(''); setTab('draft'); setChapter('Abstract');
      void client.from('workspace_library').select('id,notes,updated_at').eq('user_id', user.id).eq('kind', 'document').eq('project_id', projectId).contains('tags', ['blackbook-draft']).order('updated_at', { ascending: false }).limit(1).abortSignal(controller.signal).then(result => {
        if (controller.signal.aborted) return;
        if (result.error) setError(result.error.message);
        else if (result.data?.[0]) { const row = result.data[0]; const draft = readBlackbookDraft(row.notes, Object.keys(blankSections)); if (draft) { setDraftId(row.id); setSections(draft.sections); setReport(draft.report); setReportTitle(draft.title); setNotice(`Saved draft restored · ${new Date(row.updated_at).toLocaleString()}`); } else setError('The saved draft could not be read. You can find the original entry in Documents.'); }
        setDraftLoading(false);
      }, cause => { if (!controller.signal.aborted) { setError(errorMessage(cause)); setDraftLoading(false); } });
    }, 0); return () => { clearTimeout(timer); controller.abort(); };
  }, [projectId, user.id]);
  useEffect(() => { if (!dirty) return; const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty]);
  useEffect(() => { if (!printing || tab !== 'preview') return; const frame = requestAnimationFrame(() => { window.print(); setPrinting(false); }); return () => cancelAnimationFrame(frame); }, [printing, tab]);
  const saveDraft = async () => {
    if (!supabase || !project) return; const notes = JSON.stringify({ version: 1, title: reportTitle, sections, report });
    if (notes.length > 20000) { setError('The draft exceeds the 20,000-character saved-note limit. Download your full draft or shorten the report before saving.'); return; }
    setBusy(true); setError(''); setNotice('');
    try { const record = { user_id: user.id, kind: 'document', title: `Blackbook draft — ${project.title}`.slice(0, 200), notes, project_id: project.id, tags: ['blackbook-draft'], updated_at: new Date().toISOString() }; const result = draftId ? await supabase.from('workspace_library').update(record).eq('id', draftId).eq('user_id', user.id).select('id').single() : await supabase.from('workspace_library').insert(record).select('id').single(); if (result.error) throw result.error; setDraftId(result.data.id); setDirty(false); setNotice('Draft saved to your private Documents library. You can continue it on another device.'); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  const generate = async () => {
    if (!supabase || !project) return; setBusy(true); setError(''); setNotice('');
    try { const result = await supabase.from('workspace_library').select('*').eq('user_id', user.id).eq('kind', 'research').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(200); if (result.error) throw result.error; setReport(buildBlackbook(project, data, sections, result.data as LibraryEntry[])); setReportTitle(project.title); setDirty(true); setTab('report'); setNotice(result.data.length === 200 ? 'Report generated with the latest 200 research references.' : 'Report generated from saved records. Review it, then save or export.'); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  const exports = <div className="workspace-actions"><button className="dash-button" onClick={() => downloadText('placepms-blackbook.md', report)}><Download size={14} />Markdown</button><button className="dash-button" onClick={() => downloadText('placepms-blackbook.html', reportHtml(reportTitle, report), 'text/html;charset=utf-8')}><Download size={14} />Printable HTML</button><button className="dash-button" onClick={() => { setTab('preview'); setPrinting(true); }}><Printer size={14} />Print / Save PDF</button><button className="dash-button" disabled={busy || report.length > 20000 || !project} onClick={async () => {
    if (!supabase || !project) return; setBusy(true); setError('');
    try { const record = { user_id: user.id, kind: 'document', title: `Blackbook — ${reportTitle}`.slice(0, 200), notes: report, project_id: project.id, tags: ['blackbook', 'report'], updated_at: new Date().toISOString() }; const result = documentId ? await supabase.from('workspace_library').update(record).eq('id', documentId).eq('user_id', user.id).select('id').single() : await supabase.from('workspace_library').insert(record).select('id').single(); if (result.error) throw result.error; setDocumentId(result.data.id); setNotice('Report saved to Documents.'); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }}><Save size={14} />Save to Documents</button></div>;
  return <section className="dash-panel"><div className="dash-panel-heading"><div><h2>Blackbook report builder</h2><p>A focused writing studio. Your evidence, your academic story.</p></div><FileText size={22} /></div><div className="workspace-content">{error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}{notice && <div className="dash-alert" role="status">{notice}</div>}
    {!data.squads.length ? <div className="studio-empty"><FileText size={27} /><h3>Start with a project</h3><p>Your Blackbook brings its team, milestones, and references together.</p></div> : <><div className="dash-form"><label>Project<select disabled={busy || draftLoading} value={projectId} onChange={event => { if (!dirty || window.confirm('Switch projects and discard unsaved report changes? Save your draft first to keep them.')) setProjectId(event.target.value); }}>{data.squads.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div><div className="studio-inline-metrics"><span><strong>{Object.values(sections).filter(value => value.trim()).length} / {Object.keys(sections).length}</strong>sections written</span><span>{dirty ? 'Unsaved changes' : draftId ? 'Draft saved' : 'New draft'}</span><button className="dash-button" disabled={busy || draftLoading} onClick={() => void saveDraft()}><Save size={14} />Save draft</button><button className="dash-button" disabled={busy || draftLoading} onClick={() => downloadText('placepms-blackbook-draft.json', JSON.stringify({ version: 1, title: project?.title || reportTitle, sections, report }, null, 2), 'application/json')}>Download draft</button></div>{draftLoading && <p role="status">Loading your saved project draft…</p>}
      <WorkspaceSections label="Blackbook studio sections" value={tab} onChange={setTab} sections={[
        { id: 'draft', label: 'Write chapters', content: <form className="dash-form" onSubmit={event => { event.preventDefault(); void generate(); }}><fieldset disabled={busy || draftLoading}><div className="studio-report-editor"><nav className="studio-chapters" aria-label="Report chapters">{Object.entries(sections).map(([title, value], index) => <button key={title} type="button" aria-pressed={chapter === title} onClick={() => setChapter(title)}><span>0{index + 1}</span><span>{title}</span>{value.trim() && <CheckCircle2 size={13} />}</button>)}</nav><div><label>{chapter}<textarea rows={12} maxLength={10000} value={sections[chapter]} placeholder={`Write your ${chapter.toLowerCase()}…`} onChange={event => { setSections(current => ({ ...current, [chapter]: event.target.value })); setDirty(true); }} /></label><div className="studio-editor-footer"><span>{sections[chapter].length.toLocaleString()} / 10,000 characters</span><span>Your own writing, backed by real evidence.</span></div></div></div><div className="workspace-actions workspace-spaced"><button className="dash-button dash-button-primary">{busy ? 'Working…' : 'Generate report from saved records'}</button><span className="workspace-muted">Includes your project records and saved research.</span></div></fieldset></form> },
        { id: 'report', label: 'Edit generated report', disabled: !report, content: <>{exports}<label className="dash-form workspace-spaced">Edit generated Markdown<textarea aria-label="Generated report" rows={16} disabled={busy} value={report} onChange={event => { setReport(event.target.value); setDirty(true); }} /></label><p className="studio-section-note">{report.length.toLocaleString()} characters{report.length > 20000 ? ' · Download the full report; it exceeds the saved-note limit.' : ''}</p></> },
        { id: 'preview', label: 'Presentation preview', disabled: !report, content: <>{exports}<article id="blackbook-print" className="studio-document-preview workspace-spaced">{reportBlocks(report).map((block, index) => block.kind === 'heading' ? block.level === 1 ? <h2 key={index}>{block.text}</h2> : <h3 key={index}>{block.text}</h3> : block.kind === 'list' ? <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul> : block.kind === 'table' ? <table key={index} className="studio-report-table"><thead><tr>{block.headers.map((header, column) => <th key={column}>{header}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column} data-label={block.headers[column]}>{cell}</td>)}</tr>)}</tbody></table> : block.kind === 'divider' ? <hr key={index} /> : <p key={index} className="workspace-notes">{block.text}</p>)}</article></> },
      ]} />
    </>}
  </div></section>;
}
