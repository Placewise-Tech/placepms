import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useSearchParams } from 'react-router-dom';
import { Download, ExternalLink, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-react';
import type { DashboardData } from '../../lib/dashboard-data';
import { getDocuments, safeExternalUrl } from '../../lib/dashboard-data';
import type { LibraryEntry } from '../../lib/workspace-library';
import { supabase } from '../../lib/supabase';
import { downloadText, errorMessage } from '../../lib/workspace-api';

export default function LibraryView({ kind, data, user }: { kind: LibraryEntry['kind']; data: DashboardData; user: User }) {
  const [params] = useSearchParams();
  const [entries, setEntries] = useState<LibraryEntry[]>([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [query, setQuery] = useState(''); const [project, setProject] = useState(params.get('project') || ''); const [page, setPage] = useState(0); const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<Partial<LibraryEntry> | null>(null);
  const [sort, setSort] = useState('updated_at'); const [tag, setTag] = useState(''); const [notice, setNotice] = useState('');
  const requestId = useRef(0);
  const cancelPending = useCallback(() => { requestId.current++; }, []);
  const title = kind === 'research' ? 'Research notebook' : kind === 'resource' ? 'Academic resource library' : 'Project documents';
  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); setError('Sign in again to load your library.'); return; }
    const current = ++requestId.current;
    setLoading(true); setError('');
    try {
      let request = supabase.from('workspace_library').select('*', { count: 'exact' }).eq('user_id', user.id).eq('kind', kind).order(sort, { ascending: sort === 'title' }).order('id').range(page * 30, page * 30 + 29);
      if (query.trim()) {
        const pattern = `"%${query.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`;
        request = request.or(`title.ilike.${pattern},notes.ilike.${pattern},url.ilike.${pattern}`);
      }
      if (project) request = request.eq('project_id', project);
      if (tag.trim()) request = request.contains('tags', [tag.trim()]);
      const result = await request;
      if (current !== requestId.current) return;
      if (result.error) { setEntries([]); setTotal(0); setError(['PGRST205', '42P01'].includes(result.error.code) ? 'Apply the workspace integrations migration in Supabase to enable your library.' : result.error.message); }
      else {
        setEntries(result.data || []); setTotal(result.count || 0);
        if (page > 0 && !result.data?.length && (result.count || 0) <= page * 30) setPage(Math.max(0, Math.ceil((result.count || 0) / 30) - 1));
      }
    } catch (cause) { if (current === requestId.current) { setEntries([]); setError(errorMessage(cause)); } }
    finally { if (current === requestId.current) setLoading(false); }
  }, [kind, user.id, page, query, project, sort, tag]);
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => { clearTimeout(timer); cancelPending(); }; }, [load, cancelPending]);
  const documents = getDocuments(data.milestones.filter(task => !project || task.squad_id === project)).filter(item => `${item.name} ${item.milestone}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="workspace-stack"><section className="dash-panel"><div className="dash-panel-heading"><div><h2>{title}</h2><p>Save project-linked references, links, notes, and tags. Your library is private to your account.</p></div><button className="dash-button dash-button-primary" onClick={() => setEditing({ kind, title: '', notes: '', tags: [] })}><Plus size={15} />Add {kind}</button></div><div className="workspace-content">
    {error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}
    {notice && <div className="dash-alert" role="status">{notice}</div>}
    <div className="dash-toolbar workspace-toolbar"><label className="dash-search"><Search size={15} /><input aria-label="Search library" value={query} placeholder="Search titles, notes and URLs…" onChange={event => { setQuery(event.target.value); setPage(0); }} /></label><select className="workspace-input" aria-label="Library project filter" value={project} onChange={event => { setProject(event.target.value); setPage(0); }}><option value="">All projects</option>{data.squads.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><input className="workspace-input workspace-tag-filter" aria-label="Library tag filter" placeholder="Filter by exact tag" value={tag} onChange={event => { setTag(event.target.value); setPage(0); }} /><select className="workspace-input" aria-label="Sort library" value={sort} onChange={event => { setSort(event.target.value); setPage(0); }}><option value="updated_at">Recently updated</option><option value="created_at">Recently added</option><option value="title">Title A–Z</option></select></div>
    <div className="workspace-actions workspace-spaced"><button className="dash-button" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={14} />Refresh library</button><button className="dash-button" disabled={loading || !entries.length} onClick={() => downloadText(`placepms-${kind}-library.json`, JSON.stringify(entries.map(({ user_id: _owner, ...entry }) => entry), null, 2), 'application/json')}><Download size={14} />Export this page</button>{(query || project || tag) && <button className="dash-text-link" onClick={() => { setQuery(''); setProject(''); setTag(''); setPage(0); }}>Clear filters</button>}</div>
    {kind === 'research' && <div className="workspace-callout"><div><strong>Discover literature</strong><p>Search scholarly sources, then save relevant references and your own notes.</p></div><div className="workspace-actions"><a className="dash-button" href={`https://scholar.google.com/scholar?q=${encodeURIComponent(query || data.squads.find(item => item.id === project)?.title || '')}`} target="_blank" rel="noreferrer">Google Scholar <ExternalLink size={13} /></a><a className="dash-button" href={`https://arxiv.org/search/?query=${encodeURIComponent(query || '')}&searchtype=all`} target="_blank" rel="noreferrer">arXiv <ExternalLink size={13} /></a></div></div>}
    {kind === 'resource' && <div className="workspace-linked"><strong>Developer references</strong>{[['MDN Web Docs', 'https://developer.mozilla.org/'], ['GitHub Docs', 'https://docs.github.com/'], ['Figma Developers', 'https://developers.figma.com/'], ['Miro Developers', 'https://developers.miro.com/']].map(([name, url]) => <button className="dash-button" key={name} onClick={() => setEditing({ title: name, url, notes: '', tags: ['documentation'] })}>Save {name}</button>)}</div>}
    {editing && <form key={editing.id || editing.title || 'new'} className="dash-form workspace-editor" onSubmit={async event => {
      event.preventDefault(); if (!supabase) return;
      const form = new FormData(event.currentTarget); const value = (name: string) => String(form.get(name) || '').trim();
      const url = value('url'); if (url && !safeExternalUrl(url)) { setError('Use a valid HTTP or HTTPS URL.'); return; }
      const selectedProject = value('project'); if (selectedProject && !data.squads.some(item => item.id === selectedProject)) { setError('Choose one of your projects.'); return; }
      if (!value('title')) { setError('Enter a title for this entry.'); return; }
      setBusy(true); setError(''); setNotice('');
      try {
        const record = { user_id: user.id, kind, title: value('title'), url: url || null, notes: value('notes'), tags: [...new Set(value('tags').split(',').map(tag => tag.trim()).filter(Boolean))].slice(0, 12), project_id: selectedProject || null, updated_at: new Date().toISOString() };
        const result = editing.id ? await supabase.from('workspace_library').update(record).eq('id', editing.id).eq('user_id', user.id).select('id').single() : await supabase.from('workspace_library').insert(record).select('id').single();
        if (result.error) throw result.error; setEditing(null); setNotice(editing.id ? 'Library entry updated.' : 'Library entry saved.'); await load();
      } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
    }}><div className="workspace-actions"><h3>{editing.id ? 'Edit entry' : 'New entry'}</h3><button type="button" className="dash-icon-button" aria-label="Close library editor" onClick={() => setEditing(null)} disabled={busy}><X size={18} /></button></div><fieldset disabled={busy}><label>Title<input name="title" required maxLength={200} defaultValue={editing.title} key={`${editing.id || 'new'}-${editing.title}`} /></label><label>URL<input name="url" type="url" defaultValue={editing.url || ''} /></label><label>Project<select name="project" defaultValue={editing.project_id || project}><option value="">General / not linked</option>{data.squads.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Tags (comma-separated)<input name="tags" maxLength={400} defaultValue={editing.tags?.join(', ')} /></label><label>Notes / document content<textarea name="notes" rows={6} maxLength={20000} defaultValue={editing.notes} /></label><button className="dash-button dash-button-primary" disabled={busy}><Save size={15} />{busy ? 'Saving…' : 'Save entry'}</button></fieldset></form>}
    {loading ? <p role="status">Loading your library…</p> : entries.length ? <div className="workspace-list">{entries.map(entry => <article className="workspace-library-card" key={entry.id}><div className="workspace-actions"><h3>{entry.title}</h3>{safeExternalUrl(entry.url) && <a className="dash-text-link" href={safeExternalUrl(entry.url)!} target="_blank" rel="noreferrer">Open <ExternalLink size={13} /></a>}</div><div className="dash-tags">{entry.tags.map(tag => <span key={tag}>{tag}</span>)}{entry.project_id && <span>{data.squads.find(item => item.id === entry.project_id)?.title || 'Linked project'}</span>}</div>{entry.notes && <details><summary>Notes / content</summary><pre className="workspace-notes">{entry.notes}</pre></details>}<small>Updated {new Date(entry.updated_at).toLocaleString()}</small><div className="workspace-actions"><button className="dash-button" disabled={busy} onClick={() => setEditing(entry)}>Edit</button><button className="dash-button" onClick={() => downloadText(`${entry.title.replace(/[^a-z0-9_-]/gi, '-')}.md`, `# ${entry.title}\n\n${entry.url || ''}\n\n${entry.notes}`)}><Download size={14} />Export</button><button className="dash-button workspace-danger" disabled={busy} onClick={async () => { if (!supabase || !window.confirm(`Delete “${entry.title}” from your library?`)) return; setBusy(true); try { const result = await supabase.from('workspace_library').delete().eq('id', entry.id).eq('user_id', user.id); if (result.error) throw result.error; await load(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } }}><Trash2 size={14} />Delete</button></div></article>)}</div> : !error && <p className="workspace-muted">No saved {kind} entries match your filters. Add your first entry above.</p>}
    <div className="workspace-actions workspace-spaced"><button className="dash-button" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>Previous</button><span>{total} entries · Page {page + 1}</span><button className="dash-button" disabled={(page + 1) * 30 >= total || loading} onClick={() => setPage(page + 1)}>Next</button></div>
    </div></section>{kind === 'document' && <section className="dash-panel"><div className="dash-panel-heading"><h2>Milestone submission links</h2></div><div className="workspace-content workspace-list">{documents.length ? documents.map(document => <article className="workspace-list-item" key={document.id}><div><h3>{document.name}</h3><p>{document.milestone}</p></div><a className="dash-text-link" href={document.url} target="_blank" rel="noreferrer">Open <ExternalLink size={14} /></a></article>) : <p className="workspace-muted">Attach submission links from a project's milestone editor.</p>}</div></section>}</div>;
}
