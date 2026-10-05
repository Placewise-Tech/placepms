import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { trapDialogTab } from '../../lib/dialog-focus';

export interface WorkspaceSection { id: string; label: string; shortLabel?: string; count?: number; content: ReactNode; disabled?: boolean }

export function WorkspaceSections({ sections, value, onChange, label }: { sections: WorkspaceSection[]; value: string; onChange: (value: string) => void; label: string }) {
  const id = useId();
  const active = sections.find(section => section.id === value) || sections[0];
  return <div className="studio-sections">
    <div className="studio-tabs" role="tablist" aria-label={label} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const available = sections.filter(section => !section.disabled);
      const current = available.findIndex(section => section.id === active.id);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length;
      event.preventDefault(); onChange(available[index].id);
      document.getElementById(`${id}-tab-${encodeURIComponent(available[index].id)}`)?.focus();
    }}>{sections.map(section => <button key={section.id} id={`${id}-tab-${encodeURIComponent(section.id)}`} type="button" role="tab" aria-label={section.label} aria-selected={section.id === active.id} aria-controls={`${id}-panel`} tabIndex={section.id === active.id ? 0 : -1} disabled={section.disabled} onClick={() => onChange(section.id)}>{section.shortLabel ? <><span className="studio-tab-label studio-tab-long">{section.label}</span><span className="studio-tab-label studio-tab-short" aria-hidden="true">{section.shortLabel}</span></> : section.label}{section.count !== undefined && <span aria-hidden="true">{section.count}</span>}</button>)}</div>
    <div key={active.id} id={`${id}-panel`} className="studio-tab-panel" role="tabpanel" aria-labelledby={`${id}-tab-${encodeURIComponent(active.id)}`} tabIndex={0}>{active.content}</div>
  </div>;
}

export function RecordPager({ page, total, size, onChange, noun = 'records' }: { page: number; total: number; size: number; onChange: (page: number) => void; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  if (total <= size) return <div className="studio-record-count">{total} {noun}</div>;
  return <nav className="studio-pagination" aria-label={`${noun} pages`}><span>{(current - 1) * size + 1}–{Math.min(current * size, total)} of {total} {noun}</span><div><button className="dash-button" aria-label={`Previous ${noun} page`} disabled={current === 1} onClick={() => onChange(current - 1)}><ChevronLeft size={14} /></button><span>{current} / {pages}</span><button className="dash-button" aria-label={`Next ${noun} page`} disabled={current === pages} onClick={() => onChange(current + 1)}><ChevronRight size={14} /></button></div></nav>;
}

export function PagedCards<T extends { id: string }>({ items, render, size = 6, noun = 'records' }: { items: T[]; render: (item: T) => ReactNode; size?: number; noun?: string }) {
  const [page, setPage] = useState(1);
  const current = Math.min(page, Math.max(1, Math.ceil(items.length / size)));
  return <><div className="studio-card-grid">{items.slice((current - 1) * size, current * size).map(item => <Fragment key={item.id}>{render(item)}</Fragment>)}</div><RecordPager page={current} total={items.length} size={size} onChange={setPage} noun={noun} /></>;
}

export function DetailDialog({ title, subtitle, children, onClose, busy = false, wide = false, returnFocus }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean; returnFocus?: HTMLElement | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { const element = ref.current; const previous = returnFocus || document.activeElement; element?.showModal(); return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected && !previous.hasAttribute('disabled')) previous.focus({ preventScroll: true }); }; }, [returnFocus]);
  return <dialog ref={ref} className={`studio-dialog ${wide ? 'studio-dialog-wide' : ''}`} aria-labelledby={id} onKeyDown={trapDialogTab} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}><header className="studio-dialog-header"><div><span className="dash-eyebrow">PLACEPMS / WORKSPACE</span><h2 id={id}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="dash-icon-button" aria-label="Close inspector" disabled={busy} onClick={onClose}><X size={20} /></button></header><div className="studio-dialog-body">{children}</div></dialog>;
}

export function CodeViewer({ text, diff = false }: { text: string; diff?: boolean }) {
  return <pre className="studio-code"><code>{text.split('\n').map((line, index) => <span className={`studio-code-line ${diff && line.startsWith('+') && !line.startsWith('+++') ? 'is-added' : diff && line.startsWith('-') && !line.startsWith('---') ? 'is-removed' : diff && line.startsWith('@@') ? 'is-hunk' : ''}`} key={index}><span className="studio-line-number" aria-hidden="true">{index + 1}</span><span>{line || ' '}</span></span>)}</code></pre>;
}
