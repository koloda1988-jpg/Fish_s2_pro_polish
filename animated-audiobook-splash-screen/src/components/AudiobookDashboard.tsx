import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  Search, 
  Compass, 
  Library, 
  User, 
  Clock, 
  Star,
  Bookmark,
  Sliders,
  ChevronRight
} from 'lucide-react';
import { synth } from '../utils/AudioSynth';

interface Audiobook {
  id: string;
  title: string;
  author: string;
  narrator: string;
  duration: string;
  progress: number;
  rating: number;
  genre: string;
  genreColor: string;
  icon: string;
  description: string;
}

interface AudiobookDashboardProps {
  glowColor: string;
  onRestart: () => void;
  lang: 'pl' | 'en';
}

export const AudiobookDashboard: React.FC<AudiobookDashboardProps> = ({
  glowColor,
  onRestart,
  lang,
}) => {
  const [selectedBook, setSelectedBook] = useState<Audiobook | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSeek, setCurrentSeek] = useState(35); // percent
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [narratorType, setNarratorType] = useState<'standard' | 'fish' | 'knight' | 'dragon'>('standard');
  const [isMuted, setIsMuted] = useState(false);

  // List of themed audiobooks matching the user's requested genres!
  const audiobooksPL: Audiobook[] = [
    {
      id: '1',
      title: 'Władca Łusek i Ogniste Smoki',
      author: 'Jarosław Smokowski',
      narrator: 'Głos Smoczego Głębinu (AI)',
      duration: '14h 35m',
      progress: 25,
      rating: 4.9,
      genre: 'Fantasy',
      genreColor: '#f59e0b',
      icon: '🐉',
      description: 'Epicka opowieść o sojuszu smoków z głębin oceanu z elfimi królestwami. Wyjątkowo wciągająca historia z potężnymi efektami basowymi.',
    },
    {
      id: '2',
      title: 'Zbroja i Chwała: Ostatni Rycerz',
      author: 'Andrzej Stalowy',
      narrator: 'Marek lektor wojenny',
      duration: '9h 12m',
      progress: 60,
      rating: 4.7,
      genre: 'Przygoda',
      genreColor: '#3b82f6',
      icon: '🛡️',
      description: 'Zgiełk bitwy, lśniące pancerze i opowieść o honorze rycerskim, która trzyma w napięciu od pierwszej do ostatniej minuty.',
    },
    {
      id: '3',
      title: 'Ryba w Kosmicznej Próżni: S2 Pro',
      author: 'Ewa Kosmowska',
      narrator: 'Rybka S2 Pro Synthesizer',
      duration: '18h 50m',
      progress: 5,
      rating: 5.0,
      genre: 'Sci-Fi',
      genreColor: '#a855f7',
      icon: '🪐',
      description: 'Futurystyczna wizja wszechświata, w którym technologia oceaniczna Fish S2 Pro pozwala podróżować między wymiarami za pomocą śpiewu wielorybów.',
    },
    {
      id: '4',
      title: 'Zabójcza Intryga w Pokoju 404',
      author: 'Artur Kryminalny',
      narrator: 'Tomasz Detektywistyczny',
      duration: '11h 20m',
      progress: 85,
      rating: 4.8,
      genre: 'Kryminał',
      genreColor: '#ef4444',
      icon: '🔍',
      description: 'Krew na stronach książki, brak śladów i genialny detektyw, który must rozwiązać zagadkę idealnego morderstwa zanim minie doba.',
    },
    {
      id: '5',
      title: 'Gąsienice w Błocie: Pancerni 1944',
      author: 'Krzysztof Militarny',
      narrator: 'Baryton Wojskowy',
      duration: '13h 45m',
      progress: 0,
      rating: 4.6,
      genre: 'Historia',
      genreColor: '#10b981',
      icon: '🚜',
      description: 'Szczegółowa historia załóg czołgów walczących na frontach II wojny światowej. Realizm, który poruszy każdego fana militariów.',
    },
    {
      id: '6',
      title: 'Skandal na Dworze Królewskim',
      author: 'Maria Romansowa',
      narrator: 'Agnieszka Zmysłowa',
      duration: '8h 30m',
      progress: 40,
      rating: 4.5,
      genre: 'Romans',
      genreColor: '#ec4899',
      icon: '🎭',
      description: 'Szepty, dworskie intrygi, skradzione pocałunki i skandale obyczajowe, które wstrząsnęły całą monarchią w XIX wieku.',
    },
  ];

  const audiobooksEN: Audiobook[] = [
    {
      id: '1',
      title: 'Lord of the Scales and Fire Dragons',
      author: 'Jaroslaw Smokowski',
      narrator: 'Dragon Deep Voice (AI)',
      duration: '14h 35m',
      progress: 25,
      rating: 4.9,
      genre: 'Fantasy',
      genreColor: '#f59e0b',
      icon: '🐉',
      description: 'An epic saga about the alliance of deep-sea dragons with elven kingdoms. Extremely immersive history with strong bass sound effects.',
    },
    {
      id: '2',
      title: 'Armor and Glory: The Last Knight',
      author: 'Andrew Steel',
      narrator: 'Marcus Battle Narrator',
      duration: '9h 12m',
      progress: 60,
      rating: 4.7,
      genre: 'Adventure',
      genreColor: '#3b82f6',
      icon: '🛡️',
      description: 'The din of battle, shining armor, and a story of knightly honor that keeps you on edge from the first to the very last minute.',
    },
    {
      id: '3',
      title: 'Fish in the Cosmic Vacuum: S2 Pro',
      author: 'Eve Cosmic',
      narrator: 'Fish S2 Pro Synthesizer',
      duration: '18h 50m',
      progress: 5,
      rating: 5.0,
      genre: 'Sci-Fi',
      genreColor: '#a855f7',
      icon: '🪐',
      description: 'A futuristic vision where Fish S2 Pro deep-sea technology allows hyperspace travels using majestic whale songs.',
    },
    {
      id: '4',
      title: 'Deadly Intrigue in Room 404',
      author: 'Arthur Crime',
      narrator: 'Thomas Detective Voice',
      duration: '11h 20m',
      progress: 85,
      rating: 4.8,
      genre: 'Crime',
      genreColor: '#ef4444',
      icon: '🔍',
      description: 'Bloodstains on paper, zero clues, and a brilliant detective who must solve a flawless crime scene within 24 hours.',
    },
    {
      id: '5',
      title: 'Muddy Tracks: Tank Crews 1944',
      author: 'Christopher Military',
      narrator: 'Military Baritone',
      duration: '13h 45m',
      progress: 0,
      rating: 4.6,
      genre: 'History',
      genreColor: '#10b981',
      icon: '🚜',
      description: 'Detailed story of tank armor divisions fighting on WWII front lines. Gritty realism that will capture military history enthusiasts.',
    },
    {
      id: '6',
      title: 'Scandal in the Royal Courts',
      author: 'Mary Romance',
      narrator: 'Agnes Velvet',
      duration: '8h 30m',
      progress: 40,
      rating: 4.5,
      genre: 'Romance',
      genreColor: '#ec4899',
      icon: '🎭',
      description: 'Court whispers, forbidden kisses, high-stakes blackmailing, and social scandals that shook the foundations of the 19th-century monarchy.',
    },
  ];

  const books = lang === 'pl' ? audiobooksPL : audiobooksEN;

  // Set default selected book
  useEffect(() => {
    if (books.length > 0) {
      setSelectedBook(books[0]);
    }
  }, []);

  // Simulated audio player seek progress timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentSeek((prev) => (prev >= 100 ? 0 : prev + 0.2));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Play synthetic ambient when audiobook plays/pauses
  const handlePlayPause = () => {
    const nextPlayState = !isPlaying;
    setIsPlaying(nextPlayState);
    
    if (nextPlayState && !isMuted) {
      // Play a synthetic low-frequency space ambient to simulate reading
      synth.startCosmicAmbient();
    } else {
      synth.stopCosmicAmbient();
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-950 text-slate-100 overflow-y-auto animate-fade-in">
      
      {/* Navbar */}
      <header className="flex items-center justify-between border-b border-white/5 bg-slate-950/80 px-6 py-4 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div 
            onClick={onRestart}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border hover:rotate-12 transition-all"
            style={{ 
              borderColor: `${glowColor}50`,
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              boxShadow: `0 0 10px ${glowColor}25`
            }}
            title={lang === 'pl' ? 'Uruchom serwer ponownie' : 'Restart server loading'}
          >
            <span className="text-xl">🐟</span>
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Audiobooki</span>
            <h1 className="text-md font-bold tracking-tight text-slate-200">FISH S2 PRO</h1>
          </div>
        </div>

        {/* Navigation tabs / options */}
        <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
          <a href="#" className="flex items-center gap-1.5 text-white font-medium">
            <Compass className="h-4 w-4" />
            {lang === 'pl' ? 'Przeglądaj' : 'Browse'}
          </a>
          <a href="#" className="flex items-center gap-1.5 hover:text-slate-200 transition">
            <Library className="h-4 w-4" />
            {lang === 'pl' ? 'Biblioteka' : 'Library'}
          </a>
          <a href="#" className="flex items-center gap-1.5 hover:text-slate-200 transition">
            <User className="h-4 w-4" />
            {lang === 'pl' ? 'Profil' : 'Profile'}
          </a>
        </nav>

        {/* Connection State / Restart demo */}
        <div className="flex items-center gap-3">
          <button
            onClick={onRestart}
            className="flex items-center gap-2 rounded-xl bg-slate-900 border border-white/10 px-4 py-2 text-xs font-semibold hover:bg-slate-800 text-slate-200 transition-all shadow-lg shadow-slate-950/50"
          >
            <RotateCcw className="h-3.5 w-3.5 text-amber-400 animate-spin-slow" />
            <span>{lang === 'pl' ? 'Testuj serwer ponownie' : 'Test Server Again'}</span>
          </button>
        </div>
      </header>

      {/* Main Body Layout */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 p-6 gap-6 max-w-7xl mx-auto w-full pb-32">
        
        {/* Left Columns: Books catalog grid */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Banner info card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 to-indigo-950 border border-white/5 p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
            {/* Decorative cosmic bubble */}
            <div className="absolute -right-20 -top-20 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
            <div className="absolute -left-10 -bottom-10 w-32 h-32 rounded-full bg-teal-500/10 blur-2xl pointer-events-none" />

            <div className="space-y-2 max-w-md text-center md:text-left">
              <span className="inline-block rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
                {lang === 'pl' ? 'Serwer online' : 'Server online'}
              </span>
              <h2 className="text-xl font-bold text-slate-100">
                {lang === 'pl' ? 'Pulpit Odtwarzacza Fish S2 Pro' : 'Fish S2 Pro Player Console'}
              </h2>
              <p className="text-xs text-slate-400">
                {lang === 'pl' 
                  ? 'Twój serwer uruchomił się pomyślnie w tle! Teraz możesz wybierać audiobooki spośród ulubionych kategorii i odpalić niesamowitą opowieść.' 
                  : 'Your server successfully booted! You can now play audiobooks from your favorite genres.'}
              </p>
            </div>
            
            {/* Stats counters */}
            <div className="flex gap-4 bg-slate-950/80 border border-white/5 p-4 rounded-2xl backdrop-blur-sm">
              <div className="text-center px-3 border-r border-white/10">
                <span className="text-lg font-bold text-amber-400">6</span>
                <span className="block text-[9px] text-slate-500 uppercase tracking-wider">
                  {lang === 'pl' ? 'Gatunków' : 'Genres'}
                </span>
              </div>
              <div className="text-center px-3">
                <span className="text-lg font-bold" style={{ color: glowColor }}>100%</span>
                <span className="block text-[9px] text-slate-500 uppercase tracking-wider">
                  {lang === 'pl' ? 'Dostępność' : 'Uptime'}
                </span>
              </div>
            </div>
          </div>

          {/* Search bar & filters */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder={lang === 'pl' ? 'Szukaj audiobooków, autorów...' : 'Search books, authors...'}
                className="w-full rounded-xl bg-slate-900/75 border border-white/5 px-10 py-2.5 text-sm placeholder-slate-500 focus:outline-none focus:border-white/15 text-slate-200"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 border border-white/5 hover:border-white/10 px-4 py-2.5 text-xs font-semibold">
                <Sliders className="h-3.5 w-3.5 text-slate-400" />
                <span>Filtry</span>
              </button>
            </div>
          </div>

          {/* Grid catalog */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold tracking-widest text-slate-500 uppercase">
              {lang === 'pl' ? 'Wybór Audiobooków tematycznych' : 'Themed Audiobooks Selection'}
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {books.map((book) => (
                <div
                  key={book.id}
                  onClick={() => setSelectedBook(book)}
                  className={`group relative rounded-2xl border p-4 transition-all duration-300 cursor-pointer flex gap-4 items-start ${
                    selectedBook?.id === book.id
                      ? 'bg-slate-900 border-indigo-500/50 shadow-lg shadow-indigo-950/20'
                      : 'bg-slate-900/40 border-white/5 hover:border-white/10 hover:bg-slate-900/60'
                  }`}
                >
                  {/* Book Cover Mock */}
                  <div 
                    className="w-16 h-20 rounded-xl flex flex-col items-center justify-between p-2 relative overflow-hidden shadow-md border border-white/5"
                    style={{ 
                      background: `linear-gradient(135deg, ${book.genreColor}30 0%, ${book.genreColor}10 100%)`
                    }}
                  >
                    {/* Outer glowing shadow */}
                    <div 
                      className="absolute inset-0 opacity-20 group-hover:opacity-45 transition-opacity blur-lg"
                      style={{ backgroundColor: book.genreColor }}
                    />
                    <span className="text-3xl z-10">{book.icon}</span>
                    <span className="text-[8px] uppercase font-bold tracking-wider px-1 py-0.5 rounded bg-black/40 text-white z-10">
                      {book.genre}
                    </span>
                  </div>

                  {/* Book details */}
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <h4 className="text-sm font-bold text-slate-200 group-hover:text-white transition truncate">
                      {book.title}
                    </h4>
                    <p className="text-xs text-slate-400 truncate">
                      {book.author}
                    </p>
                    
                    <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-indigo-400" />
                        {book.duration}
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                        {book.rating}
                      </span>
                    </div>

                    {/* progress indicator */}
                    {book.progress > 0 && (
                      <div className="pt-1">
                        <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: `${book.progress}%`,
                              backgroundColor: book.genreColor
                            }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-400">
                          {book.progress}% {lang === 'pl' ? 'słuchano' : 'played'}
                        </span>
                      </div>
                    )}
                  </div>

                  <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-300 transition self-center" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Full Details panel */}
        <div className="lg:col-span-1">
          {selectedBook ? (
            <div className="bg-slate-900 border border-white/5 rounded-3xl p-6 space-y-6 sticky top-24 shadow-2xl shadow-black/50 animate-fade-in-right">
              {/* Book Icon large representation */}
              <div className="flex flex-col items-center text-center space-y-4">
                <div 
                  className="w-36 h-48 rounded-2xl flex flex-col items-center justify-between p-4 relative overflow-hidden shadow-2xl border border-white/10"
                  style={{ 
                    background: `linear-gradient(135deg, ${selectedBook.genreColor}40 0%, ${selectedBook.genreColor}15 100%)`,
                    boxShadow: `0 20px 40px ${selectedBook.genreColor}12`
                  }}
                >
                  <div className="absolute inset-0 opacity-30 blur-xl" style={{ backgroundColor: selectedBook.genreColor }} />
                  <span className="text-7xl z-10 drop-shadow-lg">{selectedBook.icon}</span>
                  <span 
                    className="text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded-lg text-white z-10 shadow-md border border-white/15"
                    style={{ backgroundColor: selectedBook.genreColor }}
                  >
                    {selectedBook.genre}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-lg font-bold text-slate-100">{selectedBook.title}</h3>
                  <p className="text-sm text-slate-400">{selectedBook.author}</p>
                </div>
              </div>

              {/* Metadata list */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-3 rounded-2xl border border-white/5">
                <div className="text-center p-2 border-r border-white/5">
                  <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Lektor</span>
                  <span className="text-xs font-semibold text-slate-300 truncate block max-w-[120px] mx-auto">
                    {selectedBook.narrator}
                  </span>
                </div>
                <div className="text-center p-2">
                  <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Czas trwania</span>
                  <span className="text-xs font-semibold text-slate-300">
                    {selectedBook.duration}
                  </span>
                </div>
              </div>

              {/* Short Description */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">O audiobooku</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {selectedBook.description}
                </p>
              </div>

              {/* Playbook Settings Controls */}
              <div className="space-y-3 border-t border-white/5 pt-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Modyfikator Lektora</h4>
                
                {/* Narrator voice type modification */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setNarratorType('standard')}
                    className={`rounded-lg py-1.5 text-[11px] font-semibold border transition-all ${
                      narratorType === 'standard'
                        ? 'bg-white/10 border-white/20 text-white'
                        : 'bg-slate-950 border-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🎧 Standard
                  </button>
                  <button
                    onClick={() => setNarratorType('fish')}
                    className={`rounded-lg py-1.5 text-[11px] font-semibold border transition-all ${
                      narratorType === 'fish'
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                        : 'bg-slate-950 border-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🐟 Fish S2 Pro Mode
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/40 border border-dashed border-white/10 rounded-3xl p-10 text-center flex flex-col items-center justify-center h-64">
              <Bookmark className="h-12 w-12 text-slate-700 animate-pulse mb-3" />
              <p className="text-sm text-slate-400">
                {lang === 'pl' 
                  ? 'Wybierz audiobooka z listy po lewej stronie, aby wyświetlić szczegóły i rozpocząć odsłuch.' 
                  : 'Choose an audiobook from the left to inspect detail files.'}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer Audio Player Module */}
      {selectedBook && (
        <footer className="fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-white/5 py-4 px-6 backdrop-blur-md z-40 shadow-2xl animate-fade-in-up">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Left Block */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-3xl">{selectedBook.icon}</span>
              <div>
                <h4 className="text-sm font-bold text-slate-100 line-clamp-1">
                  {selectedBook.title}
                </h4>
                <p className="text-xs text-slate-400 flex items-center gap-2">
                  <span>{selectedBook.author}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-600" />
                  <span className="text-indigo-400 font-semibold text-[10px] bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    {narratorType === 'fish' ? 'Fish S2 Audio' : 'Lektor AI'}
                  </span>
                </p>
              </div>
            </div>

            {/* Center Block */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-md w-full">
              <div className="flex items-center gap-4">
                <button className="p-2 text-slate-400 hover:text-slate-200 transition">
                  <SkipBack className="h-4 w-4" />
                </button>
                
                {/* Main play pause button */}
                <button
                  onClick={handlePlayPause}
                  className="p-3.5 rounded-full text-slate-950 hover:scale-105 active:scale-95 transition-all shadow-lg"
                  style={{ 
                    backgroundColor: selectedBook.genreColor,
                    boxShadow: `0 0 15px ${selectedBook.genreColor}50`
                  }}
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5 fill-slate-950" />
                  ) : (
                    <Play className="h-5 w-5 fill-slate-950 ml-0.5" />
                  )}
                </button>

                <button className="p-2 text-slate-400 hover:text-slate-200 transition">
                  <SkipForward className="h-4 w-4" />
                </button>
              </div>

              {/* Seek timeline */}
              <div className="flex items-center gap-3 w-full text-[10px] text-slate-500">
                <span>2:34</span>
                <div className="h-1.5 flex-1 bg-slate-950 rounded-full overflow-hidden cursor-pointer relative">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${currentSeek}%`,
                      backgroundColor: selectedBook.genreColor,
                    }}
                  />
                </div>
                <span>{selectedBook.duration}</span>
              </div>
            </div>

            {/* Right Block */}
            <div className="flex items-center gap-4 justify-end w-full sm:w-auto">
              {/* Speed selection slider */}
              <div className="flex items-center gap-1 bg-slate-950 px-3 py-1 rounded-xl border border-white/5">
                <span className="text-[10px] text-slate-500 font-bold">PRĘDKOŚĆ</span>
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                  className="bg-transparent text-xs font-bold text-amber-400 focus:outline-none cursor-pointer"
                >
                  <option value="0.75" className="bg-slate-950">0.75x</option>
                  <option value="1.0" className="bg-slate-950">1.0x</option>
                  <option value="1.25" className="bg-slate-950">1.25x</option>
                  <option value="1.5" className="bg-slate-950">1.5x</option>
                  <option value="2.0" className="bg-slate-950">2.0x</option>
                </select>
              </div>

              {/* Mute/Unmute player audio */}
              <button
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (!isMuted) {
                    synth.stopCosmicAmbient();
                  } else if (isPlaying) {
                    synth.startCosmicAmbient();
                  }
                }}
                className="p-2 text-slate-400 hover:text-slate-200 transition"
              >
                {isMuted ? <VolumeX className="h-4.5 w-4.5 text-rose-400" /> : <Volume2 className="h-4.5 w-4.5" />}
              </button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};
