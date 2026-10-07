import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import ceoPhoto from '../assets/team-ceo.webp';
import ctoPhoto from '../assets/team-cto.webp';
import tcoPhoto from '../assets/team-tco.webp';
import developerPhoto from '../assets/team-developer.webp';
import { useReducedMotion } from '../hooks/useReducedMotion';

const team = [
  { role: 'CEO', title: 'Chief Executive Officer', photo: ceoPhoto },
  { role: 'CTO', title: 'Chief Technology Officer', photo: ctoPhoto },
  { role: 'TCO', title: 'PlacePMS team', photo: tcoPhoto },
  { role: 'Developer', title: 'Software Developer', photo: developerPhoto },
];

export default function HomeTeam({ motionPaused }: { motionPaused: boolean }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();
  const stopped = paused || motionPaused || reduced;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const group = groupRef.current;
    if (!viewport || !group || stopped || hovered || focused || !visible) return;

    let frame: number;
    let previous = 0;
    let position = viewport.scrollLeft;
    const scroll = (time: number) => {
      if (previous) {
        position += Math.min(time - previous, 64) * 0.028;
        if (group.offsetWidth > 0) position %= group.offsetWidth;
        viewport.scrollLeft = position;
      }
      previous = time;
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [stopped, hovered, focused, visible]);

  const move = (direction: number) => {
    setPaused(true);
    const viewport = viewportRef.current;
    const group = groupRef.current;
    if (!viewport || !group) return;
    if (direction < 0 && viewport.scrollLeft < 1 && !reduced) viewport.scrollLeft = group.offsetWidth;
    if (direction > 0 && viewport.scrollLeft >= group.offsetWidth && !reduced) viewport.scrollLeft %= group.offsetWidth;
    viewport.scrollBy({ left: direction * group.offsetWidth / team.length, behavior: reduced ? 'auto' : 'smooth' });
  };

  return <section id="team" className={`home-section home-team ${reduced ? 'home-team-reduced' : ''}`} aria-labelledby="home-team-title">
    <div className="home-container">
      <div className="home-team-heading">
        <div className="home-section-heading">
          <span className="home-eyebrow">The people behind PlacePMS</span>
          <h2 id="home-team-title">One team.<br /><span>A shared ambition.</span></h2>
        </div>
        <div className="home-team-intro">
          <p>Meet the people bringing a more connected future to academic work.</p>
          <div className="home-team-controls" aria-label="Team carousel controls">
            <button aria-label="Previous team member" aria-controls="home-team-portraits" onClick={() => move(-1)}><ChevronLeft size={18} /></button>
            <button aria-label={stopped ? 'Resume team scrolling' : 'Pause team scrolling'} aria-pressed={stopped} aria-controls="home-team-portraits" disabled={motionPaused || reduced} onClick={() => setPaused(!paused)}>{stopped ? <Play size={15} /> : <Pause size={15} />}</button>
            <button aria-label="Next team member" aria-controls="home-team-portraits" onClick={() => move(1)}><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>
      <div id="home-team-portraits" className="home-team-viewport" ref={viewportRef} role="region" aria-label="Team portraits. Use the arrow keys or swipe to explore." tabIndex={0}
        onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={() => setPaused(true)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onWheel={event => { if (event.deltaX) setPaused(true); }}>
        <div className="home-team-track">
          {[false, true].map(duplicate => <div className="home-team-group" key={String(duplicate)} ref={duplicate ? undefined : groupRef} aria-hidden={duplicate ? true : undefined}>
            {team.map((member, index) => <article className="home-team-card" key={member.role}>
              <img src={member.photo} alt={duplicate ? '' : `PlacePMS ${member.role}`} width="640" height={member.role === 'CEO' ? 756 : member.role === 'CTO' ? 960 : member.role === 'Developer' ? 726 : 640} loading="lazy" decoding="async" />
              <span className="home-team-badge"><span className="home-live-dot" /> PlacePMS</span>
              <div className="home-team-card-caption"><div><h3>{member.role}</h3><p>{member.title}</p></div><span aria-hidden="true">0{index + 1}</span></div>
            </article>)}
          </div>)}
        </div>
      </div>
      <div className="home-team-footer"><span><span className="home-live-dot" /> Different roles. One vision.</span><span>{reduced ? 'Scroll to meet the team' : 'A closer look at the people behind the platform'}</span></div>
    </div>
  </section>;
}
