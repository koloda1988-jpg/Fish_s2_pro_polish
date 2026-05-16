import React, { useState, useEffect, useRef } from 'react';
import { 
  Volume2, 
  Info, 
  BookOpen, 
  Zap, 
  Sparkles,
  VolumeX,
  Volume1
} from 'lucide-react';
import { AnimatedLogo } from './AnimatedLogo';
import { synth } from '../utils/AudioSynth';

interface LoadingScreenProps {
  preset: 'cyber' | 'ocean' | 'vintage' | 'cosmic';
  glowColor: string;
  secondaryColor: string;
  loadingSpeed: number; // in seconds
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  onComplete: () => void;
  lang: 'pl' | 'en';
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  preset,
  glowColor,
  secondaryColor,
  loadingSpeed,
  isMuted,
  setIsMuted,
  onComplete,
  lang,
}) => {
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState('');
  const [pagesCount, setPagesCount] = useState(0);
  const [clickerMilestone, setClickerMilestone] = useState(0);
  const [activeAmbient, setActiveAmbient] = useState<'none' | 'ocean' | 'fireplace' | 'cosmic'>('none');
  const [ambientVolume, setAmbientVolume] = useState(0.5);
  const [interactiveMessage, setInteractiveMessage] = useState<string | null>(null);
  
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Funny/Epic Loading Statements based on progress
  const loadingMessagesPL = [
    { min: 0, max: 10, text: 'Trwa nawiązywanie bezpiecznego połączenia z serwerem Fish S2 Pro...' },
    { min: 10, max: 20, text: 'Budzenie smoka ze stuletniego snu... Uważaj na ogień! 🔥' },
    { min: 20, max: 30, text: 'Czyszczenie łusek i polerowanie płetw w rybce S2 Pro... 🐟' },
    { min: 30, max: 40, text: 'Zakładanie ciężkich zbroi rycerzom i ostrzenie mieczy przed bitwą... ⚔️' },
    { min: 40, max: 50, text: 'Uruchamianie generatorów grawitacyjnych na odległych planetach... 🪐' },
    { min: 50, max: 60, text: 'Tankowanie gąsienicowych czołgów i czyszczenie luf w dziale historycznym... 🚜' },
    { min: 60, max: 70, text: 'Mieszanie eliksirów miłosnych i spisywanie salonowych skandali... 💖' },
    { min: 70, max: 80, text: 'Podrzucanie fałszywych poszlak i zacieranie śladów zbrodni dla detektywa... 🔍' },
    { min: 80, max: 90, text: 'Rozwieszanie żółtych taśm policyjnych na miejscach popełnienia intrygi... ⚠️' },
    { min: 90, max: 98, text: 'Szeptanie ostatnich słów rozdziału... Zamykanie okładki przed startem...' },
    { min: 98, max: 100, text: 'Serwer gotowy! Książki otwarte. Słuchawki na uszy! 🎧' },
  ];

  const loadingMessagesEN = [
    { min: 0, max: 10, text: 'Establishing a secure connection with the Fish S2 Pro server...' },
    { min: 10, max: 20, text: 'Awakening the dragon from its century-long slumber... Watch out for fire! 🔥' },
    { min: 20, max: 30, text: 'Cleaning scales and polishing fins in the S2 Pro fish... 🐟' },
    { min: 30, max: 40, text: 'Armoring noble knights and sharpening broadswords before battle... ⚔️' },
    { min: 40, max: 50, text: 'Powering up gravity generators on distant uncharted planets... 🪐' },
    { min: 50, max: 60, text: 'Fueling historical combat tanks and clearing artillery barrels... 🚜' },
    { min: 60, max: 70, text: 'Brewing passion potions and drafting high-society scandals... 💖' },
    { min: 70, max: 80, text: 'Planting decoy clues and covering up blood tracks for the detective... 🔍' },
    { min: 80, max: 90, text: 'Stretching yellow police tapes over intriguing crime scenes... ⚠️' },
    { min: 90, max: 98, text: 'Whispering the chapter\'s final words... Dusting off book jackets...' },
    { min: 98, max: 100, text: 'Server online! Bookmarks loaded. Put your headphones on! 🎧' },
  ];

  // Quotes/Interaction text when clicking genre elements
  const quotesPL: { [key: string]: string } = {
    fantasy: '„Nie wszystkie te smoki są złe, niektóre po prostu szukają biblioteki z ciekawym spisem treści!” - Kroniki Północy',
    adventure: '„Gdy rycerz poleruje tarczę, szykuje się albo na turniej, albo na potężny audiobook o chwale i zdradzie!” - Ostatni Bastion',
    'sci-fi': '„Na tej planecie słuchają książek za pomocą fal grawitacyjnych. Nasza rybka S2 Pro potrafi niemal to samo!” - Gwiezdne Rubieże',
    crime: '„Zbrodnia doskonała nie istnieje. Zawsze zostaje odcisk palca na grzbiecie kryminału...” - Inspektor Rybiński',
    military: '„Czołg rusza z kopyta, gdy silnik ryczy basem tak niskim, jak najwspanialszy głos lektora polskiego.” - Pancerni z Biblioteki',
    drama: '„Nic tak nie podgrzewa atmosfery w kuluarach jak dobrze ukrywany skandal... lub zgubiony rozdział pamiętnika.” - Dworskie Sekrety',
  };

  const quotesEN: { [key: string]: string } = {
    fantasy: '"Not all dragons are fierce; some simply seek a library with an excellent catalog!" - Chronicles of the North',
    adventure: '"When a knight polishes his shield, he prepares either for a grand joust or an epic story of loyalty!" - The Last Bastion',
    'sci-fi': '"On this distant planet, audiobooks are transmitted via gravitational waves. Our Fish S2 Pro is just as smart!" - Star Horizon',
    crime: '"There is no such thing as a perfect crime. A fingerprint is always left on the spine of the thriller..." - Inspector Gill',
    military: '"A tank roars to life with a bass rumble as deep and satisfying as a master narrator\'s voice." - Armor Division 19',
    drama: '"Nothing fuels high-society gossips more than a well-kept scandal... or a missing diary page." - Court Secrets',
  };

  // Handle progress simulation
  useEffect(() => {
    setProgress(0);
    const intervalDuration = (loadingSpeed * 1000) / 100;

    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressIntervalRef.current!);
          setTimeout(() => {
            onComplete();
          }, 1000);
          return 100;
        }
        // Slight randomness to loading speed to make it look natural
        const randomIncrement = Math.random() > 0.7 ? 2 : 1;
        return Math.min(prev + randomIncrement, 100);
      });
    }, intervalDuration);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [loadingSpeed, onComplete]);

  // Set loading messages dynamically based on current progress
  useEffect(() => {
    const messages = lang === 'pl' ? loadingMessagesPL : loadingMessagesEN;
    const match = messages.find((msg) => progress >= msg.min && progress <= msg.max);
    if (match) {
      setCurrentMessage(match.text);
    }
  }, [progress, lang]);

  // Sparkle sound triggers when milestones are reached
  useEffect(() => {
    if (pagesCount > 0 && pagesCount % 10 === 0 && pagesCount !== clickerMilestone) {
      setClickerMilestone(pagesCount);
      if (!isMuted) {
        synth.playSparkle();
      }
    }
  }, [pagesCount, clickerMilestone, isMuted]);

  // Handle clicking the main logo (Clicker game)
  const handleLogoClick = () => {
    setPagesCount((prev) => prev + 1);
    if (!isMuted) {
      // Randomize bubble pop pitches for satisfying feel!
      synth.playBubblePop(0.8 + Math.random() * 0.6);
    }
    // Dynamic loading boost! Clicker rewards user by making loading 1.5% faster
    setProgress((prev) => Math.min(prev + 1.5, 100));
  };

  // Handle clicking orbiting genre elements
  const handleElementClick = (genreId: string) => {
    const quotes = lang === 'pl' ? quotesPL : quotesEN;
    setInteractiveMessage(quotes[genreId] || '');
    
    if (!isMuted) {
      if (genreId === 'fantasy' || genreId === 'military') {
        synth.playLowRumble();
      } else if (genreId === 'sci-fi' || genreId === 'drama') {
        synth.playSparkle();
      } else {
        synth.playPageTurn();
      }
    }
    
    // Auto fade out message after 6 seconds
    setTimeout(() => {
      setInteractiveMessage((curr) => (curr === quotes[genreId] ? null : curr));
    }, 6000);
  };

  // Handle Soundscapes
  const toggleAmbient = (type: 'ocean' | 'fireplace' | 'cosmic') => {
    if (isMuted) {
      setIsMuted(false);
    }

    if (activeAmbient === type) {
      // Stop current
      stopAllAmbients();
      setActiveAmbient('none');
    } else {
      // Stop current first, then start new
      stopAllAmbients();
      setActiveAmbient(type);
      if (type === 'ocean') synth.startOceanAmbient();
      if (type === 'fireplace') synth.startFireplaceAmbient();
      if (type === 'cosmic') synth.startCosmicAmbient();
    }
  };

  const stopAllAmbients = () => {
    synth.stopOceanAmbient();
    synth.stopFireplaceAmbient();
    synth.stopCosmicAmbient();
  };

  // Clean up synthesizers on unmount
  useEffect(() => {
    return () => {
      stopAllAmbients();
    };
  }, []);

  // Handle volume changes
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setAmbientVolume(val);
    if (activeAmbient !== 'none') {
      synth.setVolume(activeAmbient, val);
    }
  };

  // Dynamic background classes based on preset
  const getBgGradient = () => {
    if (preset === 'ocean') return 'from-slate-950 via-blue-950 to-slate-950';
    if (preset === 'vintage') return 'from-stone-950 via-amber-950/10 to-stone-950';
    if (preset === 'cosmic') return 'from-slate-950 via-purple-950/30 to-slate-950';
    return 'from-slate-950 via-slate-900 to-zinc-950'; // cyber / default
  };

  return (
    <div className={`relative flex min-h-screen flex-col items-center justify-between bg-gradient-to-b ${getBgGradient()} p-6 text-slate-100 overflow-hidden transition-colors duration-1000`}>
      {/* Background grids or starry trails */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>

      {/* 1. Top Bar: Info & Audio controls */}
      <div className="relative z-10 flex w-full max-w-6xl items-center justify-between border-b border-white/5 pb-4 animate-fade-in-down">
        <div className="flex items-center gap-3">
          <div 
            className="flex h-10 w-10 items-center justify-center rounded-xl border"
            style={{ 
              borderColor: `${glowColor}40`,
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              boxShadow: `0 0 10px ${glowColor}20`
            }}
          >
            <BookOpen className="h-5 w-5" style={{ color: glowColor }} />
          </div>
          <div>
            <h1 className="text-md font-semibold tracking-wider uppercase">
              Fish S2 Pro <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-slate-300 ml-1 font-normal">Server Setup</span>
            </h1>
            <p className="text-xs text-slate-400 font-light">
              {lang === 'pl' ? 'Zamiast nudnego napisu, przeżyj przygodę' : 'Instead of boring text, experience an adventure'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Loading Booster */}
          <button
            onClick={() => setProgress((prev) => Math.min(prev + 15, 100))}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-amber-400 px-3 py-1.5 text-xs font-medium transition-all duration-200"
            title={lang === 'pl' ? 'Przyspiesz ładowanie o 15%' : 'Boost loading by 15%'}
          >
            <Zap className="h-3.5 w-3.5 animate-pulse" />
            <span>{lang === 'pl' ? 'Doładuj' : 'Boost'} +15%</span>
          </button>

          {/* Mute/Unmute master toggle */}
          <button
            onClick={() => {
              setIsMuted(!isMuted);
              if (!isMuted) {
                stopAllAmbients();
                setActiveAmbient('none');
              }
            }}
            className="p-2 rounded-lg bg-slate-900/70 border border-white/10 hover:border-white/20 text-slate-300 transition-all"
            title={isMuted ? 'Włącz dźwięki' : 'Wycisz wszystko'}
          >
            {isMuted ? <VolumeX className="h-4 w-4 text-rose-400 animate-pulse" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 2. Center Screen: The Interactive Animated Logo Area */}
      <div className="relative flex flex-1 flex-col items-center justify-center w-full max-w-4xl my-4">
        {/* The Interactive Helper Toast */}
        <div className="absolute top-0 bg-slate-900/85 border border-white/10 text-slate-300 text-xs px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 backdrop-blur-sm animate-bounce">
          <Info className="h-3.5 w-3.5 text-amber-400" />
          <span>
            {lang === 'pl' 
              ? 'Kliknij w logo ryby-książki lub poboczne ikony, aby grać i odkrywać!' 
              : 'Click the fish-book logo or outer icons to play and discover!'}
          </span>
        </div>

        {/* Clickable Logo trigger wrapper */}
        <div 
          onClick={handleLogoClick}
          className="cursor-pointer group relative active:scale-95 transition-transform duration-150 ease-out"
          title={lang === 'pl' ? 'Kliknij, aby pisać swoją historię!' : 'Click to write your story!'}
        >
          <AnimatedLogo
            preset={preset}
            glowColor={glowColor}
            secondaryColor={secondaryColor}
            speed={progress >= 98 ? 'fast' : progress > 60 ? 'normal' : 'slow'}
            scale={1.05}
            pagesCount={pagesCount}
            onElementClick={handleElementClick}
          />
          
          {/* Pulsing click notification */}
          <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{ boxShadow: `inset 0 0 40px ${glowColor}30` }}
          />
        </div>

        {/* Interactive Genre Quotes Area */}
        <div className="h-16 mt-4 flex items-center justify-center text-center px-6 max-w-xl">
          {interactiveMessage ? (
            <div className="bg-slate-900/90 border border-white/10 p-3 rounded-xl shadow-xl animate-fade-in-up backdrop-blur-sm relative">
              <p className="text-xs italic font-medium text-slate-200">{interactiveMessage}</p>
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-slate-900 border-r border-b border-white/10 rotate-45" />
            </div>
          ) : (
            <p className="text-xs text-slate-500 font-light tracking-wide animate-pulse">
              {lang === 'pl' 
                ? '💡 Kliknięcie w ikony na orbicie ujawnia fragmenty historii z danej kategorii!'
                : '💡 Clicking icons on the orbit reveals story snippets of that genre!'}
            </p>
          )}
        </div>
      </div>

      {/* 3. Bottom Section: Progress & Soundscapes controls */}
      <div className="relative z-10 w-full max-w-3xl space-y-6 border-t border-white/5 pt-6 animate-fade-in-up">
        
        {/* Progressive Interactive Stats */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-slate-900/60 border border-white/5 rounded-xl p-2">
            <span className="block text-[10px] uppercase tracking-widest text-slate-500">
              {lang === 'pl' ? 'Strony opowieści' : 'Story Pages'}
            </span>
            <span className="text-lg font-bold text-amber-400 flex items-center justify-center gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-400 animate-spin-slow" />
              {pagesCount}
            </span>
          </div>
          
          <div className="bg-slate-900/60 border border-white/5 rounded-xl p-2 flex flex-col justify-center">
            <span className="block text-[10px] uppercase tracking-widest text-slate-500">
              {lang === 'pl' ? 'Rybi status' : 'Fish Status'}
            </span>
            <span className="text-xs font-semibold tracking-wider" style={{ color: glowColor }}>
              {progress < 30 ? 'Budzenie łusek' : progress < 75 ? 'Płetwy S2 Pro OK' : 'Pełna moc'}
            </span>
          </div>

          <div className="bg-slate-900/60 border border-white/5 rounded-xl p-2">
            <span className="block text-[10px] uppercase tracking-widest text-slate-500">
              {lang === 'pl' ? 'Szybkość ładowania' : 'Boot Speed'}
            </span>
            <span className="text-lg font-bold text-emerald-400">
              {loadingSpeed}s
            </span>
          </div>
        </div>

        {/* Progress Bar & Percentage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-slate-400">
              {lang === 'pl' ? 'Stan uruchamiania serwera' : 'Server Boot Status'}
            </span>
            <span className="font-bold text-lg transition-all duration-200" style={{ color: glowColor }}>
              {progress}%
            </span>
          </div>

          {/* Outer Glow Bar */}
          <div className="h-3.5 w-full overflow-hidden rounded-full bg-slate-950 border border-white/10 p-0.5 relative">
            <div
              className="h-full rounded-full transition-all duration-500 relative"
              style={{
                width: `${progress}%`,
                backgroundColor: glowColor,
                boxShadow: `0 0 12px ${glowColor}, 0 0 6px ${secondaryColor}`,
                background: `linear-gradient(to right, ${secondaryColor}, ${glowColor})`
              }}
            >
              {/* Animated Laser Tip */}
              {progress < 100 && (
                <div className="absolute right-0 top-0 h-full w-2 bg-white rounded-full animate-pulse shadow-[0_0_10px_#fff]" />
              )}
            </div>
          </div>

          {/* Loading message statement */}
          <p className="text-center text-xs tracking-wide text-slate-300 font-medium h-6 select-none">
            {currentMessage}
          </p>
        </div>

        {/* Soundscapes Panel */}
        <div className="bg-slate-900/85 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5 text-indigo-400" />
                {lang === 'pl' ? 'Ścieżki Dźwiękowe (Syntetyzator)' : 'Cozy Soundscapes (Synth)'}
              </h3>
              <p className="text-[10px] text-slate-500">
                {lang === 'pl' ? 'Zrelaksuj się podczas wczytywania' : 'Relax and focus while server boots up'}
              </p>
            </div>

            {/* Volume control slider */}
            <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-white/5">
              {ambientVolume === 0 ? <VolumeX className="h-3.5 w-3.5 text-slate-500" /> : ambientVolume < 0.5 ? <Volume1 className="h-3.5 w-3.5 text-slate-400" /> : <Volume2 className="h-3.5 w-3.5 text-slate-300" />}
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={ambientVolume}
                onChange={handleVolumeChange}
                className="h-1 w-16 accent-indigo-500 cursor-pointer"
                disabled={activeAmbient === 'none'}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {/* Ocean Ambient Button */}
            <button
              onClick={() => toggleAmbient('ocean')}
              className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition-all duration-300 ${
                activeAmbient === 'ocean'
                  ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                  : 'bg-slate-950/60 border-white/5 hover:border-white/15 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🐟</span>
              <span>{lang === 'pl' ? 'Głębia Oceanu' : 'Ocean Depths'}</span>
            </button>

            {/* Fireplace Button */}
            <button
              onClick={() => toggleAmbient('fireplace')}
              className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition-all duration-300 ${
                activeAmbient === 'fireplace'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-slate-950/60 border-white/5 hover:border-white/15 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🔥</span>
              <span>{lang === 'pl' ? 'Ciepły Kominek' : 'Library Fireplace'}</span>
            </button>

            {/* Cosmic Button */}
            <button
              onClick={() => toggleAmbient('cosmic')}
              className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition-all duration-300 ${
                activeAmbient === 'cosmic'
                  ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                  : 'bg-slate-950/60 border-white/5 hover:border-white/15 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🪐</span>
              <span>{lang === 'pl' ? 'Kosmiczny Pad' : 'Cosmic Ambient'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
