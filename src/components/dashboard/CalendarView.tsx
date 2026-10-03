import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Milestone } from '../../lib/dashboard-data';
import { isComplete, isInactive, localDateKey } from '../../lib/dashboard-data';

export default function CalendarView({ milestones, renderTasks, action }: { milestones: Milestone[]; renderTasks: (tasks: Milestone[]) => ReactNode; action: ReactNode }) {
  const [month, setMonth] = useState(() => { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), 1); });
  const [today] = useState(() => localDateKey()); const [selected, setSelected] = useState<string | null>(null);
  const tasks = milestones.filter(task => task.due_date && !isInactive(task.status));
  const first = month.getDay(); const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthKey = localDateKey(month).slice(0, 7);
  const visible = tasks.filter(task => selected ? task.due_date === selected : task.due_date?.startsWith(monthKey)).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  return <section className="dash-panel"><div className="dash-panel-heading"><div><h2>Project calendar</h2><p>Select a day to inspect its deadlines. Export all milestone dates with Export deadlines.</p></div>{action}</div><div className="workspace-content"><div className="workspace-actions"><button className="dash-button" aria-label="Previous month" onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)); setSelected(null); }}><ChevronLeft size={16} /></button><h3>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3><button className="dash-button" aria-label="Next month" onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)); setSelected(null); }}><ChevronRight size={16} /></button><button className="dash-button" onClick={() => setSelected(null)}>All this month</button></div><div className="workspace-calendar">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <strong key={day}>{day}</strong>)}{Array.from({ length: first }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: count }, (_, index) => {
    const date = localDateKey(new Date(month.getFullYear(), month.getMonth(), index + 1)); const due = tasks.filter(task => task.due_date === date);
    return <button key={date} className={`${date === today ? 'today' : ''} ${selected === date ? 'selected' : ''}`} aria-label={`${date}, ${due.length} deadlines`} aria-pressed={selected === date} onClick={() => setSelected(date)}><span>{index + 1}</span>{due.slice(0, 2).map(task => <small className={isComplete(task.status) ? 'complete' : date < today ? 'overdue' : ''} key={task.id}>{task.name}</small>)}{due.length > 2 && <small>+{due.length - 2} more</small>}</button>;
  })}</div><h3 className="workspace-spaced">{selected || 'This month'} · {visible.length} deadlines</h3></div>{visible.length ? renderTasks(visible) : <p className="workspace-content workspace-muted">No milestones due in this selection.</p>}</section>;
}
