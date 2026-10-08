import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useSearchParams } from 'react-router-dom';
import { CalendarPlus, ChevronLeft, ChevronRight, Download, Trash2 } from 'lucide-react';
import type { DashboardData, Milestone } from '../../lib/dashboard-data';
import { calendarExport, isComplete, isInactive, localDateKey } from '../../lib/dashboard-data';
import { downloadText, errorMessage } from '../../lib/workspace-api';
import { supabase } from '../../lib/supabase';
import { RecordPager } from './WorkspaceUI';

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  kind: 'PERSONAL' | 'TIMETABLE' | 'MENTORSHIP' | 'ACADEMIC';
  project_id: string | null;
}

function eventDateKey(event: CalendarEvent) {
  return localDateKey(new Date(event.starts_at));
}
function eventTime(event: CalendarEvent) {
  return new Date(event.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function escapeCalendarText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
function timetableExport(milestones: Milestone[], events: CalendarEvent[]) {
  const base = calendarExport(milestones).replace(/\r?\nEND:VCALENDAR$/, '');
  const records = events.map(event => {
    const stamp = new Date(event.starts_at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return ['BEGIN:VEVENT', `UID:${escapeCalendarText(event.id)}@placepms`, `DTSTAMP:${stamp}`, `DTSTART:${stamp}`, `SUMMARY:${escapeCalendarText(event.title)}`, `DESCRIPTION:${escapeCalendarText(event.description)}`, 'END:VEVENT'].join('\r\n');
  });
  return `${base}${records.length ? `\r\n${records.join('\r\n')}` : ''}\r\nEND:VCALENDAR`;
}

export default function CalendarView({ data, renderTasks, action, user }: { data: DashboardData; renderTasks: (tasks: Milestone[]) => ReactNode; action: ReactNode; user: User }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('date');
  const validDate = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && !Number.isNaN(Date.parse(requested)) && new Date(requested).toISOString().slice(0, 10) === requested ? requested : null;
  const [month, setMonth] = useState(() => { const date = validDate ? new Date(`${validDate}T00:00:00`) : new Date(); return new Date(date.getFullYear(), date.getMonth(), 1); });
  const [selected, setSelected] = useState<string | null>(validDate);
  const [project, setProject] = useState('');
  const [status, setStatus] = useState('all');
  const [layout, setLayout] = useState('month');
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventError, setEventError] = useState('');
  const [eventBusy, setEventBusy] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventDraft, setEventDraft] = useState({ title: '', date: localDateKey(), time: '09:00', description: '', kind: 'PERSONAL' as CalendarEvent['kind'], project_id: '' });
  const today = localDateKey();

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.from('workspace_calendar_events').select('id,title,description,starts_at,ends_at,kind,project_id').eq('user_id', user.id).order('starts_at').limit(500).then(result => {
      if (!active) return;
      if (result.error) setEventError(['PGRST205', '42P01'].includes(result.error.code || '') ? 'Apply the workspace calendar migration to enable personal timetable events.' : result.error.message);
      else setEvents((result.data || []) as CalendarEvent[]);
    }, cause => { if (active) setEventError(errorMessage(cause)); });
    return () => { active = false; };
  }, [user.id]);

  const tasks = data.milestones.filter(task => task.due_date && !isInactive(task.status) && (!project || task.squad_id === project) && (status === 'all' || (status === 'complete' ? isComplete(task.status) : !isComplete(task.status))));
  const userEvents = events.filter(event => !project || event.project_id === project);
  const first = month.getDay();
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthKey = localDateKey(month).slice(0, 7);
  const visible = tasks.filter(task => selected ? task.due_date === selected : task.due_date?.startsWith(monthKey)).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const visibleEvents = userEvents.filter(event => selected ? eventDateKey(event) === selected : eventDateKey(event).startsWith(monthKey)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const selectDay = (value: string | null) => { setSelected(value); setPage(1); const next = new URLSearchParams(params); if (value) next.set('date', value); else next.delete('date'); setParams(next, { replace: true }); };
  const changeMonth = (offset: number) => { setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1)); selectDay(null); };
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / 5)));
  const saveEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !eventDraft.title.trim()) return;
    const starts = new Date(`${eventDraft.date}T${eventDraft.time}`);
    if (Number.isNaN(starts.getTime())) { setEventError('Choose a valid event date and time.'); return; }
    setEventBusy(true); setEventError('');
    try {
      const result = await supabase.from('workspace_calendar_events').insert({ user_id: user.id, title: eventDraft.title.trim(), description: eventDraft.description.trim(), starts_at: starts.toISOString(), kind: eventDraft.kind, project_id: eventDraft.project_id || null }).select('id,title,description,starts_at,ends_at,kind,project_id').single();
      if (result.error) throw result.error;
      setEvents(current => [...current, result.data as CalendarEvent].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      setShowEventForm(false); setEventDraft({ title: '', date: localDateKey(), time: '09:00', description: '', kind: 'PERSONAL', project_id: '' });
    } catch (cause) { setEventError(errorMessage(cause)); }
    finally { setEventBusy(false); }
  };
  const removeEvent = async (item: CalendarEvent) => {
    if (!supabase || !window.confirm(`Delete “${item.title}” from your timetable?`)) return;
    setEventBusy(true); setEventError('');
    try { const result = await supabase.from('workspace_calendar_events').delete().eq('id', item.id).eq('user_id', user.id); if (result.error) throw result.error; setEvents(current => current.filter(event => event.id !== item.id)); }
    catch (cause) { setEventError(errorMessage(cause)); }
    finally { setEventBusy(false); }
  };
  const agenda = <section className="studio-calendar-agenda"><h3>{selected || 'This month'} · {visible.length + visibleEvents.length} scheduled items</h3>{visible.length ? renderTasks(visible.slice((currentPage - 1) * 5, currentPage * 5)) : null}{visibleEvents.length ? <div className="calendar-event-agenda">{visibleEvents.map(item => <article className="calendar-event-row" key={item.id}><div><strong>{item.title}</strong><small>{eventTime(item)} · {item.kind.toLowerCase()} {item.description && `· ${item.description}`}</small>{item.project_id && <small>{data.squads.find(projectItem => projectItem.id === item.project_id)?.title || 'Linked project'}</small>}</div><button className="dash-icon-button workspace-danger" aria-label={`Delete ${item.title}`} disabled={eventBusy} onClick={() => void removeEvent(item)}><Trash2 size={14} /></button></article>)}</div> : null}{!visible.length && !visibleEvents.length && <div className="studio-empty"><h3>A little room to plan.</h3><p>No milestones or events are scheduled in this selection. Try another date or add an event.</p></div>}<RecordPager page={currentPage} total={visible.length} size={5} onChange={setPage} noun="deadlines" /></section>;

  return <section className="dash-panel"><div className="dash-panel-heading"><div><h2>Project calendar & timetable</h2><p>Your delivery timeline, academic sessions, and personal reminders in one place.</p></div><div className="workspace-actions">{action}<button className="dash-button dash-button-primary" onClick={() => setShowEventForm(true)}><CalendarPlus size={14} />Add event</button></div></div><div className="workspace-content">
    {eventError && <div className="dash-alert dash-alert-error" role="alert">{eventError}</div>}
    {showEventForm && <form className="dash-form calendar-event-form" onSubmit={saveEvent}><div className="dash-form-grid"><label>Event title<input required maxLength={200} autoFocus value={eventDraft.title} onChange={event => setEventDraft(current => ({ ...current, title: event.target.value }))} placeholder="Mentorship review, class, reminder…" /></label><label>Type<select value={eventDraft.kind} onChange={event => setEventDraft(current => ({ ...current, kind: event.target.value as CalendarEvent['kind'] }))}><option value="PERSONAL">Personal reminder</option><option value="TIMETABLE">Academic timetable</option><option value="MENTORSHIP">Mentorship session</option><option value="ACADEMIC">Academic event</option></select></label></div><div className="dash-form-grid"><label>Date<input required type="date" value={eventDraft.date} onChange={event => setEventDraft(current => ({ ...current, date: event.target.value }))} /></label><label>Time<input required type="time" value={eventDraft.time} onChange={event => setEventDraft(current => ({ ...current, time: event.target.value }))} /></label></div><label>Project (optional)<select value={eventDraft.project_id} onChange={event => setEventDraft(current => ({ ...current, project_id: event.target.value }))}><option value="">General timetable event</option>{data.squads.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Notes<textarea rows={2} maxLength={4000} value={eventDraft.description} onChange={event => setEventDraft(current => ({ ...current, description: event.target.value }))} /></label><div className="dash-dialog-actions"><button type="button" className="dash-button" disabled={eventBusy} onClick={() => setShowEventForm(false)}>Cancel</button><button className="dash-button dash-button-primary" disabled={eventBusy}>{eventBusy ? 'Saving…' : 'Save event'}</button></div></form>}
    <div className="workspace-actions workspace-calendar-controls"><select className="workspace-input" aria-label="Calendar project filter" value={project} onChange={event => { setProject(event.target.value); setPage(1); }}><option value="">All projects</option>{data.squads.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><select className="workspace-input" aria-label="Calendar status filter" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">All deadlines</option><option value="open">Open deliveries</option><option value="complete">Completed</option></select><button className="dash-button" aria-pressed={layout === 'month'} onClick={() => setLayout('month')}>Month view</button><button className="dash-button" aria-pressed={layout === 'agenda'} onClick={() => setLayout('agenda')}>Agenda view</button><button className="dash-button" disabled={!visible.length && !visibleEvents.length} onClick={() => downloadText('placepms-timetable.ics', timetableExport(visible, visibleEvents), 'text/calendar;charset=utf-8')}><Download size={14} />Download timetable</button></div>
    <div className="workspace-actions workspace-spaced"><button className="dash-button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button><h3 aria-live="polite">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3><button className="dash-button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={16} /></button><button className="dash-button" onClick={() => { const date = new Date(); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); selectDay(today); }}>Today</button><button className="dash-button" onClick={() => selectDay(null)}>All this month</button></div>
    {layout === 'month' ? <div className="studio-calendar-layout"><div><div className="workspace-calendar">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <strong key={day}>{day}</strong>)}{Array.from({ length: first }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: count }, (_, index) => {
      const date = localDateKey(new Date(month.getFullYear(), month.getMonth(), index + 1)); const due = tasks.filter(task => task.due_date === date); const dayEvents = userEvents.filter(event => eventDateKey(event) === date);
      return <button key={date} className={`${date === today ? 'today' : ''} ${selected === date ? 'selected' : ''}`} aria-label={`${date}, ${due.length + dayEvents.length} scheduled items`} aria-current={date === today ? 'date' : undefined} aria-pressed={selected === date} onClick={() => selectDay(date)}><span>{index + 1}</span>{due.slice(0, 2).map(task => <small className={isComplete(task.status) ? 'complete' : date < today ? 'overdue' : ''} key={task.id}>{task.name}</small>)}{dayEvents.slice(0, 2).map(event => <small className="calendar-event" key={event.id}>{event.title}</small>)}{due.length + dayEvents.length > 2 && <small>+{due.length + dayEvents.length - 2} more</small>}</button>;
    })}</div><div className="workspace-actions workspace-spaced workspace-calendar-legend"><span><i />Planned</span><span className="dash-overdue"><i />Overdue</span><span className="workspace-added"><i />Completed</span><span className="calendar-event-legend"><i />Timetable / personal</span></div></div>{agenda}</div> : <div className="workspace-spaced">{agenda}</div>}
  </div></section>;
}
