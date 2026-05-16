import React, { useState } from 'react';
import { Copy, Check, FileCode, Terminal, BookOpen } from 'lucide-react';

interface CodeGeneratorProps {
  preset: 'cyber' | 'ocean' | 'vintage' | 'cosmic';
  glowColor: string;
  secondaryColor: string;
  speed: 'slow' | 'normal' | 'fast';
  lang: 'pl' | 'en';
}

export const CodeGenerator: React.FC<CodeGeneratorProps> = ({
  preset,
  glowColor,
  secondaryColor,
  speed,
  lang,
}) => {
  const [activeTab, setActiveTab] = useState<'react' | 'html'>('react');
  const [copied, setCopied] = useState(false);

  const getSpeedVal = () => {
    if (speed === 'slow') return { orbit: '20s', pulse: '4s', float: '6s' };
    if (speed === 'fast') return { orbit: '6s', pulse: '1.5s', float: '2.5s' };
    return { orbit: '12s', pulse: '2.5s', float: '4s' };
  };

  const spd = getSpeedVal();

  // Generate code strings dynamically based on selected settings
  const reactCode = `import React from 'react';

// Fish S2 Pro - Animated Logo Component
// Generated with Arena App Builder

export const AnimatedFishBookLogo: React.FC = () => {
  return (
    <div className="relative flex items-center justify-center h-[450px] w-[450px] scale-100 transform-gpu">
      {/* Glow SVG Filter */}
      <svg className="absolute h-0 w-0">
        <defs>
          <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Outer Glowing Rings */}
      <div 
        className="absolute rounded-full border border-dashed opacity-40 animate-spin"
        style={{
          width: '360px',
          height: '360px',
          borderColor: '${glowColor}',
          animationDuration: '${spd.orbit}',
          boxShadow: '0 0 15px ${glowColor}20',
        }}
      />
      <div 
        className="absolute rounded-full border border-dotted opacity-60"
        style={{
          width: '290px',
          height: '290px',
          borderColor: '${secondaryColor}',
          animation: 'spin ${spd.orbit} linear infinite reverse',
        }}
      />

      {/* Ambient Radial Background */}
      <div 
        className="absolute rounded-full blur-2xl opacity-25 animate-pulse"
        style={{
          width: '220px',
          height: '220px',
          background: 'radial-gradient(circle, ${glowColor} 0%, ${secondaryColor} 70%, transparent 100%)',
          animationDuration: '${spd.pulse}',
        }}
      />

      {/* Inner SVG Logo Box */}
      <div 
        className="relative z-20 flex items-center justify-center animate-bounce"
        style={{ 
          width: '240px', 
          height: '240px',
          animation: 'float ${spd.float} ease-in-out infinite'
        }}
      >
        <svg viewBox="0 0 300 300" fill="none" className="w-full h-full filter drop-shadow-lg">
          {/* Preset Detail: ${preset} */}
          <circle cx="150" cy="150" r="110" stroke="${glowColor}" strokeWidth="1" strokeDasharray="5 5" opacity="0.15" />
          
          {/* Open Book pages */}
          <g id="book">
            <path d="M150,180 L150,245" stroke="${secondaryColor}" strokeWidth="6" strokeLinecap="round" />
            <path d="M150,245 C110,240 70,255 40,235 L40,170 C70,190 110,175 150,180 Z" fill="url(#leftGrad)" stroke="${glowColor}" strokeWidth="3" />
            <path d="M150,245 C190,240 230,255 260,235 L260,170 C230,190 190,175 150,180 Z" fill="url(#rightGrad)" stroke="${glowColor}" strokeWidth="3" />
          </g>

          {/* Fish S2 Pro Leaping */}
          <g id="fish">
            <path d="M95,130 C100,90 125,60 150,50 C175,60 200,90 205,130 C190,145 170,155 150,155 Z" fill="url(#fishGrad)" stroke="${secondaryColor}" strokeWidth="3.5" filter="url(#neon-glow)" />
            <circle cx="150" cy="75" r="5" fill="${glowColor}" />
            {/* Scales */}
            <path d="M130,115 Q150,105 170,115 M125,128 Q150,118 175,128" stroke="${glowColor}" strokeWidth="2" opacity="0.7" />
            {/* Tail */}
            <path d="M150,155 C140,185 120,205 105,215 C115,195 150,180 150,170 C150,180 185,195 195,215 Z" fill="url(#tailGrad)" stroke="${glowColor}" strokeWidth="2.5" />
          </g>

          <defs>
            <linearGradient id="fishGrad" x1="150" y1="50" x2="150" y2="155">
              <stop offset="0%" stopColor="${glowColor}" />
              <stop offset="100%" stopColor="${secondaryColor}" />
            </linearGradient>
            <linearGradient id="leftGrad" x1="40" y1="205" x2="150" y2="205">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="rightGrad" x1="260" y1="205" x2="150" y2="205">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="tailGrad" x1="150" y1="155" x2="150" y2="215">
              <stop offset="0%" stopColor="${secondaryColor}" />
              <stop offset="100%" stopColor="${glowColor}" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
};`;

  const htmlCode = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <title>Fish S2 Pro - Animowane Logo</title>
  <style>
    body {
      background-color: #020617;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      font-family: sans-serif;
    }
    
    .logo-container {
      position: relative;
      width: 450px;
      height: 450px;
    }

    /* Orbit ring rotations */
    @keyframes spin-normal {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes spin-reverse {
      from { transform: rotate(360deg); }
      to { transform: rotate(0deg); }
    }
    @keyframes float-anim {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-15px); }
    }
    @keyframes pulse-glow {
      0%, 100% { transform: scale(1); opacity: 0.2; }
      50% { transform: scale(1.1); opacity: 0.35; }
    }

    .ring-outer {
      position: absolute;
      inset: 45px;
      border-radius: 50%;
      border: 2px dashed ${glowColor};
      opacity: 0.4;
      animation: spin-normal ${spd.orbit} linear infinite;
      box-shadow: 0 0 20px ${glowColor}20;
    }

    .ring-inner {
      position: absolute;
      inset: 80px;
      border-radius: 50%;
      border: 2px dotted ${secondaryColor};
      opacity: 0.6;
      animation: spin-reverse 10s linear infinite;
    }

    .glow-bg {
      position: absolute;
      inset: 115px;
      border-radius: 50%;
      background: radial-gradient(circle, ${glowColor} 0%, ${secondaryColor} 70%, transparent 100%);
      filter: blur(25px);
      animation: pulse-glow ${spd.pulse} ease-in-out infinite;
    }

    .svg-wrapper {
      position: absolute;
      inset: 105px;
      z-index: 20;
      animation: float-anim ${spd.float} ease-in-out infinite;
    }
  </style>
</head>
<body>

  <div class="logo-container">
    <div class="ring-outer"></div>
    <div class="ring-inner"></div>
    <div class="glow-bg"></div>
    
    <div class="svg-wrapper">
      <svg viewBox="0 0 300 300" fill="none" width="240px" height="240px" xmlns="http://www.w3.org/2000/svg">
        <!-- Neon Filters -->
        <defs>
          <filter id="neon-glow">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        <!-- Book pages -->
        <path d="M150,245 C110,240 70,255 40,235 L40,170 C70,190 110,175 150,180 Z" fill="#1e293b" stroke="${glowColor}" stroke-width="3" />
        <path d="M150,245 C190,240 230,255 260,235 L260,170 C230,190 190,175 150,180 Z" fill="#1e293b" stroke="${glowColor}" stroke-width="3" />
        <path d="M150,180 L150,245" stroke="${secondaryColor}" stroke-width="6" stroke-linecap="round" />
        
        <!-- Fish jumping from book -->
        <path d="M95,130 C100,90 125,60 150,50 C175,60 200,90 205,130 C190,145 170,155 150,155 Z" fill="${glowColor}" stroke="${secondaryColor}" stroke-width="3.5" filter="url(#neon-glow)" />
        <circle cx="150" cy="75" r="5" fill="#ffffff" />
      </svg>
    </div>
  </div>

</body>
</html>`;

  const copyToClipboard = () => {
    const code = activeTab === 'react' ? reactCode : htmlCode;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-4 w-full text-slate-100 shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2.5">
          <BookOpen className="h-5 w-5 text-amber-400 animate-spin-slow" />
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              {lang === 'pl' ? 'Generator Kodu Loga' : 'Logo Code Exporter'}
            </h3>
            <p className="text-xs text-slate-400">
              {lang === 'pl' 
                ? 'Wklej bezpośrednio do swojej aplikacji audiobookowej!' 
                : 'Export directly to your audiobook application!'}
            </p>
          </div>
        </div>

        {/* Lang Tab selector */}
        <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab('react')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'react'
                ? 'bg-indigo-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="h-3.5 w-3.5" />
            <span>React + Tailwind</span>
          </button>
          <button
            onClick={() => setActiveTab('html')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'html'
                ? 'bg-indigo-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>HTML + CSS</span>
          </button>
        </div>
      </div>

      {/* Code Snippet Display */}
      <div className="relative bg-slate-950/80 rounded-2xl p-4 border border-white/5 max-h-96 overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed">
        <pre className="whitespace-pre-wrap select-all">
          {activeTab === 'react' ? reactCode : htmlCode}
        </pre>

        {/* Copy floating button */}
        <button
          onClick={copyToClipboard}
          className="absolute top-3 right-3 flex items-center gap-1.5 rounded-xl bg-slate-900 border border-white/10 hover:bg-slate-800 text-slate-300 hover:text-white px-3.5 py-2 text-xs font-bold transition-all active:scale-95"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">
                {lang === 'pl' ? 'Skopiowano!' : 'Copied!'}
              </span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>{lang === 'pl' ? 'Skopiuj kod' : 'Copy Code'}</span>
            </>
          )}
        </button>
      </div>

      {/* Integration instructions */}
      <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4 text-xs space-y-1 text-slate-300">
        <span className="font-bold text-indigo-400 block">
          💡 {lang === 'pl' ? 'Jak to zintegrować w aplikacji?' : 'How to integrate this?'}
        </span>
        <p className="text-slate-400 leading-relaxed">
          {lang === 'pl' 
            ? '1. Skopiuj powyższy kod komponentu. 2. Zastąp nim swoją aktualną sekcję "Trwa uruchamianie serwera". 3. Gdy serwer ukończy połączenie (np. socket zwróci status READY), wyrenderuj główne menu audiobooka z płynnym przejściem CSS.' 
            : '1. Copy the snippet. 2. Replace your current "Server starting" screen. 3. Once your actual server responds with a READY event, fade out the loading overlay.'}
        </p>
      </div>
    </div>
  );
};
