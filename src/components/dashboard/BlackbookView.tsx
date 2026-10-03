import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Download, FileText, Printer, Save } from 'lucide-react';
import type { DashboardData } from '../../lib/dashboard-data';
import { buildBlackbook, reportHtml, type LibraryEntry } from '../../lib/workspace-library';
import { downloadText, errorMessage } from '../../lib/workspace-api';
import { supabase } from '../../lib/supabase';

export default function BlackbookView({ data, user }: { data: DashboardData; user: User }) {
  const [projectId, setProjectId] = useState(data.squads[0]?.id || '');
  const [sections, setSections] = useState({ 'Abstract': '', 'Problem statement & objectives': '', 'Methodology': '', 'System architecture': '', 'Testing & results': '', 'Conclusion & future scope': '' });
  const [report, setReport] = useState(''); const [reportTitle, setReportTitle] = useState('Project report'); const [reportProject, setReportProject] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  return <section className="dash-panel"><div className="dash-panel-heading"><div><h2>Blackbook report builder</h2><p>Build an editable academic report from project records, milestone evidence, team members, and saved research.</p></div><FileText size={23} /></div><div className="workspace-content">
    {error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}{notice && <div className="dash-alert" role="status">{notice}</div>}
    {!data.squads.length ? <p>Create a project first to generate its blackbook.</p> : <form className="dash-form" onSubmit={async event => {
      event.preventDefault(); if (!supabase) return; const project = data.squads.find(item => item.id === projectId); if (!project) return;
      setBusy(true); setError(''); setNotice('');
      try {
        const result = await supabase.from('workspace_library').select('*').eq('user_id', user.id).eq('kind', 'research').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(200);
        if (result.error) throw result.error;
        setReport(buildBlackbook(project, data, sections, result.data as LibraryEntry[])); setReportTitle(project.title); setReportProject(project.id);
        if (result.data.length === 200) setNotice('The report includes the latest 200 research references.');
      } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
    }}><label>Project<select value={projectId} onChange={event => setProjectId(event.target.value)}>{data.squads.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><div className="dash-form-grid">{Object.entries(sections).map(([title, value]) => <label key={title}>{title}<textarea rows={4} maxLength={10000} value={value} placeholder={`Write your ${title.toLowerCase()}…`} onChange={event => setSections({ ...sections, [title]: event.target.value })} /></label>)}</div><button className="dash-button dash-button-primary" disabled={busy}>{busy ? 'Building…' : 'Generate report from saved records'}</button></form>}
    {report && <div className="workspace-spaced"><div className="workspace-actions"><button className="dash-button" onClick={() => downloadText('placepms-blackbook.md', report)}><Download size={15} />Markdown</button><button className="dash-button" onClick={() => downloadText('placepms-blackbook.html', reportHtml(reportTitle, report), 'text/html;charset=utf-8')}><Download size={15} />Printable HTML</button><button className="dash-button" onClick={() => window.print()}><Printer size={15} />Print / Save PDF</button><button className="dash-button" disabled={busy || report.length > 20000} onClick={async () => { if (!supabase) return; setBusy(true); setError(''); try { const result = await supabase.from('workspace_library').insert({ user_id: user.id, kind: 'document', title: `Blackbook — ${reportTitle}`.slice(0, 200), notes: report, project_id: reportProject, tags: ['blackbook', 'report'] }); if (result.error) throw result.error; setNotice('Report saved to Documents.'); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } }}><Save size={15} />Save to Documents</button></div>{report.length > 20000 && <p className="workspace-muted">This report exceeds the saved-note limit; download the full report instead.</p>}<label className="dash-form workspace-spaced">Edit generated Markdown<textarea aria-label="Generated report" rows={14} value={report} onChange={event => setReport(event.target.value)} /></label><article id="blackbook-print" className="workspace-report"><h2>Report preview</h2><pre>{report}</pre></article></div>}
  </div></section>;
}
