import { useEffect } from 'react';
import Lenis from 'lenis';

export default function Scroll3DController() {
  useEffect(() => {
    // 1. Initialize Lenis Smooth Inertia Momentum Scroll
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 1.5,
      infinite: false,
    });

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    // 2. Interactive 3D Cursor Tilt for elements with .card-3d-hover
    const handleCardTilt = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.card-3d-hover') as HTMLElement | null;
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -8;
      const rotateY = ((x - centerX) / centerX) * 8;

      target.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px) scale3d(1.02, 1.02, 1.02)`;
    };

    const handleCardLeave = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.card-3d-hover') as HTMLElement | null;
      if (!target) return;
      target.style.transform = '';
    };

    document.addEventListener('mousemove', handleCardTilt, { passive: true });
    document.addEventListener('mouseout', handleCardLeave, { passive: true });

    // 3. 3D Scroll Perspective on sections
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            el.style.transform = 'perspective(1200px) rotateX(0deg) translateZ(0px) scale(1)';
            el.style.opacity = '1';
          } else {
            if (entry.boundingClientRect.top > 0) {
              // Below viewport
              el.style.transform = 'perspective(1200px) rotateX(6deg) translateZ(-50px) scale(0.97)';
              el.style.opacity = '0.7';
            } else {
              // Above viewport
              el.style.transform = 'perspective(1200px) rotateX(-5deg) translateZ(-40px) scale(0.98)';
            }
          }
        });
      },
      {
        threshold: [0.1, 0.5, 0.9],
        rootMargin: '-50px 0px -50px 0px'
      }
    );

    const sections = document.querySelectorAll('main section');
    sections.forEach((sec) => {
      (sec as HTMLElement).style.transition = 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease';
      (sec as HTMLElement).style.transformStyle = 'preserve-3d';
      (sec as HTMLElement).style.willChange = 'transform, opacity';
      observer.observe(sec);
    });

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      document.removeEventListener('mousemove', handleCardTilt);
      document.removeEventListener('mouseout', handleCardLeave);
      observer.disconnect();
    };
  }, []);

  return null;
}
