// main.js — Electron main process (v3 z s2_server.py)
//
// Co robi:
// 1) Spawnuje `s2_server.py` (TTS HTTP, port 8080) w lokalnym venv projektu
// 2) Pokazuje splash window "Ładowanie modelu..." podczas cold loadu
// 3) Polling GET / aż serwer odpowie 200 (cold load 30-90 s)
// 4) Spawnuje `python_backend.py` (JSON-RPC orchestrator)
// 5) Otwiera main window z renderer.html
// 6) Przy zamykaniu — kill obu podprocesów (tree-kill cascade)

const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');

// ─── Konfiguracja ───────────────────────────────────────────────────────────

// Kiedy apka jest spakowana przez electron-builder:
//   process.resourcesPath  = <InstallDir>\resources
//   INSTALL_DIR            = <InstallDir>             (tu lezy venv\ i models\)
//   PYTHON_SCRIPTS_DIR     = <InstallDir>\resources   (tu extraResources: s2_server.py itp.)
// W trybie dev:
//   INSTALL_DIR = PYTHON_SCRIPTS_DIR = __dirname
const INSTALL_DIR         = app.isPackaged ? path.dirname(process.resourcesPath) : __dirname;
const PYTHON_SCRIPTS_DIR  = app.isPackaged ? process.resourcesPath               : __dirname;
const S2_SERVER_PY        = path.join(PYTHON_SCRIPTS_DIR, 's2_server.py');
const LOCAL_VENV_PYTHON   = path.join(INSTALL_DIR, 'venv', 'Scripts', 'python.exe');

const HF_REPO = 'fishaudio/fish-speech-1.5';
const HF_REPO_BNB = 'groxaxo/s2-pro-BnB-4Bits';
const HF_BASE = 'https://huggingface.co';

// Rejestr dostepnych modeli — klucz uzywa renderer
const MODEL_REGISTRY = {
  's2pro': { repo: HF_REPO,     dirName: 's2-pro' },
  'bnb':   { repo: HF_REPO_BNB, dirName: 's2-pro-BnB-4Bits' },
};
function modelEntry(key) { return MODEL_REGISTRY[key] || MODEL_REGISTRY['s2pro']; }
let _dlController = null;  // kontroler anulowania pobierania modelu

const S2_HOST = '127.0.0.1';
const S2_PORT = 8080;
const S2_HEALTH_URL = `http://${S2_HOST}:${S2_PORT}/`;
const S2_HEALTH_POLL_MS = 1000;
const S2_HEALTH_TIMEOUT_MS = 360_000;  // 6 min na cold load (zimny start po restarcie)

let mainWindow = null;
let splashWindow = null;
let pyProc = null;          // python_backend.py
let s2Proc = null;          // s2_server.py
let pyBuffer = '';
let nextRequestId = 1;
const pendingRequests = new Map();

// ─── Splash window ──────────────────────────────────────────────────────────

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 220,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#0f0f12',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: false },
  });
  // Inline splash HTML — nie zaśmiecamy projektu osobnym plikiem.
  const splashHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  html, body { margin:0; padding:0; height:100%; background:#0f0f12; color:#e8eaed;
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif; overflow:hidden; user-select:none; }
  .wrap { display:flex; flex-direction:column; align-items:center; justify-content:center;
    height:100%; gap:14px; padding:0 24px; text-align:center; }
  h1 { margin:0; font-size:18px; font-weight:600; letter-spacing:.2px; }
  .sub { color:#8a8f99; font-size:13px; }
  .bar { width:100%; height:6px; background:#1f2330; border-radius:3px; overflow:hidden; }
  .bar > div { height:100%; width:30%; background:linear-gradient(90deg,#5b8cff 0%,#8aa9ff 50%,#5b8cff 100%);
    background-size:200% 100%; animation: slide 1.4s linear infinite; border-radius:3px; }
  @keyframes slide {
    0%   { transform: translateX(-100%); background-position:0% 0%; }
    100% { transform: translateX(333%); background-position:200% 0%; }
  }
  .status { color:#aab0bc; font-size:12px; margin-top:6px; min-height:14px; }
  .err { color:#ff6b6b; font-size:11px; max-width:420px; line-height:1.4; }
</style></head>
<body>
  <div class="wrap">
    <h1>Audiobook Generator</h1>
    <div class="sub">Ładowanie modelu Fish Audio S2-Pro (NF4)…</div>
    <div class="bar"><div></div></div>
    <div class="status" id="status">Uruchamiam serwer TTS…</div>
    <div class="err" id="err"></div>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('splash:status', (_e, msg) => {
      document.getElementById('status').textContent = msg;
    });
    ipcRenderer.on('splash:error', (_e, msg) => {
      document.getElementById('err').textContent = msg;
    });
  </script>
</body></html>`;
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

// ─── s2_server.py spawn ────────────────────────────────────────────────────

function getProjectPython() {
  return LOCAL_VENV_PYTHON;
}

function startS2Server() {
  const py = getProjectPython();
  if (!fs.existsSync(py)) {
    setSplashError(`Nie znaleziono lokalnego venv projektu: ${py}\n` +
                   `Uruchom .\\install.ps1, aby utworzyć .\\venv.`);
    throw new Error('Brak lokalnego venv projektu: ' + py);
  }
  if (!fs.existsSync(S2_SERVER_PY)) {
    setSplashError('Nie znaleziono s2_server.py: ' + S2_SERVER_PY);
    throw new Error('Brak s2_server.py: ' + S2_SERVER_PY);
  }

  console.log('[s2] Spawn:', py, S2_SERVER_PY);
  s2Proc = spawn(py, [S2_SERVER_PY], {
    cwd: PYTHON_SCRIPTS_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8:replace',
      PYTHONUNBUFFERED: '1',
      PYTHONUTF8: '1',
      // konfiguracja serwera (mogą zostać nadpisane przez env użytkownika)
      S2_HOST: process.env.S2_HOST || S2_HOST,
      S2_PORT: process.env.S2_PORT || String(S2_PORT),
      S2_BNB_MODE: process.env.S2_BNB_MODE || 'nf4',
      S2_PRECISION: process.env.S2_PRECISION || 'float16',
      S2_ATTENTION: process.env.S2_ATTENTION || 'sage_attention',
      S2_DEVICE: process.env.S2_DEVICE || 'cuda',
      S2_COMPILE: process.env.S2_COMPILE || '1',
      // Jawna ścieżka do modelu — preferuj s2-pro-BnB-4Bits jesli istnieje
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
      // Pokaż na splash co konkretnie się dzieje
      const m = line.match(/\[INFO\][^:]*:\s*(.+)$/);
      if (m) {
        lastInfoLine = m[1].slice(0, 100);
        setSplashStatus(lastInfoLine);
      }
      // Forward na renderer (jeśli main window już istnieje)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backend:log', '[s2] ' + line);
      }
    }
  });
  s2Proc.stderr.on('data', (chunk) => {
    const s = String(chunk);
    console.error('[s2-stderr]', s);
    // wiele linii w stderr to po prostu tqdm/uvicorn — nie alarmujmy
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend:log', '[s2-err] ' + s);
    }
  });
  s2Proc.on('exit', (code, sig) => {
    console.warn('[s2] exited code=', code, 'sig=', sig);
    s2Proc = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend:log',
        `[s2 server zakończył pracę, kod=${code}, sygnał=${sig}]`);
    }
    // Jeśli exited zanim doszło do main window — pokaż błąd na splash
    if (splashWindow && !splashWindow.isDestroyed()) {
      setSplashError(`s2_server.py zakończył pracę (kod=${code}). ` +
                     `Sprawdź konsolę developerską / log poprzedni.`);
    }
  });
  s2Proc.on('error', (err) => {
    console.error('[s2] spawn error:', err);
    setSplashError('Błąd uruchamiania s2_server.py: ' + err.message);
  });
}

function pollHealth() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    // Natychmiastowe odrzucenie Promise gdy s2Proc crashuje podczas oczekiwania
    const onEarlyExit = (code, sig) => {
      reject(new Error(`s2_server.py crashnął podczas ładowania modelu (kod=${code}, sig=${sig})`));
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
          `Timeout: s2_server.py nie odpowiedział w ${S2_HEALTH_TIMEOUT_MS / 1000}s`));
      }
      if (s2Proc === null) {
        cleanup();
        return reject(new Error('s2_server.py zakończył pracę przed health-checkiem'));
      }
      setTimeout(tick, S2_HEALTH_POLL_MS);
    };
    tick();
  });
}

// ─── python_backend.py spawn (JSON-RPC) ─────────────────────────────────────

function getBackendLaunchConfig() {
  if (app.isPackaged) {
    // Tryb zainstalowany: używamy lokalnego venv + python_backend.py z resources
    const scriptPath = path.join(process.resourcesPath, 'python_backend.py');
    if (fs.existsSync(LOCAL_VENV_PYTHON)) {
      return { command: LOCAL_VENV_PYTHON, args: [scriptPath], mode: 'local-venv' };
    }
    // Fallback: skompilowane exe (jeśli pyinstaller build był wykonany)
    const exePath = path.join(process.resourcesPath, 'python_backend.exe');
    if (fs.existsSync(exePath)) {
      return { command: exePath, args: [], mode: 'bundled' };
    }
  }
  // Tryb dev: wyłącznie lokalne venv projektu
  const scriptPath = path.join(__dirname, 'python_backend.py');
  const py = getProjectPython();
  if (fs.existsSync(py)) {
    return { command: py, args: [scriptPath], mode: 'local-venv' };
  }
  throw new Error(`Brak lokalnego venv projektu: ${py}. Uruchom .\\install.ps1.`);
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend:log',
        `[Python backend zakończył pracę, kod=${code}]`);
    }
    pyProc = null;
  });

  pyProc.on('error', (err) => {
    console.error('[py] spawn error:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend:log',
        '[BŁĄD] python_backend nie wystartował: ' + err.message);
    }
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
      reject(new Error('Python backend nie działa.'));
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
    title: 'Audiobook Generator',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.removeMenu();

  // Skroty F5 i Ctrl+R do reload UI (bez restartu serwera)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
        event.preventDefault();
        mainWindow.webContents.reload();
      }
    }
  });

  mainWindow.loadFile('renderer.html');
  mainWindow.webContents.openDevTools({ mode: 'detach' });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Gemini prepare (zachowane bez zmian) ───────────────────────────────────

function buildPromptForGemini(userPrompt, chapters) {
  const normalized = Array.isArray(chapters) ? chapters : [];
  const source = normalized.map((ch, i) => {
    const title = String(ch?.title || `Sekcja ${i + 1}`).trim();
    const text = String(ch?.text || '');
    return `## ${title}\n${text}`;
  }).join('\n\n');
  return [
    String(userPrompt || '').trim(),
    '',
    '---',
    'MATERIAŁ ŹRÓDŁOWY KSIĄŻKI:',
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
    if (!text) { lastErr = new Error(`Gemini ${m} pusty wynik`); continue; }
    return { text, model: m };
  }
  throw lastErr || new Error('Gemini nie zwróciło treści.');
}

// ─── IPC handlers ───────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async (_evt, opts) => {
  const dialogOpts = {
    properties: ['openFile'],
    filters: opts?.filters || [
      { name: 'Książki', extensions: ['epub', 'pdf', 'txt'] },
      { name: 'Wszystkie', extensions: ['*'] },
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

ipcMain.handle('config:getDefaultWorkdir', async () => {
  // W trybie zainstalowanym: katalog instalacji (<InstallDir>)
  // W trybie dev: katalog projektu (__dirname)
  return INSTALL_DIR;
});
ipcMain.handle('shell:openFolder', async (_evt, p) => shell.openPath(p));

ipcMain.handle('window:reload', async () => {
  // Tylko reload renderera — serwer TTS i python_backend zostaja zywe.
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
  if (!apiKey) throw new Error('Brak klucza API Gemini.');
  if (!prompt) throw new Error('Brak promta dla Gemini.');
  if (!bookPath) throw new Error('Brak ścieżki do książki.');
  const loaded = await pyCall('load_book', { path: bookPath });
  const chapters = loaded?.chapters || [];
  if (!Array.isArray(chapters) || chapters.length === 0)
    throw new Error('Nie udało się odczytać treści książki.');
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
          } catch (e) { reject(new Error('Błąd parsowania HF API: ' + e.message)); }
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout listy plików HF')); });
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
      if (depth > 6)      return reject(new Error('Za dużo przekierowań'));
      if (ctrl.cancelled) return reject(new Error('Anulowano'));
      // Rozwiaz relatywne URL-e (np. /resolve/... zamiast https://...)
      let resolvedUrl = u;
      if (u && !u.match(/^https?:\/\//i)) {
        resolvedUrl = baseUrl ? new URL(u, baseUrl).toString() : `${HF_BASE}${u.startsWith('/') ? '' : '/'}${u}`;
      }
      let parsedUrl;
      try { parsedUrl = new URL(resolvedUrl); }
      catch (e) { return reject(new Error(`Nieprawidlowy URL przekierowania: ${resolvedUrl}`)); }
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

// ─── Lifecycle: kill obu podprocesów przy zamknięciu ────────────────────────

function killAllChildren() {
  // s2_server.py zostaje w tle — model już załadowany w VRAM,
  // nie zabijamy go żeby przy restarcie aplikacji nie czekać 60s.
  // Zabijamy tylko python_backend (lekki, szybki restart).
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
  // s2Proc celowo NIE jest kasowany — działa dalej w tle
}

// ─── Boot sequence ──────────────────────────────────────────────────────────

// Wycisz nieszkodliwe błędy DevTools Protocol o brakującej komendzie Autofill
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication');

app.whenReady().then(async () => {
  createSplash();

  try {
    // Sprawdź czy s2_server już działa (zostały z poprzedniej sesji)
    setSplashStatus('Sprawdzam czy serwer TTS już działa...');
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
        console.log('[main] s2_server już działa — pomijam spawn:', quickCheck);
        setSplashStatus('Serwer TTS już załadowany w VRAM — szybki start!');
      }
    } catch (_) { /* nie działa — startujemy normalnie */ }

    if (!alreadyRunning) {
      setSplashStatus('Uruchamiam serwer TTS (s2_server.py)...');
      startS2Server();
      setSplashStatus('Czekam aż model załaduje się do VRAM... (~30-90s)');
      const healthBody = await pollHealth();
      console.log('[main] s2_server health body:', healthBody);
    }

    setSplashStatus('Serwer gotowy. Uruchamiam interfejs...');

    startPythonBackend();
    createMainWindow();
  } catch (err) {
    console.error('[boot] Failed:', err);
    setSplashError(err.message);
    // Zostaw splash otwarty z komunikatem 5 s, potem zamknij apkę
    setTimeout(() => app.quit(), 5000);
  }
});

app.on('window-all-closed', () => {
  killAllChildren();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  killAllChildren();
  // s2_server.py działa dalej w tle (model w VRAM)
  // Przy następnym uruchomieniu aplikacja wykryje go via healthcheck
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && pyProc && s2Proc) {
    createMainWindow();
  }
});
