import React from 'react';

interface AnimatedLogoProps {
  preset: 'cyber' | 'ocean' | 'vintage' | 'cosmic';
  glowColor: string;
  secondaryColor: string;
  speed: 'slow' | 'normal' | 'fast';
  scale?: number;
  isSpinning?: boolean;
  onElementClick?: (genre: string) => void;
  pagesCount?: number; // Clicker game pages
}

export const AnimatedLogo: React.FC<AnimatedLogoProps> = ({
  preset,
  glowColor,
  secondaryColor,
  speed,
  scale = 1,
  isSpinning = true,
  onElementClick,
  pagesCount = 0,
}) => {
  // Get animation speed duration based on props
  const getSpeedDuration = () => {
    if (speed === 'slow') return { orbit: '20s', pulse: '4s', float: '6s', rotate: '12s' };
    if (speed === 'fast') return { orbit: '6s', pulse: '1.5s', float: '2.5s', rotate: '4s' };
    return { orbit: '12s', pulse: '2.5s', float: '4s', rotate: '8s' }; // normal
  };

  const duration = getSpeedDuration();

  // Genre Icons definition
  const genreElements = [
    { id: 'fantasy', label: 'Fantasy & Smoki', color: '#f59e0b', icon: '🐉', angle: 0 },
    { id: 'adventure', label: 'Rycerze i Przygoda', color: '#3b82f6', icon: '🛡️', angle: 60 },
    { id: 'sci-fi', label: 'Planety i Sci-Fi', color: '#a855f7', icon: '🪐', angle: 120 },
    { id: 'crime', label: 'Detektywi i Zbrodnie', color: '#ef4444', icon: '🔍', angle: 180 },
    { id: 'military', label: 'Czołgi i Historia', color: '#10b981', icon: '🚜', angle: 240 },
    { id: 'drama', label: 'Skandale i Romans', color: '#ec4899', icon: '🎭', angle: 300 },
  ];

  return (
    <div 
      className="relative flex items-center justify-center animate-fade-in" 
      style={{ transform: `scale(${scale})`, transformOrigin: 'center', height: '450px', width: '450px' }}
    >
      {/* Glow Defs / SVGs Filters */}
      <svg className="absolute h-0 w-0">
        <defs>
          <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
      </svg>

      {/* Dynamic Particle Bubble Stream (Interactive from clicker pages) */}
      {pagesCount > 0 && Array.from({ length: Math.min(pagesCount, 25) }).map((_, idx) => {
        const randomDelay = (idx * 0.1).toFixed(1);
        const randomLeft = (40 + Math.random() * 20).toFixed(0);
        const randomSize = (4 + Math.random() * 8).toFixed(0);
        return (
          <span
            key={idx}
            className="absolute bottom-20 animate-float-bubble rounded-full pointer-events-none opacity-75"
            style={{
              left: `${randomLeft}%`,
              width: `${randomSize}px`,
              height: `${randomSize}px`,
              backgroundColor: glowColor,
              boxShadow: `0 0 10px ${glowColor}`,
              animationDelay: `${randomDelay}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
            }}
          />
        );
      })}

      {/* 1. Outer TikTok Concentric Orbit Ring */}
      <div 
        className="absolute rounded-full border border-dashed opacity-40 pointer-events-none"
        style={{
          width: '360px',
          height: '360px',
          borderColor: glowColor,
          animation: isSpinning ? `spin ${duration.orbit} linear infinite` : 'none',
          boxShadow: `inset 0 0 12px rgba(255, 255, 255, 0.05), 0 0 15px ${glowColor}20`,
        }}
      />

      {/* 2. Inner Orbit Ring with tick-marks */}
      <div 
        className="absolute rounded-full border border-dotted opacity-60 pointer-events-none"
        style={{
          width: '290px',
          height: '290px',
          borderColor: secondaryColor,
          animation: isSpinning ? `spin-reverse ${duration.rotate} linear infinite` : 'none',
        }}
      />

      {/* 3. Outer Orbiting Genre Elements */}
      {genreElements.map((elem) => {
        // Calculate coordinates for orbit (radius = 180px)
        const angleRad = (elem.angle * Math.PI) / 180;
        const x = 180 * Math.cos(angleRad);
        const y = 180 * Math.sin(angleRad);

        return (
          <button
            key={elem.id}
            onClick={() => onElementClick?.(elem.id)}
            className="absolute group z-10 flex items-center justify-center rounded-full transition-all duration-300 hover:scale-125 border border-white/10 focus:outline-none"
            style={{
              transform: `translate(${x}px, ${y}px)`,
              width: '48px',
              height: '48px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              boxShadow: `0 0 15px ${elem.color}40, inset 0 0 8px ${elem.color}30`,
              borderColor: `${elem.color}60`,
            }}
            title={elem.label}
          >
            {/* Glow Ring around element */}
            <span 
              className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 animate-ping"
              style={{ backgroundColor: `${elem.color}20` }}
            />
            <span className="text-2xl transform group-hover:rotate-12 transition-transform">
              {elem.icon}
            </span>
            
            {/* Popup Genre Name */}
            <span className="absolute -bottom-8 scale-0 group-hover:scale-100 bg-slate-900/95 text-white text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap shadow-md transition-all duration-200 border border-white/10 uppercase tracking-wider">
              {elem.label.split(' ')[0]}
            </span>
          </button>
        );
      })}

      {/* 4. Central Glowing Base & Morphing Wave Background */}
      <div 
        className="absolute rounded-full blur-2xl opacity-25 transition-colors duration-700"
        style={{
          width: '220px',
          height: '220px',
          background: `radial-gradient(circle, ${glowColor} 0%, ${secondaryColor} 70%, transparent 100%)`,
          animation: `pulse ${duration.pulse} ease-in-out infinite`,
        }}
      />

      {/* 5. The Main Logo Container (SVG) */}
      <div 
        className="relative z-20 flex items-center justify-center animate-float"
        style={{ 
          width: '240px', 
          height: '240px',
          animationDuration: duration.float 
        }}
      >
        <svg
          viewBox="0 0 300 300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full filter drop-shadow-lg"
        >
          {/* Glowing grid/lines background based on Presets */}
          {preset === 'cyber' && (
            <g opacity="0.2">
              <circle cx="150" cy="150" r="110" stroke={glowColor} strokeWidth="1" strokeDasharray="5 5" />
              <line x1="150" y1="30" x2="150" y2="270" stroke={glowColor} strokeWidth="1" strokeDasharray="5 5" />
              <line x1="30" y1="150" x2="270" y2="150" stroke={glowColor} strokeWidth="1" strokeDasharray="5 5" />
              {/* Tech nodes */}
              <circle cx="150" cy="30" r="3" fill={glowColor} />
              <circle cx="150" cy="270" r="3" fill={glowColor} />
              <circle cx="30" cy="150" r="3" fill={glowColor} />
              <circle cx="270" cy="150" r="3" fill={glowColor} />
            </g>
          )}

          {preset === 'ocean' && (
            <g opacity="0.2">
              <path d="M30,140 Q60,130 90,140 T150,140 T210,140 T270,140" stroke={glowColor} strokeWidth="1" fill="none" />
              <path d="M30,160 Q60,150 90,160 T150,160 T210,160 T270,160" stroke={secondaryColor} strokeWidth="1" fill="none" />
              <circle cx="150" cy="150" r="100" stroke={glowColor} strokeWidth="1" strokeDasharray="15 5" />
            </g>
          )}

          {preset === 'vintage' && (
            <g opacity="0.25">
              {/* Frame corners */}
              <rect x="40" y="40" width="220" height="220" stroke={glowColor} strokeWidth="1.5" rx="8" />
              <circle cx="150" cy="150" r="90" stroke={secondaryColor} strokeWidth="1.5" />
            </g>
          )}

          {preset === 'cosmic' && (
            <g opacity="0.3">
              {/* Outer Orbit lines */}
              <circle cx="150" cy="150" r="105" stroke={glowColor} strokeWidth="0.75" />
              <circle cx="150" cy="150" r="80" stroke={secondaryColor} strokeWidth="0.75" />
              {/* Star Constellation points */}
              <circle cx="80" cy="80" r="2" fill={glowColor} />
              <line x1="80" y1="80" x2="120" y2="60" stroke={glowColor} strokeWidth="0.5" />
              <circle cx="120" cy="60" r="1.5" fill={glowColor} />
              <circle cx="220" cy="90" r="2" fill={secondaryColor} />
              <line x1="220" y1="90" x2="200" y2="130" stroke={secondaryColor} strokeWidth="0.5" />
              <circle cx="200" cy="130" r="1.5" fill={secondaryColor} />
            </g>
          )}

          {/* The Open Book Visual */}
          <g id="book-shape">
            {/* Book Spine / Center Line */}
            <path
              d="M150,180 L150,245"
              stroke={secondaryColor}
              strokeWidth="6"
              strokeLinecap="round"
              filter="url(#soft-glow)"
            />

            {/* Left Page Cover */}
            <path
              d="M150,245 C110,240 70,255 40,235 L40,170 C70,190 110,175 150,180 Z"
              fill="url(#leftPageGrad)"
              stroke={glowColor}
              strokeWidth="3"
              strokeLinejoin="round"
              filter="url(#soft-glow)"
            />

            {/* Right Page Cover */}
            <path
              d="M150,245 C190,240 230,255 260,235 L260,170 C230,190 190,175 150,180 Z"
              fill="url(#rightPageGrad)"
              stroke={glowColor}
              strokeWidth="3"
              strokeLinejoin="round"
              filter="url(#soft-glow)"
            />

            {/* Book Pages Lines - Left (glowing paths) */}
            <path
              d="M145,190 C110,185 75,200 48,185 M145,205 C110,200 75,215 48,200 M145,220 C110,215 75,230 48,215"
              stroke={glowColor}
              strokeWidth="1.5"
              opacity="0.8"
              strokeDasharray="250"
              className="animate-dash"
            />

            {/* Book Pages Lines - Right (glowing paths) */}
            <path
              d="M155,190 C190,185 225,200 252,185 M155,205 C190,200 225,215 252,200 M155,220 C190,215 225,230 252,215"
              stroke={glowColor}
              strokeWidth="1.5"
              opacity="0.8"
              strokeDasharray="250"
              className="animate-dash"
            />
          </g>

          {/* The Leaping Fish Visual (Fish S2 Pro concept) */}
          <g id="fish-shape">
            {/* Fish Main Body Curve */}
            <path
              d="M95,130 C100,90 125,60 150,50 C175,60 200,90 205,130 C190,145 170,155 150,155 C130,155 110,145 95,130 Z"
              fill="url(#fishBodyGrad)"
              stroke={secondaryColor}
              strokeWidth="3.5"
              filter="url(#neon-glow)"
            />

            {/* Fish Head/Eye Detail */}
            <circle cx="150" cy="75" r="5" fill={glowColor} filter="url(#soft-glow)" />
            <path d="M140,88 C145,91 155,91 160,88" stroke={glowColor} strokeWidth="2" strokeLinecap="round" />

            {/* Cyber / Tech Scales Details (S2 Pro vibe) */}
            <path
              d="M130,115 Q150,105 170,115 M125,128 Q150,118 175,128 M135,140 Q150,130 165,140"
              stroke={glowColor}
              strokeWidth="2"
              opacity="0.7"
              strokeLinecap="round"
            />

            {/* Dynamic Fish Tail Fin */}
            <path
              d="M150,155 C140,185 120,205 105,215 C115,195 150,180 150,170 C150,180 185,195 195,215 C180,205 160,185 150,155 Z"
              fill="url(#fishTailGrad)"
              stroke={glowColor}
              strokeWidth="2.5"
              filter="url(#soft-glow)"
              className="animate-tail-wave"
            />

            {/* Glowing Fish Side Fins */}
            {/* Left Fin */}
            <path
              d="M95,120 C80,115 65,120 55,130 C70,135 85,135 95,125 Z"
              fill={secondaryColor}
              opacity="0.9"
              stroke={glowColor}
              strokeWidth="1.5"
              filter="url(#soft-glow)"
            />
            {/* Right Fin */}
            <path
              d="M205,120 C220,115 235,120 245,130 C230,135 215,135 205,125 Z"
              fill={secondaryColor}
              opacity="0.9"
              stroke={glowColor}
              strokeWidth="1.5"
              filter="url(#soft-glow)"
            />
          </g>

          {/* Star and bubble emissions from the book */}
          <g id="magic-sparkles" opacity="0.8">
            {/* Star Left */}
            <path
              d="M75,145 L78,150 L83,151 L79,155 L80,160 L75,157 L70,160 L71,155 L67,151 L72,150 Z"
              fill={glowColor}
              filter="url(#soft-glow)"
              className="animate-pulse"
            />
            {/* Star Right */}
            <path
              d="M225,145 L228,150 L233,151 L229,155 L230,160 L225,157 L220,160 L221,155 L217,151 L222,150 Z"
              fill={glowColor}
              filter="url(#soft-glow)"
              className="animate-pulse"
            />
            {/* Top Bubble */}
            <circle cx="150" cy="35" r="4" fill={glowColor} opacity="0.8" filter="url(#soft-glow)" className="animate-bounce" />
            <circle cx="130" cy="45" r="2" fill={secondaryColor} opacity="0.6" />
            <circle cx="170" cy="42" r="3" fill={secondaryColor} opacity="0.7" />
          </g>

          {/* Linear Gradients definitions */}
          <defs>
            {/* Fish Body Gradient */}
            <linearGradient id="fishBodyGrad" x1="150" y1="50" x2="150" y2="155" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={glowColor} />
              <stop offset="50%" stopColor={secondaryColor} />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            {/* Fish Tail Gradient */}
            <linearGradient id="fishTailGrad" x1="150" y1="155" x2="150" y2="215" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={secondaryColor} />
              <stop offset="100%" stopColor={glowColor} />
            </linearGradient>

            {/* Left Book Page Gradient */}
            <linearGradient id="leftPageGrad" x1="40" y1="205" x2="150" y2="205" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="70%" stopColor="#334155" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            {/* Right Book Page Gradient */}
            <linearGradient id="rightPageGrad" x1="260" y1="205" x2="150" y2="205" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="70%" stopColor="#334155" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      
      {/* Audio Waveform Glow around bottom */}
      <div className="absolute bottom-6 flex items-center gap-1 pointer-events-none">
        {Array.from({ length: 11 }).map((_, i) => (
          <div 
            key={i} 
            className="w-[3px] rounded-full opacity-60 transition-all duration-300"
            style={{
              backgroundColor: glowColor,
              boxShadow: `0 0 8px ${glowColor}`,
              height: `${4 + Math.sin(i + Date.now() * 0.01) * 12}px`,
              animation: isSpinning ? `audio-bar 1.2s ease-in-out infinite alternate` : 'none',
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
};
