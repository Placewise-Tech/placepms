import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { DashboardData, Milestone } from '../../lib/dashboard-data';
import { calendarExport, isComplete, isInactive, localDateKey } from '../../lib/dashboard-data';
import { downloadText } from '../../lib/workspace-api';
import { RecordPager } from './WorkspaceUI';

export default function CalendarView({ data, renderTasks, action }: { data: DashboardData; renderTasks: (tasks: Milestone[]) => ReactNode; action: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('date');
  const validDate = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && !Number.isNaN(Date.parse(requested)) && new Date(requested).toISOString().slice(0, 10) === requested ? requested : null;
  const [month, setMonth] = useState(() => { const date = validDate ? new Date(`${validDate}T00:00:00`) : new Date(); return new Date(date.getFullYear(), date.getMonth(), 1); });
  const [selected, setSelected] = useState<string | null>(validDate);
  const [project, setProject] = useState('');
  const [status, setStatus] = useState('all');
  const [layout, setLayout] = useState('month');
  const [page, setPage] = useState(1);
  const today = localDateKey();
  const tasks = data.milestones.filter(task => task.due_date && !isInactive(task.status) && (!project || task.squad_id === project) && (status === 'all' || (status === 'complete' ? isComplete(task.status) : !isComplete(task.status))));
  const first = month.getDay();
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthKey = localDateKey(month).slice(0, 7);
  const visible = tasks.filter(task => selected ? task.due_date === selected : task.due_date?.startsWith(monthKey)).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const selectDay = (value: string | null) => { setSelected(value); setPage(1); const next = new URLSearchParams(params); if (value) next.set('date', value); else next.delete('date'); setParams(next, { replace: true }); };
  const changeMonth = (offset: number) => { setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1)); selectDay(null); };
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / 5)));
  const agenda = <section className="studio-calendar-agenda"><h3>{selected || 'This month'} · {visible.length} deadlines</h3>{visible.length ? renderTasks(visible.slice((currentPage - 1) * 5, currentPage * 5)) : <div className="studio-empty"><h3>A little room to plan.</h3><p>No milestones due in this selection. Try another date or filter.</p></div>}<RecordPager page={currentPage} total={visible.length} size={5} onChange={setPage} noun="deadlines" /></section>;
  return <section className="dash-panel"><div className="dash-panel-heading"><div><h2>Project calendar</h2><p>Your delivery timeline. A clear plan for what’s next.</p></div>{action}</div><div className="workspace-content">
    <div className="workspace-actions workspace-calendar-controls"><select className="workspace-input" aria-label="Calendar project filter" value={project} onChange={event => { setProject(event.target.value); setPage(1); }}><option value="">All projects</option>{data.squads.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><select className="workspace-input" aria-label="Calendar status filter" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">All deadlines</option><option value="open">Open deliveries</option><option value="complete">Completed</option></select><button className="dash-button" aria-pressed={layout === 'month'} onClick={() => setLayout('month')}>Month view</button><button className="dash-button" aria-pressed={layout === 'agenda'} onClick={() => setLayout('agenda')}>Agenda view</button><button className="dash-button" disabled={!visible.length} onClick={() => downloadText('placepms-calendar-selection.ics', calendarExport(visible), 'text/calendar;charset=utf-8')}><Download size={14} />Export selection</button></div>
    <div className="workspace-actions workspace-spaced"><button className="dash-button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button><h3 aria-live="polite">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3><button className="dash-button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={16} /></button><button className="dash-button" onClick={() => { const date = new Date(); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); selectDay(today); }}>Today</button><button className="dash-button" onClick={() => selectDay(null)}>All this month</button></div>
    {layout === 'month' ? <div className="studio-calendar-layout"><div><div className="workspace-calendar">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <strong key={day}>{day}</strong>)}{Array.from({ length: first }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: count }, (_, index) => {
      const date = localDateKey(new Date(month.getFullYear(), month.getMonth(), index + 1)); const due = tasks.filter(task => task.due_date === date);
      return <button key={date} className={`${date === today ? 'today' : ''} ${selected === date ? 'selected' : ''}`} aria-label={`${date}, ${due.length} deadlines`} aria-current={date === today ? 'date' : undefined} aria-pressed={selected === date} onClick={() => selectDay(date)}><span>{index + 1}</span>{due.slice(0, 2).map(task => <small className={isComplete(task.status) ? 'complete' : date < today ? 'overdue' : ''} key={task.id}>{task.name}</small>)}{due.length > 2 && <small>+{due.length - 2} more</small>}</button>;
    })}</div><div className="workspace-actions workspace-spaced workspace-calendar-legend"><span><i />Planned</span><span className="dash-overdue"><i />Overdue</span><span className="workspace-added"><i />Completed</span></div></div>{agenda}</div> : <div className="workspace-spaced">{agenda}</div>}
  </div></section>;
}
