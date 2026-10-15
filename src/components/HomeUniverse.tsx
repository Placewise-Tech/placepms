import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Activity, ArrowUpRight, Orbit, Sparkles } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';

const stars = Array.from({ length: 12 }, (_, index) => index);

interface HomeUniverseProps {
  motionPaused: boolean;
}

export default function HomeUniverse({ motionPaused }: HomeUniverseProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reduced || motionPaused || !sceneRef.current) return;
    const bounds = sceneRef.current.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    sceneRef.current.style.setProperty('--universe-tilt-x', `${(y * -8).toFixed(2)}deg`);
    sceneRef.current.style.setProperty('--universe-tilt-y', `${(x * 10).toFixed(2)}deg`);
    sceneRef.current.style.setProperty('--universe-shift-x', `${(x * 16).toFixed(1)}px`);
    sceneRef.current.style.setProperty('--universe-shift-y', `${(y * 12).toFixed(1)}px`);
  };

  const resetPointer = () => {
    if (!sceneRef.current) return;
    sceneRef.current.style.setProperty('--universe-tilt-x', '0deg');
    sceneRef.current.style.setProperty('--universe-tilt-y', '0deg');
    sceneRef.current.style.setProperty('--universe-shift-x', '0px');
    sceneRef.current.style.setProperty('--universe-shift-y', '0px');
  };

  return <div
    ref={sceneRef}
    className={`home-universe${motionPaused || reduced ? ' is-paused' : ''}`}
    onPointerMove={handlePointerMove}
    onPointerLeave={resetPointer}
    aria-hidden="true"
  >
    <div className="home-universe-stars">{stars.map(star => <i key={star} />)}</div>
    <div className="home-universe-horizon" />
    <div className="home-universe-grid" />
    <div className="home-universe-orbit home-universe-orbit-one"><span /></div>
    <div className="home-universe-orbit home-universe-orbit-two"><span /></div>
    <div className="home-universe-orbit home-universe-orbit-three"><span /></div>
    <div className="home-universe-cube home-universe-cube-one"><span /><span /><span /><span /></div>
    <div className="home-universe-cube home-universe-cube-two"><span /><span /><span /><span /></div>
    <div className="home-universe-core">
      <div className="home-universe-core-halo" />
      <div className="home-universe-core-face">
        <div className="home-universe-core-top"><span><i /> LIVE SYSTEM</span><span>01 — 04</span></div>
        <div className="home-universe-core-brand"><Orbit size={17} /><span>PLACEPMS</span></div>
        <strong>MAKE<br /><em>IT REAL.</em></strong>
        <div className="home-universe-core-line"><span /><span /><span /></div>
        <div className="home-universe-core-meta"><span>IDEA / BUILD / IMPACT</span><Activity size={13} /></div>
      </div>
    </div>
    <div className="home-universe-signal home-universe-signal-one"><Sparkles size={13} /><span>NEW POSSIBILITY</span><strong>+24%</strong></div>
    <div className="home-universe-signal home-universe-signal-two"><span className="home-live-dot" /><span>WORKSPACE ONLINE</span><ArrowUpRight size={13} /></div>
    <div className="home-universe-caption"><span>THE NEXT GENERATION<br /><strong>IS ALREADY MOVING.</strong></span><span>SCROLL TO EXPLORE <b>↓</b></span></div>
  </div>;
}
