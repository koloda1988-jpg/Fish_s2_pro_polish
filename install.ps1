# install.ps1 — Jednorazowy setup Audiobook Generator
#
# Co robi:
#   1) Sprawdza wymagania (Node.js, Python 3.10+, npm)
#   2) Instaluje zaleznosci npm (Electron)
#   3) Tworzy lokalne venv Python w katalogu projektu (.\venv\)
#   4) Instaluje zaleznosci Python (requirements.txt + torch + fish_speech)
#   5) Sprawdza/tworzy katalogi: Audiobooks, Files_books, Lectors
#   6) Sprawdza model s2-pro i pokazuje instrukcje jezeli brakuje
#
# UZYCIE:
#   .\install.ps1
#   .\install.ps1 -ModelPath "D:\modele\s2-pro-fp8"  # jezeli masz model gdzie indziej

param(
    [string]$ModelPath = ""   # opcjonalna sciezka do gotowego modelu s2-pro
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Write-Step($n, $msg) {
    Write-Host "`n[$n] $msg" -ForegroundColor Cyan
}
function Write-OK($msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-WARN($msg) { Write-Host "  WARN  $msg" -ForegroundColor Yellow }
function Write-FAIL($msg) { Write-Host "  FAIL  $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Magenta
Write-Host "  Audiobook Generator — instalator" -ForegroundColor Magenta
Write-Host "  Katalog projektu: $Root" -ForegroundColor DarkGray
Write-Host "=====================================================" -ForegroundColor Magenta

# ─── 1. Node.js ─────────────────────────────────────────────────────────────
Write-Step 1 "Sprawdzam Node.js..."
try {
    $nodeVer = node --version 2>&1
    Write-OK "Node.js $nodeVer"
} catch {
    Write-FAIL "Nie znaleziono Node.js. Pobierz z https://nodejs.org/ (wersja 18+)"
    exit 1
}

# ─── 2. Python ──────────────────────────────────────────────────────────────
Write-Step 2 "Sprawdzam Python..."
$pythonExe = $null
foreach ($candidate in @("python", "python3", "py")) {
    try {
        $ver = & $candidate --version 2>&1
        if ($ver -match "Python (\d+)\.(\d+)") {
            $major = [int]$Matches[1]; $minor = [int]$Matches[2]
            if ($major -ge 3 -and $minor -ge 10) {
                $pythonExe = (Get-Command $candidate).Source
                Write-OK "$pythonExe ($ver)"
                break
            }
        }
    } catch {}
}
if (-not $pythonExe) {
    Write-FAIL "Nie znaleziono Python 3.10+. Pobierz z https://www.python.org/"
    exit 1
}

# ─── 3. npm install ─────────────────────────────────────────────────────────
Write-Step 3 "Instaluje zaleznosci npm (Electron)..."
Push-Location $Root
if (-not (Test-Path "node_modules")) {
    npm install
    if ($LASTEXITCODE -ne 0) { Write-FAIL "npm install nieudane"; exit 1 }
    Write-OK "node_modules gotowe"
} else {
    Write-OK "node_modules juz istnieje — pomijam"
}
Pop-Location

# ─── 4. Lokalne venv Python ─────────────────────────────────────────────────
Write-Step 4 "Tworze lokalne venv Python w .\venv\ ..."
$venvDir    = Join-Path $Root "venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    & $pythonExe -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { Write-FAIL "Tworzenie venv nieudane"; exit 1 }
    Write-OK "venv utworzone: $venvDir"
} else {
    Write-OK "venv juz istnieje — pomijam tworzenie"
}

# pip upgrade
& $venvPython -m pip install --upgrade pip --quiet

# ─── 5. Zaleznosci Python ───────────────────────────────────────────────────
Write-Step 5 "Instaluje zaleznosci Python (requirements.txt)..."
$reqFile = Join-Path $Root "requirements.txt"
if (Test-Path $reqFile) {
    & $venvPython -m pip install -r $reqFile --quiet
    if ($LASTEXITCODE -ne 0) { Write-FAIL "pip install requirements.txt nieudane"; exit 1 }
    Write-OK "requirements.txt zainstalowane"
}

# PyTorch (CUDA 12.1) — jezeli nie ma juz torch w venv
Write-Host "    Sprawdzam torch..." -ForegroundColor DarkGray
$torchCheck = & $venvPython -c "import torch; print(torch.__version__)" 2>&1
if ($torchCheck -notmatch "^\d") {
    Write-Host "    Instaluje PyTorch (CUDA 12.1)..." -ForegroundColor DarkGray
    & $venvPython -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121 --quiet
    if ($LASTEXITCODE -ne 0) { Write-WARN "Instalacja torch nieudana — sprawdz polaczenie i wersje CUDA" }
    else { Write-OK "torch zainstalowany" }
} else {
    Write-OK "torch $torchCheck juz zainstalowany"
}

# Fish Speech zaleznosci TTS
Write-Host "    Sprawdzam zaleznosci fish_speech..." -ForegroundColor DarkGray
$fishDeps = @("fastapi", "uvicorn", "soundfile", "numpy", "pydub", "bitsandbytes")
$missingFish = @()
foreach ($pkg in $fishDeps) {
    $check = & $venvPython -c "import $($pkg.Replace('-','_'))" 2>&1
    if ($LASTEXITCODE -ne 0) { $missingFish += $pkg }
}
if ($missingFish.Count -gt 0) {
    Write-Host "    Instaluje: $($missingFish -join ', ')..." -ForegroundColor DarkGray
    & $venvPython -m pip install $missingFish --quiet
    if ($LASTEXITCODE -ne 0) { Write-WARN "Niektore pakiety fish_speech nie zostaly zainstalowane" }
    else { Write-OK "Zaleznosci fish_speech zainstalowane" }
} else {
    Write-OK "Zaleznosci fish_speech OK"
}

# ─── 6. Katalogi projektowe ─────────────────────────────────────────────────
Write-Step 6 "Tworze katalogi projektowe..."
foreach ($dir in @("Audiobooks", "Files_books", "Lectors")) {
    $p = Join-Path $Root $dir
    if (-not (Test-Path $p)) {
        New-Item -ItemType Directory -Path $p | Out-Null
        Write-OK "Utworzono: $dir\"
    } else {
        Write-OK "Istnieje:  $dir\"
    }
}

# ─── 7. Model s2-pro ────────────────────────────────────────────────────────
Write-Step 7 "Sprawdzam model s2-pro..."
$modelDir = Join-Path $Root "models\s2-pro"

if (-not (Test-Path (Join-Path $Root "models"))) {
    New-Item -ItemType Directory -Path (Join-Path $Root "models") | Out-Null
}

if ($ModelPath -and (Test-Path $ModelPath)) {
    # Uzytkownik podal sciezke — tworz junction
    if (Test-Path $modelDir) { Remove-Item $modelDir -Force -Recurse }
    cmd /c mklink /J "$modelDir" "$ModelPath" | Out-Null
    Write-OK "Junction models\s2-pro -> $ModelPath"
} elseif ((Test-Path $modelDir) -and (Get-ChildItem $modelDir -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0) {
    Write-OK "models\s2-pro istnieje i ma pliki"
} else {
    # Brak modelu — pokaz instrukcje
    if (-not (Test-Path $modelDir)) {
        New-Item -ItemType Directory -Path $modelDir | Out-Null
    }
    Write-WARN "Brak modelu w models\s2-pro\"
    Write-Host ""
    Write-Host "  Pobierz model Fish Audio S2-Pro FP8 z Hugging Face:" -ForegroundColor Yellow
    Write-Host "  https://huggingface.co/fishaudio/fish-speech-1.5" -ForegroundColor White
    Write-Host ""
    Write-Host "  Nastepnie:" -ForegroundColor Yellow
    Write-Host "  a) Skopiuj pliki modelu do:  $modelDir" -ForegroundColor White
    Write-Host "  b) Lub ponow instalacje z parametrem:" -ForegroundColor White
    Write-Host "     .\install.ps1 -ModelPath 'D:\twoja\sciezka\s2-pro'" -ForegroundColor White
    Write-Host ""
    Write-Host "  Lub jezeli uzywasz Stability Matrix (ComfyUI node fishaudio):" -ForegroundColor Yellow
    Write-Host "  Uruchom:  .\install.ps1 -ModelPath 'E:\StabilityMatrix\...\s2-pro-fp8'" -ForegroundColor White
}

# ─── Podsumowanie ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=====================================================" -ForegroundColor Magenta
Write-Host "  Instalacja zakonczona!" -ForegroundColor Green
Write-Host ""
Write-Host "  Aby uruchomiec aplikacje:" -ForegroundColor White
Write-Host "    npm start" -ForegroundColor Cyan
Write-Host "  lub kliknij:" -ForegroundColor White
Write-Host "    start_app.bat" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Magenta
Write-Host ""
