import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import ceoPhoto from '../assets/team-ceo.webp';
import ctoPhoto from '../assets/team-cto.webp';
import tcoPhoto from '../assets/team-tco.webp';
import developerPhoto from '../assets/team-developer.webp';
import { useReducedMotion } from '../hooks/useReducedMotion';

const team = [
  { role: 'CEO', title: 'Chief Executive Officer', photo: ceoPhoto, description: 'Sets the company’s vision, guides business strategy, and builds partnerships that help PlacePMS grow.' },
  { role: 'CTO', title: 'Chief Technology Officer', photo: ctoPhoto, description: 'Leads technology strategy, architecture, and engineering standards to keep PlacePMS reliable and ready to scale.' },
  { role: 'TCO', title: 'PlacePMS team', photo: tcoPhoto, description: 'Brings people, priorities, and delivery together, helping the team stay aligned as PlacePMS grows.' },
  { role: 'Developer', title: 'Software Developer', photo: developerPhoto, description: 'Turns ideas into practical features, builds smooth user experiences, and improves the platform every day.' },
];

export default function HomeTeam({ motionPaused }: { motionPaused: boolean }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [scrollState, setScrollState] = useState({ canScroll: false, atStart: true, atEnd: false });
  const reduced = useReducedMotion();
  const stopped = paused || motionPaused || reduced;

  const updateScrollState = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const end = viewport.scrollWidth - viewport.clientWidth;
    const next = { canScroll: end > 1, atStart: viewport.scrollLeft <= 1, atEnd: viewport.scrollLeft >= end - 1 };
    setScrollState(current => current.canScroll === next.canScroll && current.atStart === next.atStart && current.atEnd === next.atEnd ? current : next);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(viewport);
    observer.observe(track);
    updateScrollState();
    return () => observer.disconnect();
  }, [updateScrollState]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !scrollState.canScroll || stopped || hovered || focused || !visible) return;

    let frame: number;
    let previous = 0;
    let position = viewport.scrollLeft;
    let direction = 1;
    const scroll = (time: number) => {
      if (previous) {
        const end = viewport.scrollWidth - viewport.clientWidth;
        position += Math.min(time - previous, 64) * 0.028 * direction;
        if (position >= end) { position = end; direction = -1; }
        if (position <= 0) { position = 0; direction = 1; }
        viewport.scrollLeft = position;
      }
      previous = time;
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [stopped, hovered, focused, visible, scrollState.canScroll]);

  const move = (direction: number) => {
    setPaused(true);
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const first = track.children[0] as HTMLElement;
    const second = track.children[1] as HTMLElement;
    viewport.scrollBy({ left: direction * (second.offsetLeft - first.offsetLeft), behavior: reduced ? 'auto' : 'smooth' });
  };

  return <section id="team" className="home-section home-team" aria-labelledby="home-team-title">
    <div className="home-container">
      <div className="home-team-heading">
        <div className="home-section-heading">
          <span className="home-eyebrow">The people behind PlacePMS</span>
          <h2 id="home-team-title">One team.<br /><span>A shared ambition.</span></h2>
        </div>
        <div className="home-team-intro">
          <p>Meet the people bringing a more connected future to academic work.</p>
          {scrollState.canScroll && <div className="home-team-controls" aria-label="Team carousel controls">
            <button aria-label="Previous team member" aria-controls="home-team-portraits" disabled={scrollState.atStart} onClick={() => move(-1)}><ChevronLeft size={18} /></button>
            <button aria-label={stopped ? 'Resume team scrolling' : 'Pause team scrolling'} aria-pressed={stopped} aria-controls="home-team-portraits" disabled={motionPaused || reduced} onClick={() => setPaused(!paused)}>{stopped ? <Play size={15} /> : <Pause size={15} />}</button>
            <button aria-label="Next team member" aria-controls="home-team-portraits" disabled={scrollState.atEnd} onClick={() => move(1)}><ChevronRight size={18} /></button>
          </div>}
        </div>
      </div>
      <div id="home-team-portraits" className="home-team-viewport" ref={viewportRef} role="region" aria-label="Team portraits. Use the arrow keys or swipe to explore." tabIndex={0}
        onScroll={updateScrollState}
        onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={() => setPaused(true)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onWheel={event => { if (event.deltaX) setPaused(true); }}>
        <div className="home-team-track" ref={trackRef}>
          {team.map((member, index) => <article className="home-team-card" key={member.role}>
            <div className="home-team-portrait">
              <img src={member.photo} alt={`PlacePMS ${member.role}`} width="640" height={member.role === 'CEO' ? 756 : member.role === 'CTO' ? 960 : member.role === 'Developer' ? 726 : 640} loading="lazy" decoding="async" />
              <span className="home-team-badge"><span className="home-live-dot" /> PlacePMS</span>
              <div className="home-team-card-caption"><div><h3>{member.role}</h3><p>{member.title}</p></div><span aria-hidden="true">0{index + 1}</span></div>
            </div>
            <p className="home-team-description">{member.description}</p>
          </article>)}
        </div>
      </div>
      <div className="home-team-footer"><span><span className="home-live-dot" /> Different roles. One vision.</span><span>Four people. One connected platform.</span></div>
    </div>
  </section>;
}
