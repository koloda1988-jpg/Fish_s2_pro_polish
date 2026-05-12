// main.js — Electron main process (v3 z s2_server.py)
//
// Co robi:
// 1) Spawnuje `s2_server.py` (TTS HTTP, port 8080) w venv ComfyUI
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

// ─── Konfiguracja ───────────────────────────────────────────────────────────

// Domyślna ścieżka do venv ComfyUI (Stability Matrix). Można nadpisać przez
// env var COMFYUI_PYTHON.
const DEFAULT_COMFY_PYTHON = 'E:\\StabilityMatrix\\Packages\\ComfyUI\\venv\\Scripts\\python.exe';

// s2_server.py lezy w tym samym katalogu co main.js (struktura splaszczona).
const PROJECT_DIR = __dirname;  // po splaszczeniu: apka i s2_server.py w tym samym katalogu
const S2_SERVER_PY = path.join(PROJECT_DIR, 's2_server.py');

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

function getComfyPython() {
  return process.env.COMFYUI_PYTHON || DEFAULT_COMFY_PYTHON;
}

function startS2Server() {
  const py = getComfyPython();
  if (!fs.existsSync(py)) {
    setSplashError(`Nie znaleziono Pythona venv ComfyUI: ${py}\n` +
                   `Ustaw env var COMFYUI_PYTHON na pełną ścieżkę.`);
    throw new Error('Brak Pythona venv ComfyUI: ' + py);
  }
  if (!fs.existsSync(S2_SERVER_PY)) {
    setSplashError('Nie znaleziono s2_server.py: ' + S2_SERVER_PY);
    throw new Error('Brak s2_server.py: ' + S2_SERVER_PY);
  }

  console.log('[s2] Spawn:', py, S2_SERVER_PY);
  s2Proc = spawn(py, [S2_SERVER_PY], {
    cwd: PROJECT_DIR,
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
    const tick = () => {
      const req = http.get(S2_HEALTH_URL, { timeout: 2000 }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('[s2] healthy:', body);
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
        return reject(new Error(
          `Timeout: s2_server.py nie odpowiedział w ${S2_HEALTH_TIMEOUT_MS / 1000}s`));
      }
      if (s2Proc === null) {
        return reject(new Error('s2_server.py zakończył pracę przed health-checkiem'));
      }
      setTimeout(tick, S2_HEALTH_POLL_MS);
    };
    tick();
  });
}

// ─── python_backend.py spawn (JSON-RPC) ─────────────────────────────────────

function getBackendLaunchConfig() {
  // W trybie packaged używamy bundled exe, w dev preferujemy venv ComfyUI
  // (ten sam Python ma wszystkie zależności jak s2_server: aiohttp, ebooklib,
  // pypdf, beautifulsoup itp.)
  if (app.isPackaged) {
    const exePath = path.join(process.resourcesPath, 'python_backend.exe');
    if (fs.existsSync(exePath)) {
      return { command: exePath, args: [], mode: 'bundled' };
    }
  }
  const scriptPath = path.join(__dirname, 'python_backend.py');
  const py = getComfyPython();
  if (fs.existsSync(py)) {
    return { command: py, args: [scriptPath], mode: 'comfy-venv' };
  }
  // fallback: systemowy Python
  if (process.platform === 'win32') {
    return { command: 'py', args: ['-3', scriptPath], mode: 'system-python' };
  }
  return { command: 'python3', args: [scriptPath], mode: 'system-python' };
}

function startPythonBackend() {
  const backend = getBackendLaunchConfig();
  console.log('[main] Backend:', backend.mode, backend.command, backend.args);

  pyProc = spawn(backend.command, backend.args, {
    cwd: __dirname,
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
  // Po splaszczeniu struktury, katalog programu = katalog main.js = katalog projektu.
  return PROJECT_DIR;
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
