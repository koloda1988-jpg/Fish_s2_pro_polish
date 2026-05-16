// main.js - Electron main process (v3 with s2_server.py)
//
// What it does:
// 1) Spawns `s2_server.py` (TTS HTTP, port 8080) in the local project venv
// 2) Shows splash window "Loading model..." during cold load
// 3) Polls GET / until server responds 200 (cold load 30-90 s)
// 4) Spawns `python_backend.py` (JSON-RPC orchestrator)
// 5) Opens main window with renderer.html
// 6) On close - kills both child processes (tree-kill cascade)

const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const { pathToFileURL } = require('url');

// Suppress Chromium GPU-cache permission errors (common on Windows with restricted temp folders)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('log-level', '3'); // suppress INFO/WARNING noise
const https = require('https');

// ─── Configuration ──────────────────────────────────────────────────────────

// When app is packaged by electron-builder:
//   process.resourcesPath  = <InstallDir>\resources
//   INSTALL_DIR            = <InstallDir>             (contains venv\ and models\)
//   PYTHON_SCRIPTS_DIR     = <InstallDir>\resources   (contains extraResources: s2_server.py, etc.)
// In dev mode:
//   INSTALL_DIR = PYTHON_SCRIPTS_DIR = __dirname
const INSTALL_DIR         = app.isPackaged ? path.dirname(process.resourcesPath) : __dirname;
const PYTHON_SCRIPTS_DIR  = app.isPackaged ? process.resourcesPath               : __dirname;
const S2_SERVER_PY        = path.join(PYTHON_SCRIPTS_DIR, 's2_server.py');
const LOCAL_VENV_PYTHON   = path.join(INSTALL_DIR, 'venv', 'Scripts', 'python.exe');
const LANGUAGES_DIR       = path.join(INSTALL_DIR, 'languages');

const HF_REPO = 'fishaudio/fish-speech-1.5';
const HF_REPO_BNB = 'groxaxo/s2-pro-BnB-4Bits';
const HF_BASE = 'https://huggingface.co';

// Available model registry - key is used by renderer
const MODEL_REGISTRY = {
  's2pro': { repo: HF_REPO,     dirName: 's2-pro' },
  'bnb':   { repo: HF_REPO_BNB, dirName: 's2-pro-BnB-4Bits' },
};
function modelEntry(key) { return MODEL_REGISTRY[key] || MODEL_REGISTRY['s2pro']; }
let _dlController = null;  // model download cancellation controller

const S2_HOST = '127.0.0.1';
const S2_PORT = 8080;
const S2_HEALTH_URL = `http://${S2_HOST}:${S2_PORT}/`;
const S2_HEALTH_POLL_MS = 1000;
const S2_HEALTH_TIMEOUT_MS = 360_000;  // 6 min for cold load (cold start after restart)

let mainWindow = null;
let splashWindow = null;
let pyProc = null;          // python_backend.py
let s2Proc = null;          // s2_server.py
let pyBuffer = '';
let nextRequestId = 1;
const pendingRequests = new Map();

const DEFAULT_EN_TRANSLATIONS = {
  btn_about: 'ℹ About',
  btn_reload: '🔄 Refresh',
  btn_hand_mode: '✍ Hand Mode',
  btn_models: '📦 Models',
  btn_voice_creation: '🎙 Narrators',
  btn_prepare_book: 'Prepare Book',
  btn_open_folder: 'WAV/MP3 Folder',
  btn_lang_title: 'Select language',
  player_btn: '📚 Player',
  ai_voiceover_btn: '🎬 AI Voiceover',
  player_title: '📚 Audiobook Player',
  player_library: 'Library',
  player_refresh: 'Refresh',
  player_search_placeholder: 'Search books...',
  player_select_book: 'Select a book',
  player_section_label: 'Section',
  player_track_label: 'Track',
  player_prev: '⏮ Prev',
  player_back15: '↺ 15s',
  player_play: '▶ Play',
  player_pause: '⏸ Pause',
  player_fwd15: '15s ↻',
  player_next: 'Next ⏭',
  player_volume: 'Volume',
  player_speed: 'Speed',
  player_shuffle_on: '🔀 Shuffle: On',
  player_shuffle_off: '🔀 Shuffle: Off',
  player_repeat: 'Repeat',
  player_repeat_off: 'Off',
  player_repeat_section: 'Section',
  player_repeat_book: 'Book',
  player_sleep_timer: 'Sleep timer',
  player_start_timer: 'Start timer',
  player_cancel_timer: 'Cancel timer',
  player_sleep_not_active: 'not active',
  player_sleep_left: 'left {{time}}',
  player_sleep_elapsed: 'Sleep timer elapsed. Playback stopped.',
  player_no_books_in: 'No audiobooks found in {{path}}',
  player_no_results_for: 'No results for "{{query}}"',
  player_tracks_count: '{{n}} tracks',
  player_scan_error: 'Player scan error: {{msg}}',
  ai_voiceover_title: '🎬 AI Voiceover Creator',
  ai_video_file: 'Video file (MP4/MKV/MOV)',
  ai_video_drop: 'Drop video here or click to select',
  ai_subtitles_file: 'Subtitles (.srt/.vtt) or auto-generate',
  ai_subtitles_drop: 'Drop subtitles here or click to select',
  ai_narrator: 'Narrator',
  ai_queue_workers: 'Queue workers',
  ai_autofit: 'Auto-fit speech',
  ai_ducking: 'Ducking (%)',
  ai_parse_subtitles: 'Load subtitle file',
  ai_extract_subtitles: 'Extract subtitles from video',
  ai_generate_queue: 'Generate Audio Queue',
  ai_generate_preview: 'Generate Preview',
  ai_full_render: 'Full Render',
  ai_video_audio_on: 'Video audio: On',
  ai_video_audio_off: 'Video audio: Off',
  ai_video_audio_unavailable: 'No video audio',
  ai_save_project: 'Save Project',
  ai_load_project: 'Load Project',
  ai_timeline_hint: 'Timeline: set offset in ms for each subtitle line. Positive values delay narrator start.',
  ai_timeline_col_idx: '#',
  ai_timeline_col_start: 'Start',
  ai_timeline_col_end: 'End',
  ai_timeline_col_dur: 'Dur',
  ai_timeline_col_offset: 'Offset (ms)',
  ai_timeline_col_rate: 'Rate',
  ai_timeline_col_status: 'Status',
  ai_timeline_col_text: 'Text'
};

const DEFAULT_PL_TRANSLATIONS = {
  ...DEFAULT_EN_TRANSLATIONS,
  btn_about: 'ℹ O aplikacji',
  btn_reload: '🔄 Odśwież',
  btn_hand_mode: '✍ Hand Mode',
  btn_models: '📦 Modele',
  btn_voice_creation: '🎙 Lektorzy',
  btn_prepare_book: 'Przygotuj książkę',
  btn_open_folder: 'Folder WAV/MP3',
  btn_lang_title: 'Wybierz język',
  player_library: 'Biblioteka',
  player_refresh: 'Odśwież',
  player_search_placeholder: 'Szukaj książek...',
  player_select_book: 'Wybierz książkę',
  player_section_label: 'Sekcja',
  player_track_label: 'Utwór',
  player_prev: '⏮ Poprzedni',
  player_play: '▶ Odtwórz',
  player_pause: '⏸ Pauza',
  player_next: 'Następny ⏭',
  player_volume: 'Głośność',
  player_speed: 'Prędkość',
  player_repeat: 'Powtarzanie',
  player_repeat_off: 'Wyłączone',
  player_repeat_section: 'Sekcja',
  player_repeat_book: 'Książka',
  player_sleep_timer: 'Wyłącznik czasowy',
  player_start_timer: 'Uruchom timer',
  player_cancel_timer: 'Anuluj timer',
  player_sleep_not_active: 'nieaktywny',
  player_sleep_left: 'pozostało {{time}}',
  player_sleep_elapsed: 'Minął czas timera. Odtwarzanie zatrzymane.',
  player_no_books_in: 'Nie znaleziono audiobooków w {{path}}',
  player_no_results_for: 'Brak wyników dla "{{query}}"',
  player_tracks_count: '{{n}} utworów',
  player_scan_error: 'Błąd skanowania playera: {{msg}}',
  ai_video_file: 'Plik wideo (MP4/MKV/MOV)',
  ai_video_drop: 'Upuść plik wideo lub kliknij, aby wybrać',
  ai_subtitles_file: 'Napisy (.srt/.vtt) lub generowanie automatyczne',
  ai_subtitles_drop: 'Upuść napisy lub kliknij, aby wybrać',
  ai_narrator: 'Lektor',
  ai_queue_workers: 'Workery kolejki',
  ai_autofit: 'Dopasuj mowę',
  ai_parse_subtitles: 'Wczytaj plik napisów',
  ai_extract_subtitles: 'Wyciągnij napisy z filmu',
  ai_generate_queue: 'Generuj kolejkę audio',
  ai_generate_preview: 'Generuj podgląd',
  ai_full_render: 'Finalny render',
  ai_video_audio_on: 'Audio filmu: włączone',
  ai_video_audio_off: 'Audio filmu: wyłączone',
  ai_video_audio_unavailable: 'Brak audio filmu',
  ai_save_project: 'Zapisz projekt',
  ai_load_project: 'Wczytaj projekt',
  ai_timeline_hint: 'Oś czasu: ustaw offset w ms dla każdej linii napisów. Dodatnie wartości opóźniają start lektora.',
  ai_timeline_col_start: 'Start',
  ai_timeline_col_end: 'Koniec',
  ai_timeline_col_dur: 'Czas',
  ai_timeline_col_offset: 'Offset (ms)',
  ai_timeline_col_rate: 'Tempo',
  ai_timeline_col_status: 'Status',
  ai_timeline_col_text: 'Tekst'
};

function ensureLanguagesDirWithDefaults() {
  if (!fs.existsSync(LANGUAGES_DIR)) fs.mkdirSync(LANGUAGES_DIR, { recursive: true });

  const enPath = path.join(LANGUAGES_DIR, 'en.json');
  const plPath = path.join(LANGUAGES_DIR, 'pl.json');

  if (!fs.existsSync(enPath)) {
    fs.writeFileSync(enPath, JSON.stringify(DEFAULT_EN_TRANSLATIONS, null, 2), { encoding: 'utf8' });
  }
  if (!fs.existsSync(plPath)) {
    fs.writeFileSync(plPath, JSON.stringify(DEFAULT_PL_TRANSLATIONS, null, 2), { encoding: 'utf8' });
  }
}

function listLanguageFiles() {
  ensureLanguagesDirWithDefaults();
  const files = fs.readdirSync(LANGUAGES_DIR)
    .filter((name) => name.toLowerCase().endsWith('.json'));
  return files
    .map((name) => {
      const code = path.basename(name, '.json').toLowerCase();
      return { code, file: name };
    })
    .filter((x) => /^[a-z]{2,3}(-[a-z]{2})?$/.test(x.code))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function readLanguageFile(code) {
  ensureLanguagesDirWithDefaults();
  const safeCode = String(code || '').trim().toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z]{2})?$/.test(safeCode)) {
    throw new Error('Invalid language code');
  }
  const filePath = path.join(LANGUAGES_DIR, `${safeCode}.json`);
  if (!fs.existsSync(filePath)) throw new Error(`Language file not found: ${safeCode}.json`);
  const raw = fs.readFileSync(filePath, { encoding: 'utf8' });
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Language file must contain a JSON object');
  }
  return parsed;
}

// Early-log buffer — filled before mainWindow exists, drained on window ready
const _earlyLogBuf = [];
function sendLog(msg) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('backend:log', String(msg));
  } else {
    _earlyLogBuf.push(String(msg));
  }
}
function drainEarlyLogs() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  _earlyLogBuf.splice(0).forEach(m => mainWindow.webContents.send('backend:log', m));
}

// ─── Splash window ──────────────────────────────────────────────────────────

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 300,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#09091b',
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
  });
  // Inline splash HTML — no separate file needed.
  const splashHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;user-select:none;
  background:radial-gradient(ellipse 140% 100% at 50% 65%,#071428 0%,#020508 100%);
  font-family:-apple-system,'Segoe UI',sans-serif;color:#e8eaed;-webkit-font-smoothing:antialiased;cursor:default}
.wline{position:fixed;height:1px;pointer-events:none;
  background:linear-gradient(90deg,transparent,rgba(0,210,240,.07),transparent);
  animation:wl linear infinite}
@keyframes wl{from{transform:translateX(-100vw)}to{transform:translateX(100vw)}}
#fish{position:fixed;width:180px;height:108px;cursor:pointer;
  filter:drop-shadow(0 0 7px rgba(255,255,255,.22)) drop-shadow(0 0 20px rgba(0,200,240,.18));
  transition:filter .2s}
#fish:hover{filter:drop-shadow(0 0 10px rgba(255,255,255,.28)) drop-shadow(0 0 34px rgba(0,200,240,.28))}
.tail{transform-origin:34px 54px;animation:tw .52s ease-in-out infinite alternate}
@keyframes tw{from{transform:rotate(-14deg)}to{transform:rotate(14deg)}}
.bubble{position:fixed;border-radius:50%;pointer-events:none;
  border:1.5px solid rgba(0,212,255,.65);background:rgba(0,212,255,.08);
  box-shadow:inset 0 0 4px rgba(0,212,255,.18),0 0 5px rgba(0,212,255,.28);
  animation:bup linear forwards}
@keyframes bup{
  0%{opacity:.85;transform:translateY(0) translateX(0) scale(1)}
  50%{opacity:.55;transform:translateY(-38px) translateX(4px) scale(1.05)}
  100%{opacity:0;transform:translateY(-82px) translateX(-4px) scale(.7)}}
.ui{position:fixed;bottom:0;left:0;right:0;padding:8px 28px 14px;
  background:linear-gradient(transparent,rgba(2,5,8,.97) 30%);text-align:center}
.title{font-size:14px;font-weight:800;letter-spacing:5px;color:#fff;
  text-shadow:0 0 14px rgba(0,200,240,.65)}
.prog-row{display:flex;align-items:center;gap:8px;margin:5px 0 4px}
.bar-wrap{flex:1;height:2px;background:rgba(0,200,240,.1);border-radius:1px;overflow:hidden}
.bar{height:100%;width:0%;background:linear-gradient(90deg,#005f8a,#00c8f0 50%,#4de8ff);
  border-radius:1px;transition:width .45s ease}
.pct{color:#4de8ff;font-size:12px;min-width:36px;text-align:right;font-weight:700}
.status{color:#c8eef8;font-size:12px;min-height:16px;letter-spacing:.3px}
.err{color:#ff6b6b;font-size:12px;margin-top:2px;line-height:1.4}
.quote-wrap{margin-top:6px;padding-top:6px;border-top:1px solid rgba(0,200,240,.12);min-height:38px}
.qt{color:#b8e4f0;font-size:11px;font-style:italic;line-height:1.5;transition:opacity .7s}
.qa{color:#7ab8cc;font-size:10.5px;margin-top:3px;transition:opacity .7s}
</style></head><body>
<div id="bg"></div>
<svg id="fish" viewBox="0 0 180 108" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke-linecap="round">
    <path d="M18 54 C48 34, 84 28, 121 33 C145 36, 160 43, 171 54 C160 65, 145 72, 121 75 C84 80, 48 74, 18 54 Z" fill="rgba(255,255,255,.035)" stroke="rgba(255,255,255,.12)" stroke-width="1.2"/>
    <path d="M20 54 L162 54" stroke="rgba(255,255,255,.86)" stroke-width="5.5"/>
    <g class="tail">
      <path d="M20 54 L8 43" stroke="rgba(255,255,255,.92)" stroke-width="6"/>
      <path d="M20 54 L8 65" stroke="rgba(255,255,255,.92)" stroke-width="6"/>
      <path d="M28 54 L16 37" stroke="rgba(255,255,255,.6)" stroke-width="4"/>
      <path d="M28 54 L16 71" stroke="rgba(255,255,255,.6)" stroke-width="4"/>
    </g>
    <path d="M152 54 Q166 48 174 54 Q166 60 152 54 Z" fill="rgba(255,255,255,.88)" stroke="rgba(255,255,255,.88)" stroke-width="2"/>
    <circle cx="145" cy="49" r="3.2" fill="#0b1220" stroke="rgba(255,255,255,.82)" stroke-width="1.5"/>
    <g stroke="rgba(255,255,255,.96)">
      <path d="M42 54 L42 27" stroke-width="6.5"/>
      <path d="M55 54 L55 35" stroke-width="6.5"/>
      <path d="M68 54 L68 22" stroke-width="6.5"/>
      <path d="M81 54 L81 30" stroke-width="6.5"/>
      <path d="M94 54 L94 18" stroke-width="6.5"/>
      <path d="M107 54 L107 24" stroke-width="6.5"/>
      <path d="M120 54 L120 16" stroke-width="6.5"/>
      <path d="M133 54 L133 28" stroke-width="6.5"/>
    </g>
    <g stroke="rgba(255,255,255,.78)">
      <path d="M42 54 L42 80" stroke-width="5"/>
      <path d="M55 54 L55 73" stroke-width="5"/>
      <path d="M68 54 L68 87" stroke-width="5"/>
      <path d="M81 54 L81 77" stroke-width="5"/>
      <path d="M94 54 L94 90" stroke-width="5"/>
      <path d="M107 54 L107 82" stroke-width="5"/>
      <path d="M120 54 L120 92" stroke-width="5"/>
      <path d="M133 54 L133 76" stroke-width="5"/>
    </g>
    <g stroke="rgba(255,255,255,.28)">
      <path d="M145 54 L145 74" stroke-width="5"/>
      <path d="M156 54 L156 70" stroke-width="5"/>
    </g>
  </g>
</svg>
<div class="ui">
  <div class="title">FIN FISH VOICE</div>
  <div class="prog-row">
    <div class="bar-wrap"><div class="bar" id="prog-bar"></div></div>
    <div class="pct" id="pct">0%</div>
  </div>
  <div class="status" id="status">Starting TTS server\u2026</div>
  <div class="err" id="err"></div>
  <div class="quote-wrap"><div class="qt" id="qt"></div><div class="qa" id="qa"></div></div>
</div>
<script>
/* shimmer lines */
var bg=document.getElementById('bg');
for(var i=0;i<7;i++){var l=document.createElement('div');l.className='wline';
  l.style.cssText='width:'+(50+Math.random()*70)+'vw;top:'+(8+Math.random()*78)+'%;animation-duration:'+(6+Math.random()*12)+'s;animation-delay:'+(Math.random()*10)+'s';
  bg.appendChild(l);}
/* quotes */
var QQ=[
  ['\"A reader lives a thousand lives before he dies.\"','\u2014 George R.R. Martin'],
  ['\"Not all those who wander are lost.\"','\u2014 J.R.R. Tolkien'],
  ['\"A book is a dream that you hold in your hand.\"','\u2014 Neil Gaiman'],
  ['\"There is no friend as loyal as a book.\"','\u2014 Ernest Hemingway'],
  ['\"Books are a uniquely portable magic.\"','\u2014 Stephen King'],
  ['\"The world is a book, and those who do not travel read only one page.\"','\u2014 Saint Augustine'],
  ['\"Words are our most inexhaustible source of magic.\"','\u2014 J.K. Rowling'],
  ['\"So it goes.\"','\u2014 Kurt Vonnegut'],
  ['\"There is no greater agony than bearing an untold story inside you.\"','\u2014 Maya Angelou'],
  ['"Outside of a dog, a book is man\\'s best friend."','\u2014 Groucho Marx'],
  ['\"I took a deep breath and listened to the old brag of my heart: I am, I am, I am.\"','\u2014 Sylvia Plath'],
  ['\"All that is gold does not glitter.\"','\u2014 J.R.R. Tolkien'],
  ['\"The more that you read, the more things you will know.\"','\u2014 Dr. Seuss'],
  ['\"We accept the love we think we deserve.\"','\u2014 Stephen Chbosky'],
  ['"It\\'s the possibility of having a dream come true that makes life interesting."','\u2014 Paulo Coelho'],
  ['\"One must always be careful of books, and what is inside them.\"','\u2014 Cassandra Clare'],
  ['\"I am not afraid of storms, for I am learning how to sail my ship.\"','\u2014 Louisa May Alcott'],
  ['"I am so clever that sometimes I don\\'t understand a single word of what I am saying."','\u2014 Oscar Wilde'],
  ['\"It does not do to dwell on dreams and forget to live.\"','\u2014 J.K. Rowling'],
  ['\"Until I feared I would lose it, I never loved to read.\"','\u2014 Harper Lee']
];
var qi=Math.floor(Math.random()*QQ.length);
var elQt=document.getElementById('qt'),elQa=document.getElementById('qa');
elQt.textContent=QQ[qi][0];elQa.textContent=QQ[qi][1];
setInterval(function(){
  elQt.style.opacity=0;elQa.style.opacity=0;
  setTimeout(function(){qi=(qi+1)%QQ.length;elQt.textContent=QQ[qi][0];elQa.textContent=QQ[qi][1];elQt.style.opacity=1;elQa.style.opacity=1;},650);
},5500);
/* fish random wander */
var fish=document.getElementById('fish');
var W=window.innerWidth,H=window.innerHeight,FW=180,FH=108,MAR=20,BOT=115;
var fx=W/2-FW/2, fy=H/3, angle=Math.random()*Math.PI*2, scared=false, facingLeft=false;
function spawnBubble(){
  if(scared)return;
  var r=fish.getBoundingClientRect();
  var mx=facingLeft?(r.left+r.width*0.03):(r.left+r.width*0.97), my=r.top+r.height*0.54;
  var sz=3+Math.random()*5, dur=1400+Math.random()*1600;
  var b=document.createElement('div');b.className='bubble';
  b.style.cssText='width:'+sz+'px;height:'+sz+'px;left:'+(mx-sz/2)+'px;top:'+(my-sz/2)+'px;animation-duration:'+dur+'ms';
  document.body.appendChild(b);setTimeout(function(){b.remove();},dur);}
setInterval(spawnBubble,700);
function loop(){
  if(!scared){
    /* random drift + billiard-ball wall bounce */
    angle+=(Math.random()-0.5)*0.04;
    var nx=fx+Math.cos(angle)*1.4, ny=fy+Math.sin(angle)*1.4;
    if(nx<=MAR)        {nx=MAR;        if(Math.cos(angle)<0) angle=Math.PI-angle;}
    if(nx>=W-FW-MAR)   {nx=W-FW-MAR;  if(Math.cos(angle)>0) angle=Math.PI-angle;}
    if(ny<=MAR)        {ny=MAR;        if(Math.sin(angle)<0) angle=-angle;}
    if(ny>=H-FH-BOT)   {ny=H-FH-BOT;  if(Math.sin(angle)>0) angle=-angle;}
    fx=nx; fy=ny;
    var fl=Math.cos(angle)<0;
    if(fl!==facingLeft){facingLeft=fl;fish.style.transform=fl?'scaleX(-1)':'';}
    fish.style.left=fx+'px';fish.style.top=fy+'px';}
  requestAnimationFrame(loop);}
fish.style.left=fx+'px';fish.style.top=fy+'px';
loop();
fish.addEventListener('click',function(){
  if(scared)return;
  scared=true;
  var v=8, fa=angle+Math.PI;
  (function flee(){
    v+=0.5;fx+=Math.cos(fa)*v;fy+=Math.sin(fa)*v;
    fish.style.left=fx+'px';fish.style.top=fy+'px';
    if(fx>-200&&fx<W+200&&fy>-200&&fy<H+200){requestAnimationFrame(flee);}
    else{setTimeout(function(){
      fx=W/2+(Math.random()-.5)*200;fy=H/3+(Math.random()-.5)*80;
      angle=Math.random()*Math.PI*2;fish.style.transform='';facingLeft=false;scared=false;
    },2000);}})();});
/* IPC */
var ipc=require('electron').ipcRenderer;
ipc.on('splash:status',  function(_e,m){document.getElementById('status').textContent=m;});
ipc.on('splash:error',   function(_e,m){document.getElementById('err').textContent=m;});
ipc.on('splash:progress',function(_e,p){
  var v=Math.round(p);
  document.getElementById('prog-bar').style.width=v+'%';
  document.getElementById('pct').textContent=v+'%';});
</script></body></html>`;
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml));
  splashWindow.once('ready-to-show', () => splashWindow.show());
  splashWindow.on('closed', () => { splashWindow = null; });
}

function setSplashStatus(msg) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash:status', msg);
  }
  console.log('[splash]', msg);
}
function setSplashError(msg) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash:error', msg);
  }
  console.error('[splash:error]', msg);
}
function setSplashProgress(pct) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const send = () => {
    if (splashWindow && !splashWindow.isDestroyed())
      splashWindow.webContents.send('splash:progress', pct);
  };
  if (splashWindow.webContents.isLoading()) {
    splashWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

// ─── s2_server.py spawn ────────────────────────────────────────────────────

function getProjectPython() {
  return LOCAL_VENV_PYTHON;
}

function startS2Server() {
  const py = getProjectPython();
  if (!fs.existsSync(py)) {
    setSplashError(`Local project venv not found: ${py}\n` +
                   `Run .\\install.ps1 to create .\\venv.`);
    throw new Error('Local project venv not found: ' + py);
  }
  if (!fs.existsSync(S2_SERVER_PY)) {
    setSplashError('s2_server.py not found: ' + S2_SERVER_PY);
    throw new Error('s2_server.py not found: ' + S2_SERVER_PY);
  }

  console.log('[s2] Spawn:', py, S2_SERVER_PY);
  sendLog('[s2] Spawning s2_server.py...');
  s2Proc = spawn(py, [S2_SERVER_PY], {
    cwd: PYTHON_SCRIPTS_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8:replace',
      PYTHONUNBUFFERED: '1',
      PYTHONUTF8: '1',
      // server config (can be overridden by user environment)
      S2_HOST: process.env.S2_HOST || S2_HOST,
      S2_PORT: process.env.S2_PORT || String(S2_PORT),
      S2_BNB_MODE: process.env.S2_BNB_MODE || 'nf4',
      S2_PRECISION: process.env.S2_PRECISION || 'float16',
      S2_ATTENTION: process.env.S2_ATTENTION || 'sage_attention',
      S2_DEVICE: process.env.S2_DEVICE || 'cuda',
      S2_COMPILE: process.env.S2_COMPILE || '1',
      // Explicit model path - prefer s2-pro-BnB-4Bits if present
      S2_MODEL_PATH: (() => {
        if (process.env.S2_MODEL_PATH) return process.env.S2_MODEL_PATH;
        const bnbDir  = path.join(INSTALL_DIR, 'models', 's2-pro-BnB-4Bits');
        const hasFiles = fs.existsSync(bnbDir) &&
          fs.readdirSync(bnbDir).some(f => /\.(pth|safetensors|ckpt|bin)$/i.test(f));
        return hasFiles ? bnbDir : path.join(INSTALL_DIR, 'models', 's2-pro');
      })(),
    },
  });

  s2Proc.stdout.setEncoding('utf-8');
  s2Proc.stderr.setEncoding('utf-8');

  let lastInfoLine = '';
  s2Proc.stdout.on('data', (chunk) => {
    const lines = String(chunk).split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      console.log('[s2-stdout]', line);
      // Forward to renderer log panel
      sendLog('[s2] ' + line);
      const m = line.match(/\[INFO\][^:]*:\s*(.+)$/);
      if (m) {
        lastInfoLine = m[1].slice(0, 100);
        setSplashStatus(lastInfoLine);
      }
    }
  });
  s2Proc.stderr.on('data', (chunk) => {
    const s = String(chunk);
    console.error('[s2-stderr]', s);
    sendLog('[s2-err] ' + s);
  });
  s2Proc.on('exit', (code, sig) => {
    console.warn('[s2] exited code=', code, 'sig=', sig);
    s2Proc = null;
    sendLog(`[s2 server exited, code=${code}, signal=${sig}]`);
    // If exited before main window opened — show error on splash
    if (splashWindow && !splashWindow.isDestroyed()) {
      setSplashError(`s2_server.py exited (code=${code}). ` +
                     `Check the developer console / previous log.`);
    }
  });
  s2Proc.on('error', (err) => {
    console.error('[s2] spawn error:', err);
    setSplashError('Failed to start s2_server.py: ' + err.message);
  });
}

function pollHealth() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    // Immediately reject Promise if s2Proc crashes while waiting
    const onEarlyExit = (code, sig) => {
      reject(new Error(`s2_server.py crashed during model load (code=${code}, sig=${sig})`));
    };
    if (s2Proc) s2Proc.once('exit', onEarlyExit);
    const cleanup = () => { if (s2Proc) s2Proc.removeListener('exit', onEarlyExit); };
    const tick = () => {
      const req = http.get(S2_HEALTH_URL, { timeout: 2000 }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('[s2] healthy:', body);
            cleanup();
            resolve(body);
          } else {
            scheduleNext();
          }
        });
      });
      req.on('error', () => scheduleNext());
      req.on('timeout', () => { req.destroy(); scheduleNext(); });
    };
    const scheduleNext = () => {
      if (Date.now() - t0 > S2_HEALTH_TIMEOUT_MS) {
        cleanup();
        return reject(new Error(
          `Timeout: s2_server.py did not respond within ${S2_HEALTH_TIMEOUT_MS / 1000}s`));
      }
      if (s2Proc === null) {
        cleanup();
        return reject(new Error('s2_server.py exited before health check'));
      }
      setTimeout(tick, S2_HEALTH_POLL_MS);
    };
    tick();
  });
}

// ─── python_backend.py spawn (JSON-RPC) ─────────────────────────────────────

function getBackendLaunchConfig() {
  if (app.isPackaged) {
    // Installed mode: use local venv + python_backend.py from resources
    const scriptPath = path.join(process.resourcesPath, 'python_backend.py');
    if (fs.existsSync(LOCAL_VENV_PYTHON)) {
      return { command: LOCAL_VENV_PYTHON, args: [scriptPath], mode: 'local-venv' };
    }
    // Fallback: compiled exe (if pyinstaller build was created)
    const exePath = path.join(process.resourcesPath, 'python_backend.exe');
    if (fs.existsSync(exePath)) {
      return { command: exePath, args: [], mode: 'bundled' };
    }
  }
  // Dev mode: local project venv only
  const scriptPath = path.join(__dirname, 'python_backend.py');
  const py = getProjectPython();
  if (fs.existsSync(py)) {
    return { command: py, args: [scriptPath], mode: 'local-venv' };
  }
  throw new Error(`Local project venv not found: ${py}. Run .\\install.ps1.`);
}

function startPythonBackend() {
  const backend = getBackendLaunchConfig();
  console.log('[main] Backend:', backend.mode, backend.command, backend.args);

  pyProc = spawn(backend.command, backend.args, {
    cwd: PYTHON_SCRIPTS_DIR,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8:replace',
      PYTHONUNBUFFERED: '1',
      PYTHONUTF8: '1',
    },
  });

  if (pyProc.stdin) pyProc.stdin.setEncoding('utf-8');
  pyProc.stdout.setEncoding('utf-8');
  pyProc.stderr.setEncoding('utf-8');

  pyProc.stdout.on('data', (chunk) => {
    pyBuffer += String(chunk);
    let nl;
    while ((nl = pyBuffer.indexOf('\n')) >= 0) {
      const line = pyBuffer.slice(0, nl).trim();
      pyBuffer = pyBuffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        handlePythonMessage(msg);
      } catch (e) {
        console.warn('[py-non-json]', line);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend:log', line);
        }
      }
    }
  });

  pyProc.stderr.on('data', (chunk) => {
    const s = String(chunk);
    console.error('[py-stderr]', s);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend:log', '[stderr] ' + s);
    }
  });

  pyProc.on('exit', (code) => {
    console.warn('[py] exited code=', code);
    sendLog(`[Python backend exited, code=${code}]`);
    pyProc = null;
  });

  pyProc.on('error', (err) => {
    console.error('[py] spawn error:', err);
    sendLog('[ERROR] python_backend failed to start: ' + err.message);
  });
}

function handlePythonMessage(msg) {
  if (msg.id !== undefined && pendingRequests.has(msg.id)) {
    const { resolve, reject } = pendingRequests.get(msg.id);
    pendingRequests.delete(msg.id);
    if (msg.error) reject(new Error(msg.error));
    else resolve(msg.result);
    return;
  }
  if (msg.event && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('backend:event', msg);
  }
}

function pyCall(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!pyProc || !pyProc.stdin || !pyProc.stdin.writable) {
      reject(new Error('Python backend is not running.'));
      return;
    }
    const id = nextRequestId++;
    pendingRequests.set(id, { resolve, reject });
    const payload = JSON.stringify({ id, method, params }) + '\n';
    if (!pyProc.stdin.write(payload, 'utf-8')) {
      console.warn('[pyCall] backpressure detected');
    }
  });
}

// ─── Main window ────────────────────────────────────────────────────────────

function createMainWindow() {
  const { height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: 1360,
    height: screenH,
    minWidth: 1360,
    minHeight: screenH,
    maxWidth: 1360,
    maxHeight: screenH,
    resizable: false,
    backgroundColor: '#0f0f12',
    title: 'Fin Fish Voice',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.removeMenu();

  // Shortcuts: F5/Ctrl+R = reload UI
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
        event.preventDefault();
        mainWindow.webContents.reload();
      }
    }
  });

  mainWindow.webContents.on('console-message', (_evt, level, message, line, sourceId) => {
    const tag = ['LOG','WARN','ERR'][Math.min(level, 2)] || 'LOG';
    console.log(`[renderer:${tag}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.loadFile('renderer.html');
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    // Drain any buffered log messages collected before window was ready
    setTimeout(drainEarlyLogs, 400);
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Gemini prepare (kept unchanged) ────────────────────────────────────────

function buildPromptForGemini(userPrompt, chapters) {
  const normalized = Array.isArray(chapters) ? chapters : [];
  const source = normalized.map((ch, i) => {
    const title = String(ch?.title || `Section ${i + 1}`).trim();
    const text = String(ch?.text || '');
    return `## ${title}\n${text}`;
  }).join('\n\n');
  return [
    String(userPrompt || '').trim(),
    '',
    '---',
    'BOOK SOURCE MATERIAL:',
    source,
  ].join('\n');
}

async function callGeminiPrepare({ apiKey, prompt, chapters, model }) {
  const payload = {
    contents: [{ role: 'user', parts: [{ text: buildPromptForGemini(prompt, chapters) }] }],
    generationConfig: { temperature: 0.35, topP: 0.9 },
  };
  const fallbackModels = ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash-latest'];
  const modelCandidates = model ? [model, ...fallbackModels.filter(m => m !== model)] : fallbackModels;
  let lastErr = null;
  for (const m of modelCandidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const errText = await res.text();
      lastErr = new Error(`Gemini HTTP ${res.status} [${m}]: ${errText.slice(0, 600)}`);
      if (res.status === 404) continue;
      throw lastErr;
    }
    const data = await res.json();
    const text = (data?.candidates || []).flatMap((c) => c?.content?.parts || [])
      .map((p) => p?.text || '').join('\n').trim();
    if (!text) { lastErr = new Error(`Gemini ${m} empty result`); continue; }
    return { text, model: m };
  }
  throw lastErr || new Error('Gemini returned no content.');
}

// ─── Audiobook player backend (scan + covers) ─────────────────────────────

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.flac', '.ogg']);
const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'Cover.jpg', 'Cover.jpeg', 'Cover.png'];

function assertPathInside(baseDir, targetPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  if (!resolvedTarget.startsWith(resolvedBase)) {
    throw new Error('Unsafe path outside audiobooks root.');
  }
  return resolvedTarget;
}

function naturalSort(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

async function findCoverInBookDir(bookDir) {
  for (const name of COVER_NAMES) {
    const full = path.join(bookDir, name);
    try {
      await fs.promises.access(full, fs.constants.R_OK);
      return full;
    } catch (_) {}
  }
  return null;
}

async function downloadFile(url, outPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FinFishVoice/0.1' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  await fs.promises.writeFile(outPath, Buffer.from(arr));
}

async function fetchCoverForBookTitle(bookTitle, bookDir) {
  const query = encodeURIComponent(String(bookTitle || '').replace(/[_-]+/g, ' ').trim());
  if (!query) return null;
  const searchUrl = `https://openlibrary.org/search.json?title=${query}&limit=1`;
  const resp = await fetch(searchUrl, {
    headers: { 'User-Agent': 'FinFishVoice/0.1' },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const coverId = data?.docs?.[0]?.cover_i;
  if (!coverId) return null;
  const coverUrl = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
  const outPath = path.join(bookDir, 'cover.jpg');
  await downloadFile(coverUrl, outPath);
  return outPath;
}

async function scanAudiobooksTree(audiobooksRoot) {
  const root = path.resolve(audiobooksRoot);
  const dirEntries = await fs.promises.readdir(root, { withFileTypes: true });
  const bookDirs = dirEntries.filter(d => d.isDirectory()).map(d => d.name).sort(naturalSort);
  const books = [];

  for (const bookName of bookDirs) {
    const bookDir = assertPathInside(root, path.join(root, bookName));
    const sectionEntries = await fs.promises.readdir(bookDir, { withFileTypes: true });
    const sectionNames = sectionEntries.filter(d => d.isDirectory()).map(d => d.name).sort(naturalSort);
    const sections = [];
    let totalTracks = 0;

    for (const sectionName of sectionNames) {
      const sectionDir = assertPathInside(bookDir, path.join(bookDir, sectionName));
      const trackEntries = await fs.promises.readdir(sectionDir, { withFileTypes: true });
      const tracks = trackEntries
        .filter(d => d.isFile())
        .map(d => d.name)
        .filter(name => AUDIO_EXTS.has(path.extname(name).toLowerCase()))
        .sort(naturalSort)
        .map(name => {
          const abs = assertPathInside(sectionDir, path.join(sectionDir, name));
          return {
            name,
            path: abs,
            url: pathToFileURL(abs).href,
          };
        });

      if (tracks.length > 0) {
        totalTracks += tracks.length;
        sections.push({
          name: sectionName,
          path: sectionDir,
          tracks,
        });
      }
    }

    if (sections.length === 0) continue;

    let coverPath = await findCoverInBookDir(bookDir);
    if (!coverPath) {
      try {
        coverPath = await fetchCoverForBookTitle(bookName, bookDir);
      } catch (_) {
        coverPath = null;
      }
    }

    books.push({
      title: bookName,
      path: bookDir,
      coverPath: coverPath || null,
      coverUrl: coverPath ? pathToFileURL(coverPath).href : null,
      sections,
      totalTracks,
    });
  }

  return { root, books };
}

// ─── IPC handlers ───────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async (_evt, opts) => {
  const dialogOpts = {
    properties: ['openFile'],
    filters: opts?.filters || [
      { name: 'Books', extensions: ['epub', 'pdf', 'txt'] },
      { name: 'All files', extensions: ['*'] },
    ],
  };
  if (opts?.defaultPath) dialogOpts.defaultPath = opts.defaultPath;
  const result = await dialog.showOpenDialog(mainWindow, dialogOpts);
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:openDirectory', async (_evt, opts) => {
  const dialogOpts = { properties: ['openDirectory'] };
  if (opts?.defaultPath) dialogOpts.defaultPath = opts.defaultPath;
  const result = await dialog.showOpenDialog(mainWindow, dialogOpts);
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_evt, opts) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: opts?.defaultPath || 'audiobook.wav',
    filters: opts?.filters || [{ name: 'WAV', extensions: ['wav'] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('shell:openFile', async (_evt, p) => shell.openPath(p));

ipcMain.handle('fs:readText', async (_evt, p) => {
  const filePath = String(p || '').trim();
  if (!filePath) throw new Error('Missing path');
  return fs.readFileSync(filePath, { encoding: 'utf8' });
});

ipcMain.handle('fs:writeText', async (_evt, payload) => {
  const filePath = String(payload?.path || '').trim();
  const text = String(payload?.text || '');
  if (!filePath) throw new Error('Missing path');
  fs.writeFileSync(filePath, text, { encoding: 'utf8' });
  return { ok: true };
});

ipcMain.handle('config:getDefaultWorkdir', async () => {
  // Installed mode: install dir (<InstallDir>)
  // Dev mode: project dir (__dirname)
  return INSTALL_DIR;
});
ipcMain.handle('shell:openFolder', async (_evt, p) => shell.openPath(p));

ipcMain.handle('window:reload', async () => {
  // UI reload only — TTS server and python_backend stay alive.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reload();
  }
});

ipcMain.handle('py:call', async (_evt, method, params) => pyCall(method, params));

ipcMain.handle('gemini:prepareBook', async (_evt, payload) => {
  const apiKey = String(payload?.apiKey || '').trim();
  const prompt = String(payload?.prompt || '').trim();
  const bookPath = String(payload?.bookPath || '').trim();
  const outputFileNameRaw = String(payload?.outputFileName || '').trim();
  const modelOverride = String(payload?.model || '').trim();
  const outputPathOverride = String(payload?.outputPath || '').trim();
  if (!apiKey) throw new Error('Missing Gemini API key.');
  if (!prompt) throw new Error('Missing Gemini prompt.');
  if (!bookPath) throw new Error('Missing book path.');
  const loaded = await pyCall('load_book', { path: bookPath });
  const chapters = loaded?.chapters || [];
  if (!Array.isArray(chapters) || chapters.length === 0)
    throw new Error('Failed to read book content.');
  const aiResult = await callGeminiPrepare({ apiKey, prompt, chapters, model: modelOverride });
  const aiText = aiResult.text;
  let outputPath;
  if (outputPathOverride) {
    outputPath = outputPathOverride;
  } else {
    const dir = path.dirname(bookPath);
    const baseName = path.basename(bookPath, path.extname(bookPath));
    const safeName = (outputFileNameRaw || `${baseName}_tagged.txt`)
      .replace(/[<>:"/\\|?*]+/g, '_').trim();
    outputPath = path.join(dir, safeName.endsWith('.txt') ? safeName : `${safeName}.txt`);
  }
  fs.writeFileSync(outputPath, aiText, { encoding: 'utf8' });
  return { outputPath, size: Buffer.byteLength(aiText, 'utf8'), model: aiResult.model };
});

ipcMain.handle('audiobooks:scan', async (_evt, payload) => {
  const requestedRoot = String(payload?.root || '').trim();
  const fallbackRoot = path.join(INSTALL_DIR, 'audiobooks');
  const root = requestedRoot || fallbackRoot;
  const resolved = path.resolve(root);
  if (!fs.existsSync(resolved)) {
    return { root: resolved, books: [] };
  }
  return scanAudiobooksTree(resolved);
});

ipcMain.handle('i18n:listLanguages', async () => {
  const languages = listLanguageFiles();
  return { languages, defaultLanguage: 'en' };
});

ipcMain.handle('i18n:readLanguage', async (_evt, code) => {
  const translations = readLanguageFile(code);
  return { code: String(code || '').toLowerCase(), translations };
});

// ─── Models manager IPC ─────────────────────────────────────────────────────

ipcMain.handle('models:getLocalStatus', async (_evt, modelKey) => {
  const { dirName } = modelEntry(modelKey || 's2pro');
  const modelsDir = path.join(INSTALL_DIR, 'models', dirName);
  try {
    if (!fs.existsSync(modelsDir)) return { installed: false, files: [], dir: modelsDir };
    const files = fs.readdirSync(modelsDir).map(f => {
      const stat = fs.statSync(path.join(modelsDir, f));
      return { name: f, size: stat.size };
    });
    const hasModel = files.some(f => /\.(pth|safetensors|ckpt|bin)$/i.test(f.name));
    const hasCodec = files.some(f => /codec|firefly|decoder|vocoder/i.test(f.name));
    return { installed: hasModel && hasCodec, hasModel, hasCodec, files, dir: modelsDir };
  } catch (e) {
    return { installed: false, error: e.message, files: [], dir: modelsDir };
  }
});

ipcMain.handle('models:listRemote', async (_evt, modelKey) => {
  const { repo } = modelEntry(modelKey || 's2pro');
  return new Promise((resolve, reject) => {
    const req = https.get(
      `${HF_BASE}/api/models/${repo}`,
      { headers: { 'User-Agent': 'AudiobookGenerator/3.1' } },
      (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            const files = (data.siblings || []).map(s => ({ name: s.rfilename, size: s.size || 0 }));
            resolve(files);
          } catch (e) { reject(new Error('HF API parse error: ' + e.message)); }
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
      req.setTimeout(20000, () => { req.destroy(); reject(new Error('HF file list timeout')); });
  });
});

ipcMain.handle('models:startDownload', async (_evt, { filename, modelKey }) => {
  const { repo, dirName } = modelEntry(modelKey || 's2pro');
  const modelsDir = path.join(INSTALL_DIR, 'models', dirName);
  if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });
  const targetPath = path.join(modelsDir, filename);
  const repoToUse  = repo;
  const downloadUrl = `${HF_BASE}/${repoToUse}/resolve/main/${encodeURIComponent(filename)}`;
  _dlController = { cancelled: false };
  const ctrl = _dlController;

  return new Promise((resolve, reject) => {
    const doGet = (u, depth = 0, baseUrl = null) => {
      if (depth > 6)      return reject(new Error('Too many redirects'));
      if (ctrl.cancelled) return reject(new Error('Cancelled'));
      // Resolve relative URLs (e.g. /resolve/... instead of https://...)
      let resolvedUrl = u;
      if (u && !u.match(/^https?:\/\//i)) {
        resolvedUrl = baseUrl ? new URL(u, baseUrl).toString() : `${HF_BASE}${u.startsWith('/') ? '' : '/'}${u}`;
      }
      let parsedUrl;
      try { parsedUrl = new URL(resolvedUrl); }
      catch (e) { return reject(new Error(`Invalid redirect URL: ${resolvedUrl}`)); }
      const mod = parsedUrl.protocol === 'https:' ? https : http;
      const req = mod.get(resolvedUrl, { headers: { 'User-Agent': 'AudiobookGenerator/3.1' } }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          res.resume();
          doGet(res.headers.location, depth + 1, resolvedUrl);
          return;
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const totalSize = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0, lastSent = 0;
        const tmpPath = targetPath + '.tmp';
        const ws = fs.createWriteStream(tmpPath);
        ctrl.req = req;
        res.on('data', (chunk) => {
          if (ctrl.cancelled) { req.destroy(); ws.destroy(); try { fs.unlinkSync(tmpPath); } catch (_) {} return; }
          downloaded += chunk.length;
          const now = Date.now();
          if (now - lastSent > 400) {
            lastSent = now;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('models:progress', {
                filename, downloaded, total: totalSize,
                progress: totalSize > 0 ? downloaded / totalSize : 0
              });
            }
          }
        });
        res.pipe(ws);
        ws.on('finish', () => {
          if (ctrl.cancelled) { try { fs.unlinkSync(tmpPath); } catch (_) {} return; }
          fs.renameSync(tmpPath, targetPath);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('models:progress', {
              filename, downloaded: totalSize || downloaded, total: totalSize || downloaded,
              progress: 1, done: true
            });
          }
          resolve({ ok: true, path: targetPath });
        });
        ws.on('error', (err) => { try { fs.unlinkSync(tmpPath); } catch (_) {} reject(err); });
        res.on('error', (err) => { try { fs.unlinkSync(tmpPath); } catch (_) {} reject(err); });
      });
      req.on('error', reject);
    };
    doGet(downloadUrl);
  });
});

ipcMain.handle('models:cancelDownload', () => {
  if (_dlController) {
    _dlController.cancelled = true;
    try { _dlController.req?.destroy(); } catch (_) {}
    _dlController = null;
  }
});

ipcMain.handle('models:openDir', (_evt, modelKey) => {
  const { dirName } = modelEntry(modelKey || 's2pro');
  const modelsDir = path.join(INSTALL_DIR, 'models', dirName);
  if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });
  shell.openPath(modelsDir);
});

// ─── Lifecycle: kill child processes on close ───────────────────────────────

function killAllChildren() {
  // Keep s2_server.py running in background - model already loaded in VRAM.
  // Do not kill it to avoid waiting 60s on next app restart.
  // Only kill python_backend (lightweight, fast restart).
  for (const [name, proc] of [['py', pyProc]]) {
    if (!proc) continue;
    try {
      console.log(`[kill] ${name} pid=${proc.pid}`);
      if (proc.stdin && !proc.stdin.destroyed) {
        try { proc.stdin.end(); } catch (_) {}
      }
      proc.kill();
    } catch (e) {
      console.warn(`[kill] ${name} error:`, e.message);
    }
  }
  pyProc = null;
  // s2Proc is intentionally not cleared - it keeps running in background
}

// ─── Boot sequence ──────────────────────────────────────────────────────────

// Silence harmless DevTools Protocol errors about missing Autofill command
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication');

const MIN_SPLASH_MS = 3000;
let splashOpenTime = 0;

app.whenReady().then(async () => {
  ensureLanguagesDirWithDefaults();
  createSplash();
  splashOpenTime = Date.now();

  try {
    // Check whether s2_server is already running (left from previous session)
    setSplashStatus('Checking if TTS server is already running…');
    let alreadyRunning = false;
    try {
      const quickCheck = await new Promise((res, rej) => {
        const req = http.get(S2_HEALTH_URL, { timeout: 3000 }, (r) => {
          let b = ''; r.on('data', c => b += c);
          r.on('end', () => res(r.statusCode === 200 ? b : null));
        });
        req.on('error', rej);
        req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
      });
      if (quickCheck) {
        alreadyRunning = true;
        console.log('[main] s2_server already running — skipping spawn:', quickCheck);
        setSplashStatus('TTS server already loaded in VRAM — quick start!');
        setSplashProgress(100);
      }
    } catch (_) { /* not running - start normally */ }

    if (!alreadyRunning) {
      setSplashStatus('Starting TTS server (s2_server.py)…');
      startS2Server();
      setSplashStatus('Loading model into VRAM… (~30–90 s)');
      const progT0 = Date.now();
      const progInterval = setInterval(() => {
        const elapsed = Date.now() - progT0;
        // asymptotic curve: fast at start, slows near 95%
        const pct = 95 * (1 - Math.exp(-elapsed / 50000));
        setSplashProgress(Math.round(pct));
      }, 800);
      try {
        const healthBody = await pollHealth();
        clearInterval(progInterval);
        setSplashProgress(100);
        console.log('[main] s2_server health body:', healthBody);
      } catch (err) {
        clearInterval(progInterval);
        throw err;
      }
    }

    setSplashStatus('Server ready. Launching UI…');

    const splashElapsed = Date.now() - splashOpenTime;
    if (splashElapsed < MIN_SPLASH_MS) {
      await new Promise(r => setTimeout(r, MIN_SPLASH_MS - splashElapsed));
    }

    startPythonBackend();
    createMainWindow();
  } catch (err) {
    console.error('[boot] Failed:', err);
    setSplashError(err.message);
    // Keep splash open with message for 5 s, then quit app
    setTimeout(() => app.quit(), 5000);
  }
});

app.on('window-all-closed', () => {
  killAllChildren();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  killAllChildren();
  // s2_server.py keeps running in background (model in VRAM)
  // On next launch, app will detect it via healthcheck
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && pyProc && s2Proc) {
    createMainWindow();
  }
});
