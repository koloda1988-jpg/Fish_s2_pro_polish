@echo off
REM ─── start_app.bat — jednoklikowy launcher ────────────────────────────────
REM Uruchamia Electron app (wersja 3) ktora sama spawnuje s2_server.py
REM (Fish-Speech S2-Pro NF4) jako podproces, czeka na cold load modelu,
REM po czym otwiera glowne okno aplikacji.
REM
REM Wymagania (jednorazowo):
REM  - Node.js 18+ z npm (do `npm install`)
REM  - Python 3.12 venv ComfyUI: E:\StabilityMatrix\Packages\ComfyUI\venv\
REM ──────────────────────────────────────────────────────────────────────────

setlocal
cd /d "%~dp0"

if not exist "node_modules" (
    echo [INFO] Pierwsze uruchomienie - instaluje zaleznosci npm...
    call npm install
    if errorlevel 1 (
        echo [BLAD] npm install nie powiodlo sie.
        pause
        exit /b 1
    )
)

REM Mozesz nadpisac sciezke do venv ComfyUI:
REM   set COMFYUI_PYTHON=D:\inny\python.exe

echo Uruchamiam Audiobook Generator (Electron + s2_server.py)...
echo.
call npm start

echo.
echo ─── Aplikacja zakonczyla prace ──────────────────────────
pause
