# backup.ps1 — backup aplikacji wersja 2 do folderu backup\
#
# UZYCIE:
#   .\backup.ps1                # default: Slim (~60 MB, sam kod + konfig + lektory)
#   .\backup.ps1 -Standard      # ~420 MB (kod + Audiobooks + dist)
#   .\backup.ps1 -Full          # ~870 MB (wszystko prócz venv i modeli)
#
# Co kazdy tryb wyklucza (poza zawsze: venv, models, __pycache__, .cache):
#   Slim     : + node_modules, dist, backend-build, backend-dist, backend-spec, Audiobooks
#   Standard : + node_modules, backend-build, backend-dist, backend-spec
#   Full     : (nic dodatkowego)
#
# Uwaga: 'venv' i 'models' sa ZAWSZE pomijane:
#   - venv (~4 GB) mozna odtworzyc przez .\install.ps1
#   - models\s2-pro to junction na E:\ (11 GB), models\s2-pro-BnB-4Bits (~4.7 GB)
# Odtworz je recznie po restore lub przez install.ps1.

param(
    [switch]$Slim,
    [switch]$Standard,
    [switch]$Full
)

$ErrorActionPreference = "Stop"

# Domyslnie Slim, jezeli zaden tryb nie wybrany
if (-not ($Slim -or $Standard -or $Full)) { $Slim = $true }

$src  = $PSScriptRoot
$projParent = Split-Path $src -Parent
$backupRoot = Join-Path $projParent "backup"

# Nazwa backupu z timestampem
$ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$mode = if ($Full) { "full" } elseif ($Standard) { "standard" } else { "slim" }
$dst = Join-Path $backupRoot "wersja_2_${ts}_${mode}"

Write-Host "`n=== BACKUP ===" -ForegroundColor Cyan
Write-Host "Zrodlo: $src"
Write-Host "Cel:    $dst"
Write-Host "Tryb:   $mode" -ForegroundColor Yellow

# Stworz katalog backup jezeli nie istnieje
if (-not (Test-Path $backupRoot)) {
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    Write-Host "Utworzylem katalog: $backupRoot"
}

# Lista folderow do wykluczenia w zaleznosci od trybu
# venv i models sa ZAWSZE wykluczone (4+ GB kazdy, mozna odtworzyc)
$excludeDirs = @("__pycache__", "models", "venv", ".cache")
if ($Slim) {
    $excludeDirs += @("node_modules", "dist", "backend-build", "backend-dist", "backend-spec", "Audiobooks")
} elseif ($Standard) {
    $excludeDirs += @("node_modules", "backend-build", "backend-dist", "backend-spec")
}
# Full: nic dodatkowego (bez node_modules, bez dist)

# Plus zawsze wykluczamy plikowo:
$excludeFiles = @("*.pyc", "*.pyo")

Write-Host "`nWykluczam katalogi: $($excludeDirs -join ', ')" -ForegroundColor DarkGray
Write-Host "Wykluczam pliki:    $($excludeFiles -join ', ')" -ForegroundColor DarkGray

# Robocopy:
#   /MIR — mirror (kopiuj wszystko, w tym usuwa niepotrzebne w celu — ale my mamy nowy katalog)
#   /XD  — exclude directories
#   /XF  — exclude files
#   /XJ  — exclude junction points (KLUCZOWE dla models\s2-pro!)
#   /XJD — exclude junction directories
#   /R:1 /W:1 — retry 1 raz, czekaj 1s
#   /MT:8 — multi-threaded (8 watkow)
#   /NFL /NDL — bez listingu plikow/folderow (mniej spamu)
#   /NJH /NJS — bez header/summary (zostawiamy NJS off — chcemy podsumowanie)

$xdArgs = $excludeDirs | ForEach-Object { @("/XD", $_) } | ForEach-Object { $_ }
$xfArgs = $excludeFiles | ForEach-Object { @("/XF", $_) } | ForEach-Object { $_ }

$args = @(
    "`"$src`"",
    "`"$dst`"",
    "/E",           # kopiuj wszystkie podkatalogi (lacznie z pustymi)
    "/XJ",          # exclude junction points (pliki)
    "/XJD",         # exclude junction directories (= models\s2-pro)
    "/R:1",
    "/W:1",
    "/MT:8",
    "/NFL",
    "/NDL"
) + $xdArgs + $xfArgs

Write-Host "`n=== KOPIOWANIE ===" -ForegroundColor Cyan
$cmd = "robocopy " + ($args -join " ")
Write-Host "Cmd: $cmd" -ForegroundColor DarkGray
Write-Host ""

# robocopy zwraca 0..7 jako sukces (1 = pliki skopiowane, 0 = nic do roboty)
$proc = Start-Process -FilePath "robocopy" -ArgumentList $args -NoNewWindow -PassThru -Wait
$exitCode = $proc.ExitCode

if ($exitCode -lt 8) {
    Write-Host "Robocopy OK (exit=$exitCode)" -ForegroundColor Green
} else {
    Write-Host "Robocopy zwrocil blad (exit=$exitCode) - sprawdz powyzej" -ForegroundColor Red
    exit 1
}

# Zapisz BACKUP_INFO.txt z metadanymi
$info = @"
BACKUP wersja 2
================
Data utworzenia : $ts
Tryb            : $mode
Zrodlo          : $src
Cel             : $dst

Wykluczone katalogi : $($excludeDirs -join ', ')
Wykluczone pliki    : $($excludeFiles -join ', ')

Aby przywrocic backup:
  1) Skopiuj zawartosc tego folderu do docelowej lokalizacji projektu
  2) Zainstaluj zaleznosci npm i venv:
     cd <docelowa>
     npm install
     .\install.ps1
  3) Odtworz junction modelu s2-pro (jezeli model istnieje na E:):
     cmd /c mklink /J "<docelowa>\models\s2-pro" "E:\StabilityMatrix\Packages\ComfyUI\models\fishaudioS2\s2-pro"
     (lub skopiuj folder models\s2-pro-BnB-4Bits recznie)
"@

$infoPath = Join-Path $dst "BACKUP_INFO.txt"
Set-Content -Path $infoPath -Value $info -Encoding UTF8
Write-Host "`nMetadane backupu: $infoPath" -ForegroundColor DarkGray

# Pokaz rozmiar
Write-Host "`n=== ROZMIAR BACKUPU ===" -ForegroundColor Cyan
$size = (Get-ChildItem $dst -Recurse -File -ErrorAction SilentlyContinue |
         Measure-Object -Property Length -Sum).Sum
$mb = [math]::Round($size / 1MB, 1)
$count = (Get-ChildItem $dst -Recurse -File -ErrorAction SilentlyContinue).Count
Write-Host "  Plikow: $count, lacznie: $mb MB"

Write-Host "`n=== TOP 10 NAJWIEKSZYCH PLIKOW ===" -ForegroundColor Cyan
Get-ChildItem $dst -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object Length -Descending | Select-Object -First 10 |
    Select-Object @{N='MB';E={[math]::Round($_.Length/1MB,2)}}, FullName |
    Format-Table -AutoSize

Write-Host "`nGOTOWE." -ForegroundColor Green
Write-Host "Lokalizacja backupu:" -ForegroundColor White
Write-Host "  $dst" -ForegroundColor Yellow

Write-Host "`n=== SYNC DIST ===" -ForegroundColor Cyan
& "$PSScriptRoot\sync_dist.ps1"
