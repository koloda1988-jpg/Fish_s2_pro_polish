@echo off
REM ─── start_app.bat — jednoklikowy launcher ────────────────────────────────
REM Uruchamia Electron app (wersja 3) ktora sama spawnuje s2_server.py
REM (Fish-Speech S2-Pro NF4) jako podproces, czeka na cold load modelu,
REM po czym otwiera glowne okno aplikacji.
REM
REM Wymagania (jednorazowo):
REM  - Node.js 18+ z npm (do `npm install`)
REM  - Lokalne venv projektu: .\venv\  (utworz przez .\install.ps1)
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

if not exist "venv\Scripts\python.exe" (
    echo [BLAD] Brak lokalnego venv w .\venv\
    echo [INFO] Uruchom najpierw .\install.ps1
    pause
    exit /b 1
)

echo Uruchamiam Audiobook Generator (Electron + s2_server.py)...
echo.
call npm start

echo.
echo ─── Aplikacja zakonczyla prace ──────────────────────────
pause
