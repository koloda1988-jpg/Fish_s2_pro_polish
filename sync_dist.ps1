# sync_dist.ps1 - synchronizuje pliki zrodlowe z dist\win-unpacked\resources\
#
# UZYCIE:
#   .\sync_dist.ps1          # kopiuje tylko pliki nowsze niz w dist
#   .\sync_dist.ps1 -Force   # kopiuje wszystkie bez sprawdzania daty
#   .\sync_dist.ps1 -Dry     # tylko pokazuje co by zostalo skopiowane

param(
    [switch]$Force,
    [switch]$Dry
)

$ErrorActionPreference = "Stop"

$src = $PSScriptRoot
$dst = Join-Path $src "dist\win-unpacked\resources"

if (-not (Test-Path $dst)) {
    Write-Host "BRAK dist\win-unpacked\resources -- zbuduj aplikacje najpierw." -ForegroundColor Red
    exit 1
}

$files = @(
    "python_backend.py",
    "server_pipeline.py",
    "s2_server.py",
    "phonetic_map.json",
    "phonetic_fixes.txt",
    "requirements.txt"
)

$copied  = 0
$skipped = 0
$missing = 0

Write-Host ""
Write-Host "=== SYNC dist\win-unpacked\resources ===" -ForegroundColor Cyan
Write-Host "Src: $src"
Write-Host "Dst: $dst"
if ($Dry)   { Write-Host "[TRYB SUCHY -- nic nie zostanie skopiowane]" -ForegroundColor Yellow }
if ($Force) { Write-Host "[FORCE -- kopiuje niezaleznie od daty]"      -ForegroundColor Yellow }
Write-Host ""

foreach ($f in $files) {
    $srcFile = Join-Path $src $f
    $dstFile = Join-Path $dst $f

    if (-not (Test-Path $srcFile)) {
        Write-Host "  BRAK src  : $f" -ForegroundColor DarkGray
        $missing++
        continue
    }

    $srcTime = (Get-Item $srcFile).LastWriteTime

    if (Test-Path $dstFile) {
        $dstTime = (Get-Item $dstFile).LastWriteTime
        $newer   = $srcTime -gt $dstTime
        $diffSec = [int]($srcTime - $dstTime).TotalSeconds
    } else {
        $newer   = $true
        $dstTime = $null
        $diffSec = 0
    }

    if ($Force -or $newer) {
        $label = if ($dstTime) { "+${diffSec}s nowszy" } else { "nowy" }
        if ($Dry) {
            Write-Host "  SKOPIUJE  : $f  ($label)" -ForegroundColor Yellow
        } else {
            Copy-Item $srcFile $dstFile -Force
            Write-Host "  OK        : $f  ($label)" -ForegroundColor Green
        }
        $copied++
    } else {
        $diffAbs = [int]($dstTime - $srcTime).TotalSeconds
        Write-Host "  aktualny  : $f  (dist nowszy o ${diffAbs}s)" -ForegroundColor DarkGray
        $skipped++
    }
}

Write-Host ""
if ($Dry) {
    Write-Host "=== DO SKOPIOWANIA: $copied  |  Aktualne: $skipped  |  Brak w src: $missing ===" -ForegroundColor Yellow
} else {
    Write-Host "=== Skopiowano: $copied  |  Aktualne: $skipped  |  Brak w src: $missing ===" -ForegroundColor Cyan
}
Write-Host ""
