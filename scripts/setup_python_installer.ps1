# setup_python_installer.ps1 — konfiguracja srodowiska Python
# Uruchamiany automatycznie przez instalator NSIS po skopiowaniu plikow.
# Mozna tez uruchomic recznie: .\resources\setup_python_installer.ps1 -InstallDir "C:\Apps\AudiobookGenerator"

param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDir
)

$Host.UI.RawUI.WindowTitle = "Audiobook Generator — Konfiguracja Python"
$ErrorActionPreference = 'Continue'

function Write-Step { param($n, $msg) Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Write-OK   { param($msg)    Write-Host "  OK: $msg"   -ForegroundColor Green }
function Write-WARN { param($msg)    Write-Host "  WARN: $msg" -ForegroundColor Yellow }
function Write-FAIL { param($msg)    Write-Host "  FAIL: $msg" -ForegroundColor Red }

Write-Host "=============================================" -ForegroundColor Magenta
Write-Host "  Audiobook Generator — Konfiguracja Python" -ForegroundColor White
Write-Host "  Katalog instalacji: $InstallDir"            -ForegroundColor DarkGray
Write-Host "=============================================" -ForegroundColor Magenta

# ─── 1. Znajdz Python 3.10+ ─────────────────────────────────────────────────

Write-Step 1 "Szukam Pythona 3.10+..."

$pythonExe = $null
$candidates = @("python", "python3", "py")

foreach ($cmd in $candidates) {
    try {
        $verLine = & $cmd --version 2>&1
        if ($verLine -match "Python (\d+)\.(\d+)") {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            if ($major -eq 3 -and $minor -ge 10) {
                $resolved = (Get-Command $cmd -ErrorAction SilentlyContinue)
                if ($resolved) {
                    $pythonExe = $resolved.Source
                    Write-OK "Python $major.$minor znaleziony: $pythonExe"
                    break
                }
            }
        }
    } catch { }
}

if (-not $pythonExe) {
    Write-Host ""
    Write-Host "  Python 3.10+ nie znaleziony — probuje zainstalowac automatycznie..." -ForegroundColor Yellow

    # Proba 1: winget (dostepny na Windows 10/11 z App Installer)
    $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetCmd) {
        Write-Host "  winget install Python.Python.3.11..." -ForegroundColor DarkGray
        winget install --id Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
        # Odswiez PATH z rejestru
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                    [System.Environment]::GetEnvironmentVariable("Path","User")
        foreach ($cmd in $candidates) {
            try {
                $v = & $cmd --version 2>&1
                if ($v -match "Python (\d+)\.(\d+)" -and [int]$Matches[1] -eq 3 -and [int]$Matches[2] -ge 10) {
                    $r = (Get-Command $cmd -ErrorAction SilentlyContinue)
                    if ($r) { $pythonExe = $r.Source; Write-OK "Python $($Matches[1]).$($Matches[2]) zainstalowany przez winget: $pythonExe"; break }
                }
            } catch {}
        }
    }

    # Proba 2: bezposrednie pobranie instalatora z python.org
    if (-not $pythonExe) {
        $pyUrl = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
        $pyTmp = "$env:TEMP\python-3.11.9-amd64.exe"
        Write-Host "  Pobieranie Python 3.11.9 z python.org (~27 MB)..." -ForegroundColor Yellow
        try {
            (New-Object System.Net.WebClient).DownloadFile($pyUrl, $pyTmp)
            Write-Host "  Instalacja (cicha, tylko dla biezacego uzytkownika)..." -ForegroundColor DarkGray
            Start-Process -FilePath $pyTmp -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_test=0" -Wait
            Remove-Item $pyTmp -Force -ErrorAction SilentlyContinue
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                        [System.Environment]::GetEnvironmentVariable("Path","User")
            foreach ($cmd in $candidates) {
                try {
                    $v = & $cmd --version 2>&1
                    if ($v -match "Python (\d+)\.(\d+)" -and [int]$Matches[1] -eq 3 -and [int]$Matches[2] -ge 10) {
                        $r = (Get-Command $cmd -ErrorAction SilentlyContinue)
                        if ($r) { $pythonExe = $r.Source; Write-OK "Python $($Matches[1]).$($Matches[2]) zainstalowany z python.org: $pythonExe"; break }
                    }
                } catch {}
            }
        } catch {
            Write-WARN "Nie mozna pobrac instalatora Pythona: $_"
        }
    }
}

if (-not $pythonExe) {
    Write-FAIL "Python 3.10+ nadal nie znaleziony po probie automatycznej instalacji."
    Write-Host ""
    Write-Host "  Zainstaluj recznie Python 3.11 lub 3.12 z https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "  Zaznacz 'Add Python to PATH' podczas instalacji."                            -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Nacisnij Enter aby zamknac"
    exit 1
}

# ─── 2. Tworzenie venv ──────────────────────────────────────────────────────

Write-Step 2 "Tworzenie venv..."

$venvDir = Join-Path $InstallDir "venv"
$venvPy  = Join-Path $venvDir "Scripts\python.exe"
$venvPip = Join-Path $venvDir "Scripts\pip.exe"

if (-not (Test-Path $venvPy)) {
    Write-Host "  Tworzenie: $venvDir" -ForegroundColor DarkGray
    & $pythonExe -m venv $venvDir
    if ($LASTEXITCODE -ne 0) {
        Write-FAIL "Tworzenie venv nieudane (kod $LASTEXITCODE)"
        Read-Host "Nacisnij Enter aby zamknac"
        exit 1
    }
    Write-OK "venv utworzone: $venvDir"
} else {
    Write-OK "venv juz istnieje: $venvDir"
}

# Aktualizacja pip
Write-Host "  Aktualizacja pip..." -ForegroundColor DarkGray
& $venvPy -m pip install --upgrade pip --quiet

# ─── 3. requirements.txt ───────────────────────────────────────────────────

Write-Step 3 "Instalacja requirements.txt..."

$reqFile = Join-Path $InstallDir "resources\requirements.txt"
if (Test-Path $reqFile) {
    Write-Host "  Instalacja z: $reqFile" -ForegroundColor DarkGray
    & $venvPy -m pip install -r $reqFile
    if ($LASTEXITCODE -ne 0) {
        Write-WARN "Niektorych pakietow z requirements.txt nie udalo sie zainstalowac"
    } else {
        Write-OK "requirements.txt zainstalowane"
    }
} else {
    Write-WARN "Brak requirements.txt w $reqFile"
}

# ─── 4. PyTorch CUDA 12.1 ──────────────────────────────────────────────────

Write-Step 4 "Sprawdzam PyTorch (CUDA 12.1)..."

$torchVer = & $venvPy -c "import torch; print(torch.__version__)" 2>&1
if ($torchVer -match "^\d") {
    Write-OK "PyTorch $torchVer juz zainstalowany"
} else {
    Write-Host "  Pobieranie PyTorch — moze zajac kilka minut (~2 GB)..." -ForegroundColor Yellow
    Write-Host "  Indeks: https://download.pytorch.org/whl/cu121" -ForegroundColor DarkGray
    & $venvPy -m pip install torch torchvision torchaudio `
        --index-url https://download.pytorch.org/whl/cu121
    if ($LASTEXITCODE -ne 0) {
        Write-WARN "Instalacja PyTorch nieudana — sprawdz polaczenie internetowe i wersje CUDA"
        Write-WARN "Mozesz zainstalowac recznie: pip install torch --index-url https://download.pytorch.org/whl/cu121"
    } else {
        $torchVer2 = & $venvPy -c "import torch; print(torch.__version__)" 2>&1
        Write-OK "PyTorch $torchVer2 zainstalowany"
    }
}

# ─── 5. Zaleznosci Fish Speech ──────────────────────────────────────────────

Write-Step 5 "Sprawdzam zaleznosci Fish Speech..."

$fishDeps = @("fastapi", "uvicorn", "soundfile", "numpy", "pydub", "bitsandbytes", "audiotools")
$missing  = @()

foreach ($pkg in $fishDeps) {
    $modName = $pkg.Replace("-", "_")
    $check   = & $venvPy -c "import $modName" 2>&1
    if ($LASTEXITCODE -ne 0) { $missing += $pkg }
}

if ($missing.Count -gt 0) {
    Write-Host "  Instalacja: $($missing -join ', ')..." -ForegroundColor DarkGray
    & $venvPy -m pip install @missing
    if ($LASTEXITCODE -ne 0) {
        Write-WARN "Niektorych zaleznosci fish_speech nie udalo sie zainstalowac: $($missing -join ', ')"
    } else {
        Write-OK "Zaleznosci Fish Speech zainstalowane"
    }
} else {
    Write-OK "Zaleznosci Fish Speech OK"
}

# ─── Podsumowanie ──────────────────────────────────────────────────────────

Write-Host ""
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host "  Konfiguracja zakonczona!"                   -ForegroundColor Green
Write-Host ""
Write-Host "  Nastepny krok: skopiuj pliki modelu do:"   -ForegroundColor Yellow
Write-Host "  $InstallDir\models\s2-pro\"                -ForegroundColor White
Write-Host ""
Write-Host "  Pobierz model z:"                          -ForegroundColor Yellow
Write-Host "  https://huggingface.co/fishaudio/fish-speech-1.5" -ForegroundColor White
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host ""

Start-Sleep -Seconds 3
exit 0
