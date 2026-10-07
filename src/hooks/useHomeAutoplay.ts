import { useEffect, useRef } from 'react';

/** Run homepage demos only while they are visible and the browser tab is active. */
export function useHomeAutoplay<T extends HTMLElement>({ enabled, delay, onAdvance, pauseOnInteraction = true }: {
  enabled: boolean;
  delay: number;
  onAdvance: () => void;
  pauseOnInteraction?: boolean;
}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    let visible = false;
    let hovered = pauseOnInteraction && window.matchMedia('(hover: hover)').matches && element.matches(':hover');
    let focused = pauseOnInteraction && element.contains(document.activeElement);
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
      if (!visible || hovered || focused || document.hidden || document.querySelector('dialog[open]')) return;
      timer = setTimeout(() => { timer = undefined; onAdvance(); schedule(); }, delay);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && entry.intersectionRatio >= 0.2; schedule(); }, { threshold: 0.2 });
    const enter = (event: PointerEvent) => { if (pauseOnInteraction && event.pointerType === 'mouse') { hovered = true; schedule(); } };
    const leave = () => { if (pauseOnInteraction) { hovered = false; schedule(); } };
    const focus = () => { if (pauseOnInteraction) { focused = true; schedule(); } };
    const blur = (event: FocusEvent) => { if (pauseOnInteraction) { focused = event.relatedTarget instanceof Node && element.contains(event.relatedTarget); schedule(); } };
    const dialogToggle = (event: Event) => { if (event.target instanceof HTMLDialogElement) schedule(); };

    observer.observe(element);
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('focusin', focus);
    element.addEventListener('focusout', blur);
    document.addEventListener('visibilitychange', schedule);
    document.addEventListener('toggle', dialogToggle, true);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('focusin', focus);
      element.removeEventListener('focusout', blur);
      document.removeEventListener('visibilitychange', schedule);
      document.removeEventListener('toggle', dialogToggle, true);
    };
  }, [enabled, delay, onAdvance, pauseOnInteraction]);

  return ref;
}
