import { useState } from 'react';
import { 
  Play, 
  Sparkles, 
  Info, 
  Layers, 
  Sliders, 
  Volume2, 
  VolumeX, 
  Globe, 
  ArrowRight,
  BookOpen,
  MousePointerClick
} from 'lucide-react';
import { AnimatedLogo } from './components/AnimatedLogo';
import { LoadingScreen } from './components/LoadingScreen';
import { AudiobookDashboard } from './components/AudiobookDashboard';
import { CodeGenerator } from './components/CodeGenerator';
import { synth } from './utils/AudioSynth';

type AppState = 'landing' | 'loading' | 'dashboard';
type PresetType = 'cyber' | 'ocean' | 'vintage' | 'cosmic';

export default function App() {
  // App orchestrator states
  const [appState, setAppState] = useState<AppState>('landing');
  const [lang, setLang] = useState<'pl' | 'en'>('pl');

  // Logo / Loading Configuration states
  const [preset, setPreset] = useState<PresetType>('cyber');
  const [glowColor, setGlowColor] = useState('#06b6d4'); // Cyan
  const [secondaryColor, setSecondaryColor] = useState('#d946ef'); // Magenta
  const [loadingSpeed, setLoadingSpeed] = useState(10); // in seconds
  const [isMuted, setIsMuted] = useState(false);
  const [customScale, setCustomScale] = useState(1);

  // Preset data maps for easy selection
  const presets = {
    cyber: {
      namePL: 'Cyberpunk S2 Pro',
      nameEN: 'Cyberpunk S2 Pro',
      descPL: 'Futurystyczny styl neonowy - idealny do nowoczesnych aplikacji audiobookowych.',
      descEN: 'Futuristic neon style - ideal for modern e-audio applications.',
      glow: '#06b6d4',
      secondary: '#d946ef',
    },
    ocean: {
      namePL: 'Rybna Głębia',
      nameEN: 'Ocean Deep',
      descPL: 'Akwamaryna i szmaragd - kojarzy się z morskimi głębiami i czystym audio.',
      descEN: 'Aquamarine and emerald - associated with sea depths and clean audio.',
      glow: '#10b981',
      secondary: '#0284c7',
    },
    vintage: {
      namePL: 'Klasyczna Biblioteka',
      nameEN: 'Vintage Library',
      descPL: 'Ciepła miedź i aksamitna czerwień - styl retro i zapach starych stron.',
      descEN: 'Warm copper and velvet red - retro vibe and smell of vintage pages.',
      glow: '#f59e0b',
      secondary: '#ef4444',
    },
    cosmic: {
      namePL: 'Kosmiczna Odyseja',
      nameEN: 'Cosmic Odyssey',
      descPL: 'Gwiezdny fiolet i neonowy róż - opowieści o odległych galaktykach.',
      descEN: 'Star purple and neon pink - stories about faraway galaxies.',
      glow: '#a855f7',
      secondary: '#ec4899',
    },
  };

  // Apply preset values automatically when preset changes
  const handlePresetChange = (selected: PresetType) => {
    setPreset(selected);
    setGlowColor(presets[selected].glow);
    setSecondaryColor(presets[selected].secondary);
    
    if (!isMuted) {
      synth.playPageTurn();
    }
  };

  // Launch simulation mode
  const handleStartSimulation = () => {
    setAppState('loading');
    if (!isMuted) {
      synth.playSparkle();
    }
  };

  // Skip loading directly to the Dashboard mockup
  const handleSkipToDashboard = () => {
    setAppState('dashboard');
    if (!isMuted) {
      synth.playSparkle();
    }
  };

  // Master sound effects toggle
  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Loading Screen Active State */}
      {appState === 'loading' && (
        <LoadingScreen
          preset={preset}
          glowColor={glowColor}
          secondaryColor={secondaryColor}
          loadingSpeed={loadingSpeed}
          isMuted={isMuted}
          setIsMuted={setIsMuted}
          onComplete={() => setAppState('dashboard')}
          lang={lang}
        />
      )}

      {/* Dashboard Mockup Active State */}
      {appState === 'dashboard' && (
        <AudiobookDashboard
          glowColor={glowColor}
          onRestart={() => setAppState('landing')}
          lang={lang}
        />
      )}

      {/* Core Customizer & Setup View (landing state) */}
      {appState === 'landing' && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto">
          
          {/* Left Panel: Customizer Sidebar Controls */}
          <div className="w-full lg:w-[420px] border-r border-white/5 bg-slate-900/60 p-6 space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              
              {/* Language and Sound Switchers */}
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-indigo-400" />
                  <span className="font-bold text-sm tracking-wider uppercase">FISH S2 PRO</span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Lang selector */}
                  <button
                    onClick={() => setLang(lang === 'pl' ? 'en' : 'pl')}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-950 border border-white/5 hover:border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition"
                  >
                    <Globe className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
                    <span>{lang === 'pl' ? 'Polski (PL)' : 'English (EN)'}</span>
                  </button>

                  {/* Audio Toggle */}
                  <button
                    onClick={handleMuteToggle}
                    className="p-2 rounded-xl bg-slate-950 border border-white/5 hover:border-white/10 text-slate-300"
                    title={isMuted ? 'Wyciszony' : 'Dźwięki włączone'}
                  >
                    {isMuted ? <VolumeX className="h-4 w-4 text-rose-400 animate-pulse" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}
                  </button>
                </div>
              </div>

              {/* Heading Title */}
              <div className="space-y-2">
                <h2 className="text-2xl font-extrabold tracking-tight">
                  {lang === 'pl' ? 'Konfigurator Animowanego Loga' : 'Animated Logo Designer'}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {lang === 'pl' 
                    ? 'Zastąp nudny napis "Trwa uruchamianie serwera" interaktywnym, hipnotyzującym logiem z orbitującymi motywami książkowymi. Ustaw barwy, prędkości i wypróbuj symulację!' 
                    : 'Replace your boring loading screen with an interactive, morphing brand logo based on fish and books. Customize colors, speeds, and test it!'}
                </p>
              </div>

              {/* 1. Style Presets Cards */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-indigo-400" />
                  {lang === 'pl' ? '1. Motywy Stylistyczne' : '1. Style Presets'}
                </h3>

                <div className="grid grid-cols-2 gap-2.5">
                  {(Object.keys(presets) as PresetType[]).map((key) => {
                    const item = presets[key];
                    const isSelected = preset === key;
                    return (
                      <button
                        key={key}
                        onClick={() => handlePresetChange(key)}
                        className={`rounded-2xl border p-3 text-left transition-all duration-300 hover:scale-[1.02] active:scale-95 ${
                          isSelected
                            ? 'bg-slate-950 border-indigo-500 shadow-lg shadow-indigo-950/40'
                            : 'bg-slate-950/40 border-white/5 hover:border-white/10'
                        }`}
                      >
                        <span className="block text-xs font-bold text-slate-100">
                          {lang === 'pl' ? item.namePL : item.nameEN}
                        </span>
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="w-3 h-3 rounded-full border border-white/10" style={{ backgroundColor: item.glow }} />
                          <span className="w-3 h-3 rounded-full border border-white/10" style={{ backgroundColor: item.secondary }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Live Color Pickers */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-indigo-400" />
                  {lang === 'pl' ? '2. Ręczne Dopasowanie Barw' : '2. Fine-tune Colors'}
                </h3>

                <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
                  {/* Glow Color */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {lang === 'pl' ? 'Błysk (Główny)' : 'Glow (Primary)'}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={glowColor}
                        onChange={(e) => setGlowColor(e.target.value)}
                        className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <span className="font-mono text-xs text-slate-300 select-all uppercase">
                        {glowColor}
                      </span>
                    </div>
                  </div>

                  {/* Secondary Color */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {lang === 'pl' ? 'Głębia (Dodatkowy)' : 'Depth (Secondary)'}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <span className="font-mono text-xs text-slate-300 select-all uppercase">
                        {secondaryColor}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Simulation Loading Speed Picker */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse" />
                  {lang === 'pl' ? '3. Czas Trwania Ładowania' : '3. Boot Duration Speed'}
                </h3>

                <div className="space-y-2 bg-slate-950/60 p-3 rounded-2xl border border-white/5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {lang === 'pl' ? 'Czas symulacji serwera:' : 'Simulated Server boot:'}
                    </span>
                    <span className="font-bold text-amber-400">{loadingSpeed}s</span>
                  </div>

                  <input
                    type="range"
                    min="3"
                    max="180"
                    step="1"
                    value={loadingSpeed}
                    onChange={(e) => setLoadingSpeed(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />

                  <div className="flex items-center justify-between text-[9px] text-slate-500 font-medium uppercase">
                    <span>3s ({lang === 'pl' ? 'Szybki test' : 'Quick test'})</span>
                    <span>180s (3 min - {lang === 'pl' ? 'Realny serwer!' : 'Real server!'})</span>
                  </div>
                </div>
              </div>

              {/* 4. Custom Scale slider */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {lang === 'pl' ? 'Skalowanie Loga' : 'Logo Scale'}
                </h3>
                <div className="flex items-center gap-3 bg-slate-950/40 p-2 rounded-xl border border-white/5">
                  <input
                    type="range"
                    min="0.7"
                    max="1.3"
                    step="0.05"
                    value={customScale}
                    onChange={(e) => setCustomScale(parseFloat(e.target.value))}
                    className="flex-1 accent-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold font-mono text-indigo-400">
                    {customScale.toFixed(2)}x
                  </span>
                </div>
              </div>

            </div>

            {/* Sidebar Footer Info */}
            <div className="border-t border-white/5 pt-4 mt-6 text-[11px] text-slate-500 space-y-2">
              <div className="flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-slate-400" />
                <span>
                  {lang === 'pl' ? 'Aplikacja bazuje na technologii Fish S2 Pro.' : 'Powered by Fish S2 Pro technology.'}
                </span>
              </div>
              <p>
                {lang === 'pl' ? 'Po włączeniu symulacji przejdziesz do animowanego panelu wczytywania.' : 'Starting simulation takes you to the animated loading screen overlay.'}
              </p>
            </div>
          </div>

          {/* Right Panel: Live Logo Preview & Code Exporter */}
          <div className="flex-1 bg-slate-950 flex flex-col p-6 overflow-y-auto relative space-y-8">
            
            {/* Decorative glowing mesh */}
            <div 
              className="absolute right-10 top-10 w-96 h-96 rounded-full blur-3xl opacity-10 pointer-events-none transition-colors duration-1000"
              style={{ backgroundColor: glowColor }}
            />
            
            {/* Main Visual Live Canvas Box */}
            <div className="bg-slate-900/30 border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center relative shadow-2xl overflow-hidden min-h-[480px]">
              
              {/* Background tick grids */}
              <div className="absolute inset-0 bg-[radial-gradient(#ffffff04_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
              
              {/* Floating Badge explaining view */}
              <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest text-indigo-400 uppercase">
                <Sparkles className="h-3.5 w-3.5 animate-spin-slow" />
                <span>{lang === 'pl' ? 'Podgląd Animacji Loga w Czasie Rzeczywistym' : 'Interactive Logo Live Canvas'}</span>
              </div>

              {/* Outer Controls overlay */}
              <div className="absolute bottom-4 right-4 flex gap-2.5">
                {/* Skip direct to menu */}
                <button
                  onClick={handleSkipToDashboard}
                  className="rounded-xl bg-slate-900 border border-white/10 hover:bg-slate-800 px-4 py-2 text-xs font-semibold flex items-center gap-1.5 shadow-lg transition"
                >
                  <span>{lang === 'pl' ? 'Przejdź do Menu Aplikacji' : 'Skip to App Menu'}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

                {/* Launch simulated loading screen */}
                <button
                  onClick={handleStartSimulation}
                  className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 px-5 py-2.5 text-xs font-extrabold text-white flex items-center gap-2 shadow-xl shadow-indigo-900/30 hover:scale-105 active:scale-95 transition-all"
                >
                  <Play className="h-3.5 w-3.5 fill-white" />
                  <span>{lang === 'pl' ? 'Uruchom Symulację Serwera' : 'Launch Server Boot Simulation'}</span>
                </button>
              </div>

              {/* Central Logo */}
              <div className="relative transform hover:scale-105 transition-transform duration-500">
                <AnimatedLogo
                  preset={preset}
                  glowColor={glowColor}
                  secondaryColor={secondaryColor}
                  speed="normal"
                  scale={customScale}
                  isSpinning={true}
                  pagesCount={0}
                />
              </div>

              {/* Interactive pointer helper */}
              <div className="absolute bottom-4 left-4 flex items-center gap-2 text-[11px] text-slate-400 font-light bg-slate-950/60 px-3 py-1.5 rounded-xl border border-white/5">
                <MousePointerClick className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                <span>
                  {lang === 'pl' ? 'Przetestuj symulację, by klikać w logo w minigrze!' : 'Run simulation to test the clicker minigame!'}
                </span>
              </div>
            </div>

            {/* Code Exporter Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-md font-bold text-slate-200 uppercase tracking-wider">
                    {lang === 'pl' ? 'Pobierz i Wklej do Swojego Kodu' : 'Export Code to Your App'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {lang === 'pl' 
                      ? 'Twój zindywidualizowany kod jest gotowy. Możesz skopiować czysty kod React + Tailwind lub sam plik HTML + CSS!' 
                      : 'Use the export codes below directly in your real audiobook application loading screen.'}
                  </p>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                  <span>{lang === 'pl' ? 'Zsynchronizowano z kreatorem' : 'Synced in real-time'}</span>
                </div>
              </div>

              <CodeGenerator
                preset={preset}
                glowColor={glowColor}
                secondaryColor={secondaryColor}
                speed="normal"
                lang={lang}
              />
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
