import { useState, useEffect } from 'react';

interface PreloaderProps {
  onLoaded?: () => void;
}

const loadingStages = [
  { progress: 15, text: 'Initializing Cloud Sandboxes & Runtime Containers...' },
  { progress: 42, text: 'Mounting Multi-Portal Ecosystem & Rubrics...' },
  { progress: 70, text: 'Syncing Real-Time Code Telemetry Engine...' },
  { progress: 92, text: 'Calibrating Longitudinal Cohort Analytics...' },
  { progress: 100, text: 'Welcome to Skilli Platform' },
];

export default function Preloader({ onLoaded }: PreloaderProps) {
  const [percent, setPercent] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [isRemoved, setIsRemoved] = useState(false);

  useEffect(() => {
    const startTime = Date.now();
    const duration = 2100; // 2.1 seconds for a premium cinematic intro

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const rawProgress = Math.min(100, Math.floor((elapsed / duration) * 100));
      
      setPercent(rawProgress);

      if (rawProgress < 25) setStageIndex(0);
      else if (rawProgress < 55) setStageIndex(1);
      else if (rawProgress < 80) setStageIndex(2);
      else if (rawProgress < 98) setStageIndex(3);
      else setStageIndex(4);

      if (rawProgress >= 100) {
        clearInterval(timer);
        setTimeout(() => {
          setIsExiting(true);
          setTimeout(() => {
            setIsRemoved(true);
            onLoaded?.();
          }, 650);
        }, 300);
      }
    }, 25);

    return () => clearInterval(timer);
  }, [onLoaded]);

  if (isRemoved) return null;

  return (
    <aside
      aria-label="Platform Loading"
      className={`fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-[#070B12] text-white overflow-hidden select-none transition-all duration-700 ease-[cubic-bezier(0.76,0,0.24,1)] ${
        isExiting ? 'opacity-0 scale-105 pointer-events-none -translate-y-4' : 'opacity-100 scale-100'
      }`}
    >
      {/* Dynamic Ambient Background Glows */}
      <div 
        className="absolute w-[600px] h-[600px] rounded-full bg-[#2D7F62]/20 blur-[130px] pointer-events-none animate-pulse -translate-y-10" 
        style={{ animationDuration: '4s' }}
      />
      <div className="absolute w-[350px] h-[350px] rounded-full bg-emerald-500/10 blur-[90px] pointer-events-none translate-x-32 translate-y-32" />

      {/* Subtle Matrix/Hex Grid Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #2D7F62 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      />

      {/* Main Center Card */}
      <div className="relative z-10 flex flex-col items-center max-w-md w-full px-6 text-center">
        {/* Animated Glowing Logo Emblem */}
        <div className="relative mb-8 flex items-center justify-center">
          {/* Outer Rotating Conic Halo */}
          <div 
            className="absolute w-28 h-28 rounded-3xl bg-gradient-to-tr from-[#2D7F62] via-emerald-400/30 to-teal-500/10 blur-md animate-spin opacity-70"
            style={{ animationDuration: '8s' }}
          />

          {/* Glassmorphic Logo Shield */}
          <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-b from-white/10 to-white/[0.03] backdrop-blur-xl border border-white/20 shadow-2xl flex items-center justify-center p-4 transition-transform duration-300 hover:scale-105">
            <img 
              src="/Skilli-Logo-Vector.svg" 
              alt="Skilli Emblem" 
              className="w-full h-auto object-contain filter drop-shadow-[0_4px_12px_rgba(45,127,98,0.5)]"
            />
          </div>

          {/* Micro Status Beacon */}
          <div className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-full bg-[#0F172A] border border-[#2D7F62]/60 flex items-center gap-1.5 shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-[10px] font-mono font-bold tracking-wider text-emerald-300">CORE v2.4</span>
          </div>
        </div>

        {/* Title & Tagline */}
        <div className="space-y-1.5 mb-8">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>Skilli</span>
            <span className="text-[#2D7F62] font-mono text-sm px-2 py-0.5 rounded-md bg-[#2D7F62]/10 border border-[#2D7F62]/30">Institutional</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium tracking-wide">
            Programming Education &amp; Continuous Evaluation Platform
          </p>
        </div>

        {/* High-Tech Progress Bar System */}
        <div className="w-full space-y-3 bg-white/[0.02] border border-white/10 backdrop-blur-md rounded-2xl p-4 shadow-xl">
          {/* Status Label & Percentage Counter */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-300 font-medium truncate max-w-[260px]">
              <span className="w-2 h-2 rounded-full bg-[#2D7F62] animate-pulse shrink-0" />
              <span className="truncate">{loadingStages[stageIndex].text}</span>
            </div>
            <span className="font-mono font-bold text-emerald-400 shrink-0 text-sm">
              {percent.toString().padStart(3, '0')}%
            </span>
          </div>

          {/* Progress Bar Track */}
          <div className="relative w-full h-2 rounded-full bg-slate-800/80 overflow-hidden border border-white/5">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-teal-500 via-[#2D7F62] to-emerald-400 transition-all duration-100 ease-out relative overflow-hidden shadow-[0_0_12px_rgba(45,127,98,0.8)]"
              style={{ width: `${percent}%` }}
            >
              {/* Light Sweep Shimmer Animation */}
              <div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]"
              />
            </div>
          </div>

          {/* Micro Telemetry Indicators */}
          <div className="pt-1 flex items-center justify-between text-[10px] font-mono text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <span className="text-emerald-400">●</span> SANDBOX ENGINE
            </span>
            <span className="flex items-center gap-1">
              <span className="text-emerald-400">●</span> 4 PERSPECTIVES
            </span>
            <span className="flex items-center gap-1">
              <span className="text-emerald-400">●</span> PROCTOR AI
            </span>
          </div>
        </div>

        {/* Quick Skip button for immediate access */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => {
              setIsExiting(true);
              setTimeout(() => {
                setIsRemoved(true);
                onLoaded?.();
              }, 400);
            }}
            className="text-[11px] font-semibold text-slate-400 hover:text-white transition-colors duration-150 uppercase tracking-widest cursor-pointer px-3 py-1 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10"
          >
            Enter Platform →
          </button>
        </div>
      </div>

      {/* Bottom Institutional Assurance */}
      <div className="absolute bottom-6 flex items-center gap-3 text-[11px] text-slate-400 font-medium">
        <span>Zero-Setup In-Browser Compiler</span>
        <span>•</span>
        <span>Role-Based Single Sign-On</span>
        <span>•</span>
        <span>Enterprise Cloud Architecture</span>
      </div>
    </aside>
  );
}
