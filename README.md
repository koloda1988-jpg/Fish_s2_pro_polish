# Wersja 3 — pelnoprawna aplikacja Windows

Electron GUI (jak w `electron/`) + Python backend + server-pipeline z `wersja 2/`
(asyncio + aiohttp, model raz w VRAM przez s2.cpp `--server`).

## Pierwsze uruchomienie - zbuduj exe

**Wymagania jednorazowe:** Python 3.10+ i Node.js 18+

```powershell
cd "folder projektu"
build_full.bat
```

Skrypt:
1. Sprawdza czy masz Pythona i Node.js
2. Robi `npm install` (raz, pobiera Electron + electron-builder)
3. Buduje `python_backend.exe` (PyInstaller, z aiohttp + server_pipeline.py)
4. Buduje portable `dist\AudiobookGenerator-3.0.0-portable.exe` (samowystarczalny)

W `dist/` powstanie **jeden plik exe** z wszystkim w środku.

## Codzienne uzycie

**Krok 1 — uruchom serwer s2.cpp** (model raz w VRAM):

```powershell
start_server.bat
```

Zostaw to okno otwarte. Model `s2-pro-q8_0.gguf` ladowany jest raz, czeka pod
`http://127.0.0.1:8080`.

**Krok 2 — odpal aplikację**:

Dwuklik na `dist\AudiobookGenerator-3.0.0-portable.exe`.

W interfejsie:
1. **Wybierz plik** ksiazki (PDF/EPUB/TXT)
2. **Workdir** zostaw `K:\FishS2PRo\s2.cpp\build\bin\Release`
3. **Wczytaj i podziel**
4. **W sekcji Server TTS:**
   - URL: `http://127.0.0.1:8080`
   - Endpoint: `/v1/audio/speech`
   - GPU workers: 2 (3-4 jak masz wiecej VRAM)
   - Timeout/req: 1800s (default po naszej naprawie TimeoutError)
   - Reference audio: `sample_glos_macieja.wav`
   - Reference text: `sample_glos_macieja.txt`
   - **"Test serwera"** -> badge powinien zmienic sie na ONLINE
5. Toggle **"Server pipeline"** = ON
6. **"Uruchom"** - jeden request idzie do backendu, ten odpala asyncio pipeline,
   wszystkie fragmenty leca rownolegle (max 2 GPU + CPU prebuild w tle)

## Co robi wersja 3 lepiej niz wersja 2

| Cecha | Wersja 2 (tkinter) | Wersja 3 (Electron) |
|-------|--------------------|--------------------|
| GUI | Stare, podstawowe | Nowoczesne, ladne |
| Server pipeline | TAK (po napr.) | TAK |
| TimeoutError fix | Recznie poprawione | **Domyslnie 1800s + retry** |
| Pakowanie | PyInstaller exe | **Portable Electron exe** (single file) |
| Dystrybucja | 1 exe + folder | 1 exe (samowystarczalny) |

## Architektura

```
[s2.cpp --server]   <-- HTTP -- [python_backend.exe] <-- JSON-RPC -- [Electron UI]
   model w VRAM      multipart   asyncio + aiohttp     stdin/stdout    renderer.html/js
   2 GPU req naraz                pipeline + retry
```

## Pliki

| Plik | Opis |
|------|------|
| `main.js` | Electron main process |
| `preload.js` | contextBridge API |
| `renderer.html/css/js` | UI (z sekcja Server TTS) |
| `python_backend.py` | JSON-RPC backend (rozszerzony o server_run_queue, server_ping) |
| `server_pipeline.py` | aiohttp + asyncio pipeline + retry przy TimeoutError |
| `phonetic_map.json` | Mapowania fonetyczne (JSON) |
| `phonetic_fixes.txt` | Mapowania fonetyczne (TXT, czytelne) |
| `start_server.bat` | Uruchamia s2.exe --server |
| `build_full.bat` | **JEDEN KLIK** - kompletny build aplikacji Windows |
| `package.json` | Electron + electron-builder config |
| `scripts/build-python-backend.js` | PyInstaller dla python_backend.exe |

## Uruchomienie BEZ buildu (tryb dev)

Jezeli nie chcesz robic `.exe` tylko odpalic z node:

```powershell
npm install
npm start
```

Wymaga zainstalowanego Pythona z `aiohttp` (`pip install aiohttp ebooklib pypdf beautifulsoup4`).

## Naprawa: TimeoutError w wersji 2

W `server_pipeline.py` poprawione:
- Default timeout 1800s (30 min) zamiast 300s (5 min)
- **Automatyczny retry** przy TimeoutError (max 2 razy, z mniejszym `gpu_workers`)
- Pelne importy: `sys`, `time`, `wave`, `traceback`, `urllib.request`, `urllib.error`

Te poprawki dotycza wersji 3. W wersji 2 musisz miec analogiczne (juz recznie zrobione).
