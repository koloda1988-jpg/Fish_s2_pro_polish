param(
    [string]$ModelPath = ""
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Write-Step($n, $msg) {
    Write-Host "`n[$n] $msg" -ForegroundColor Cyan
}

function Write-OK($msg) {
    Write-Host "    OK  $msg" -ForegroundColor Green
}

function Write-WarnMsg($msg) {
    Write-Host "  WARN  $msg" -ForegroundColor Yellow
}

function Write-Fail($msg) {
    Write-Host "  FAIL  $msg" -ForegroundColor Red
}

function Test-CommandSucceeded($code, $message) {
    if ($code -ne 0) {
        Write-Fail $message
        exit 1
    }
}

function Find-Python310Plus() {
    foreach ($candidate in @("python", "python3", "py")) {
        try {
            $versionOutput = & $candidate --version 2>&1
            if ($versionOutput -match "Python (\d+)\.(\d+)") {
                $major = [int]$Matches[1]
                $minor = [int]$Matches[2]
                if ($major -gt 3 -or ($major -eq 3 -and $minor -ge 10)) {
                    return (Get-Command $candidate).Source
                }
            }
        } catch {
        }
    }

    return $null
}

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Magenta
Write-Host "  Audiobook Generator - installer" -ForegroundColor Magenta
Write-Host "  Project dir: $Root" -ForegroundColor DarkGray
Write-Host "=====================================================" -ForegroundColor Magenta

Write-Step 1 "Checking Node.js..."
try {
    $nodeVer = node --version 2>&1
    Write-OK "Node.js $nodeVer"
} catch {
    Write-Fail "Node.js not found. Install Node.js 18+ from https://nodejs.org/"
    exit 1
}

Write-Step 2 "Checking Python 3.10+..."
$pythonExe = Find-Python310Plus
if (-not $pythonExe) {
    Write-Fail "Python 3.10+ not found. Install Python and add it to PATH."
    exit 1
}
$pythonVer = & $pythonExe --version 2>&1
Write-OK "$pythonExe ($pythonVer)"

$diagExe = Join-Path $Root "diagnostic.exe"
if (Test-Path $diagExe) {
    Write-Host "    Running diagnostic.exe (pre-check)..." -ForegroundColor DarkGray
    & $diagExe -ProjectRoot "$Root" -RequirementsFile "requirements.txt" | Out-Null
}

Write-Step 3 "Installing npm dependencies..."
Push-Location $Root
if (-not (Test-Path "node_modules")) {
    npm install
    Test-CommandSucceeded $LASTEXITCODE "npm install failed"
    Write-OK "node_modules ready"
} else {
    Write-OK "node_modules already exists - skipping"
}
Pop-Location

Write-Step 4 "Creating local venv in .\\venv..."
$venvDir = Join-Path $Root "venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    & $pythonExe -m venv $venvDir
    Test-CommandSucceeded $LASTEXITCODE "Failed to create local venv"
    Write-OK "venv created: $venvDir"
} else {
    Write-OK "venv already exists - skipping"
}

& $venvPython -m pip install --upgrade pip --quiet
Test-CommandSucceeded $LASTEXITCODE "pip upgrade failed"

Write-Step 5 "Installing Python dependencies..."
$reqFile = Join-Path $Root "requirements.txt"
if (Test-Path $reqFile) {
    & $venvPython -m pip install -r $reqFile --quiet
    Test-CommandSucceeded $LASTEXITCODE "pip install -r requirements.txt failed"
    Write-OK "requirements.txt installed"
}

$diagScript = Join-Path $Root "diagnostic.ps1"
if (Test-Path $diagScript) {
    Write-Host "    Running diagnostic.ps1 (post-install check)..." -ForegroundColor DarkGray
    $diagJson = & $diagScript -ProjectRoot "$Root" -PythonExe "$venvPython" -RequirementsFile "$reqFile" -Json 2>$null
    $diag = $null
    try {
        $diag = $diagJson | ConvertFrom-Json
    } catch {
        $diag = $null
    }

    if ($diag -and $diag.missingPackages -and $diag.missingPackages.Count -gt 0) {
        $missing = @($diag.missingPackages)
        Write-WarnMsg "Missing packages after initial install: $($missing -join ', ')"
        Write-Host "    Installing missing packages from requirements..." -ForegroundColor DarkGray
        & $venvPython -m pip install $missing --quiet
        if ($LASTEXITCODE -eq 0) {
            Write-OK "Missing packages installed"
        } else {
            Write-WarnMsg "Some missing packages could not be installed automatically"
        }
    } else {
        Write-OK "diagnostic: requirements coverage OK"
    }
}

Write-Step 6 "Creating project directories..."
foreach ($dir in @("Audiobooks", "Files_books", "Lectors")) {
    $path = Join-Path $Root $dir
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path | Out-Null
        Write-OK "Created: $dir\\"
    } else {
        Write-OK "Exists: $dir\\"
    }
}

Write-Step 7 "Checking s2-pro model..."
$modelsRoot = Join-Path $Root "models"
$modelDir = Join-Path $modelsRoot "s2-pro"

if (-not (Test-Path $modelsRoot)) {
    New-Item -ItemType Directory -Path $modelsRoot | Out-Null
}

if ($ModelPath -and (Test-Path $ModelPath)) {
    if (Test-Path $modelDir) {
        Remove-Item $modelDir -Force -Recurse
    }
    cmd /c mklink /J "$modelDir" "$ModelPath" | Out-Null
    Write-OK "Junction models\\s2-pro -> $ModelPath"
} elseif ((Test-Path $modelDir) -and ((Get-ChildItem $modelDir -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0)) {
    Write-OK "models\\s2-pro exists and has files"
} else {
    if (-not (Test-Path $modelDir)) {
        New-Item -ItemType Directory -Path $modelDir | Out-Null
    }
    Write-WarnMsg "No model in models\\s2-pro\\"
    Write-Host ""
    Write-Host "  Download Fish Audio S2-Pro from Hugging Face:" -ForegroundColor Yellow
    Write-Host "  https://huggingface.co/fishaudio/fish-speech-1.5" -ForegroundColor White
    Write-Host ""
    Write-Host "  Then either:" -ForegroundColor Yellow
    Write-Host "  a) copy model files to: $modelDir" -ForegroundColor White
    Write-Host "  b) rerun with ModelPath:" -ForegroundColor White
    Write-Host "     .\\install.ps1 -ModelPath 'D:\\models\\s2-pro-fp8'" -ForegroundColor White
}

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Magenta
Write-Host "  Installation complete" -ForegroundColor Green
Write-Host ""
Write-Host "  Run app with:" -ForegroundColor White
Write-Host "    npm start" -ForegroundColor Cyan
Write-Host "  or:" -ForegroundColor White
Write-Host "    start_app.bat" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Magenta
Write-Host ""