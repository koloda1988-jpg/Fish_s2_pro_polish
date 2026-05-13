# cleanup.ps1 — audyt + spłaszczenie + usuwanie legacy.
#
# CO ROBI (w tej kolejnosci):
#   1) Pokaze rozmiar przed
#   2) Usunie legacy w wersja 2/: audiobook_app.py + stare baty + duplikaty WAV
#   3) Usunie build artifacts w wersja 3/: dist, backend-build, backend-dist, backend-spec, __pycache__
#   4) Usunie duplikaty w wersja 3/: Silos_TTS_tagged_v3.txt, phonetic_fixes.txt, niepotrzebne baty
#   5) Wyczysci _node_code/: example_workflow, voice_samples, dokumentacje, README_ZH, LICENSE
#   6) Usunie node_modules/typescript (dev only)
#   7) Przeniesie WSZYSTKIE pozostale pliki z wersja 3/ do wersja 2/
#   8) Usunie pusty wersja 3/
#   9) Pokaze rozmiar po
#
# Uruchom z PowerShell w katalogu projektu:
#   .\cleanup.ps1
#
# Tryb dry-run (pokaze co usunie, nie usunie):
#   .\cleanup.ps1 -DryRun

param([switch]$DryRun)

$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$v3 = Join-Path $root "wersja 3"

function Show-Size($label, $path) {
    if (Test-Path $path) {
        $size = (Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue |
                 Measure-Object -Property Length -Sum).Sum
        $mb = [math]::Round($size / 1MB, 1)
        Write-Host ("  {0,-40} {1,8} MB" -f $label, $mb)
    }
}

function Remove-SafeItem { param([string]$path, [switch]$recurse)
    if (-not (Test-Path -LiteralPath $path)) { return }
    if ($DryRun) {
        Write-Host "  [dry-run] usunalbym: $path" -ForegroundColor DarkYellow
        return
    }
    try {
        if ($recurse) {
            Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
        } else {
            Remove-Item -LiteralPath $path -Force -ErrorAction Stop
        }
        Write-Host "  usunieto: $path" -ForegroundColor DarkGray
    } catch {
        Write-Host "  BLAD przy usuwaniu $path : $_" -ForegroundColor Red
    }
}

# ─── Stan poczatkowy ───
Write-Host "`n=== STAN POCZATKOWY ===" -ForegroundColor Cyan
Show-Size "Caly projekt" $root
Show-Size "wersja 3" $v3
Show-Size "wersja 3\node_modules" (Join-Path $v3 "node_modules")
Show-Size "wersja 3\dist" (Join-Path $v3 "dist")
Show-Size "_node_code" (Join-Path $root "_node_code")

if ($DryRun) {
    Write-Host "`n[DRY-RUN] Nic nie bedzie skasowane. Plan:" -ForegroundColor Yellow
}

# ─── 2) Legacy w wersja 2/ ───
Write-Host "`n=== USUWAM LEGACY w wersja 2/ ===" -ForegroundColor Cyan
$legacy_root = @(
    "audiobook_app.py",       # stary Tkinter
    "run_app.bat",            # uruchamial Tkinter
    "start_server.bat",       # s2.cpp launcher
    "start_server2.bat",      # s2.cpp launcher
    "start_s2_server.bat",    # rozne (Electron go zastapi)
    "build_exe.bat",          # PyInstaller dla Tkinter
    "verify.bat",             # legacy pomocniczy
    "verify_audio.py",        # legacy pomocniczy
    "add_tts_tags.py",        # legacy preprocessing
    "test_server.py",         # tester (mozna zachowac, ale juz niepotrzebny)
    "sample_glos_macieja.wav",  # 60s wersja - mamy 10s
    "sample_glos_macieja.txt",
    "sample_Maciej.wav"        # duplikat 60s
)
foreach ($f in $legacy_root) {
    Remove-SafeItem (Join-Path $root $f)
}

# ─── 3) Build artifacts w wersja 3/ ───
Write-Host "`n=== USUWAM BUILD ARTIFACTS ===" -ForegroundColor Cyan
$artifacts = @("dist", "backend-build", "backend-dist", "backend-spec", "__pycache__")
foreach ($d in $artifacts) {
    Remove-SafeItem -path (Join-Path $v3 $d) -recurse
}

# ─── 4) Duplikaty w wersja 3/ ───
Write-Host "`n=== USUWAM DUPLIKATY w wersja 3/ ===" -ForegroundColor Cyan
$dups_v3 = @(
    "Silos_TTS_tagged_v3.txt",
    "phonetic_fixes.txt",
    "start_server.bat",
    "install.bat",
    "build_full.bat"
)
foreach ($f in $dups_v3) {
    Remove-SafeItem (Join-Path $v3 $f)
}

# ─── 5) Czyszczenie _node_code/ ───
Write-Host "`n=== CZYSZCZE _node_code/ ===" -ForegroundColor Cyan
$nc = Join-Path $root "_node_code"
$nc_clean_dirs = @("example_workflow", "voice_samples")
foreach ($d in $nc_clean_dirs) {
    Remove-SafeItem -path (Join-Path $nc $d) -recurse
}
$nc_clean_files = @("README_ZH.md", "LICENSE", ".gitignore", ".tracking", "pyproject.toml")
foreach ($f in $nc_clean_files) {
    Remove-SafeItem (Join-Path $nc $f)
}
$fs = Join-Path $nc "fish_speech_src"
Remove-SafeItem -path (Join-Path $fs "docs") -recurse
$fs_clean = @(
    "FishAudioS2TecReport.pdf", "README.md", "LICENSE", "mkdocs.yml",
    "uv.lock", "pyproject.toml", ".gitignore", ".pre-commit-config.yaml",
    ".project-root", ".readthedocs.yaml", "API_FLAGS.txt", "pyrightconfig.json"
)
foreach ($f in $fs_clean) {
    Remove-SafeItem (Join-Path $fs $f)
}

# ─── 6) node_modules/typescript (dev only) ───
Write-Host "`n=== USUWAM dev-only z node_modules ===" -ForegroundColor Cyan
Remove-SafeItem -path (Join-Path $v3 "node_modules\typescript") -recurse

# ─── 7) Przenies pozostale z wersja 3/ do wersja 2/ ───
Write-Host "`n=== SPLASZCZAM: wersja 3/ -> wersja 2/ ===" -ForegroundColor Cyan
if (Test-Path $v3) {
    $items = Get-ChildItem $v3 -Force
    foreach ($item in $items) {
        $target = Join-Path $root $item.Name
        if (Test-Path -LiteralPath $target) {
            Write-Host "  SKIP (cel istnieje): $($item.Name)" -ForegroundColor Yellow
            continue
        }
        if ($DryRun) {
            Write-Host "  [dry-run] przeniosltbym: $($item.FullName) -> $target" -ForegroundColor DarkYellow
            continue
        }
        try {
            Move-Item -LiteralPath $item.FullName -Destination $target -Force -ErrorAction Stop
            Write-Host "  przeniesiono: $($item.Name)" -ForegroundColor DarkGray
        } catch {
            Write-Host "  BLAD przy przenoszeniu $($item.Name): $_" -ForegroundColor Red
        }
    }

    # Po przeniesieniu — usun pusty wersja 3/
    if (-not $DryRun) {
        $remaining = Get-ChildItem $v3 -Force -ErrorAction SilentlyContinue
        if ($remaining.Count -eq 0) {
            Remove-Item -LiteralPath $v3 -Force
            Write-Host "  Usunieto pusty wersja 3/" -ForegroundColor DarkGray
        } else {
            Write-Host "  wersja 3/ nadal zawiera $($remaining.Count) elementow — sprawdz recznie" -ForegroundColor Yellow
        }
    }
}

# ─── 8) Stan koncowy ───
Write-Host "`n=== STAN KONCOWY ===" -ForegroundColor Cyan
Show-Size "Caly projekt" $root
Show-Size "node_modules" (Join-Path $root "node_modules")
Show-Size "_node_code" (Join-Path $root "_node_code")

Write-Host "`n=== PLIKI w wersja 2/ ===" -ForegroundColor Cyan
Get-ChildItem $root -File | Select-Object Name, @{N='KB';E={[math]::Round($_.Length/1KB,1)}} | Format-Table -AutoSize

Write-Host "`n=== KATALOGI w wersja 2/ ===" -ForegroundColor Cyan
Get-ChildItem $root -Directory | Select-Object Name | Format-Table -AutoSize

if ($DryRun) {
    Write-Host "`nDRY-RUN zakonczony. Aby naprawde wykonac, uruchom bez -DryRun:" -ForegroundColor Yellow
    Write-Host "    .\cleanup.ps1" -ForegroundColor White
} else {
    Write-Host "`nGotowe! Teraz uruchom apke z nowej (splaszczonej) lokalizacji:" -ForegroundColor Green
    Write-Host "    .\start_app.bat" -ForegroundColor White
}
