import { useEffect } from 'react';
import Lenis from 'lenis';

export default function Scroll3DController() {
  useEffect(() => {
    // 1. Initialize Lenis Smooth Inertia Momentum Scroll
    // Tuned for zero-latency, high-refresh-rate supersmooth response
    const lenis = new Lenis({
      duration: 0.9,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5,
      infinite: false,
    });

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    // 2. Hardware-accelerated 3D parallax on individual floaters (mascots, icons)
    const floaters = document.querySelectorAll<HTMLElement>('.mascot-3d-float');
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scroll = window.scrollY;
          floaters.forEach((el, idx) => {
            const factor = (idx % 2 === 0 ? 1 : -1) * 0.05;
            el.style.transform = `translate3d(0, ${scroll * factor}px, 0)`;
          });
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScroll);
      lenis.destroy();
    };
  }, []);

  return null;
}
