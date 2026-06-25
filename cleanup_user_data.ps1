# Skrypt czyszczący dane użytkownika z Fish Fin Voice
# Usuwane: audiobooki, filmy, temp cache, buildy backendu
# Zachowywane: lektorzy, modele AI, kod aplikacji

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Fish Fin Voice - Czyszczenie danych użytkownika" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

$toDelete = @(
    "./audiobooks",           # Wygenerowane audiobooki
    "./movies",               # Wygenerowane/pobrane filmy
    "./temp_voiceover",       # Temp cache z Live Action
    "./project",              # Projekty filmów
    "./models/tmp_*",         # Tymczasowe cache'e modeli
    "./backend-build",        # Buildy backendu
    "./backend-spec",         # Spec pliki backendu
    "./files_books"           # Pliki źródłowe audioboków (możesz zmienić jeśli chcesz zachować)
)

Write-Host "Foldery do usunięcia:" -ForegroundColor Yellow
foreach ($item in $toDelete) {
    Write-Host "  - $item" -ForegroundColor Red
}

Write-Host ""
Write-Host "Zachowywane:" -ForegroundColor Green
Write-Host "  ✓ ./lectors/ - Głosy lektorów" -ForegroundColor Green
Write-Host "  ✓ ./models/s2-pro/ - Model Fish Speech" -ForegroundColor Green
Write-Host "  ✓ ./models/s2-pro-BnB-4Bits/ - Model skwantyzowany" -ForegroundColor Green
Write-Host "  ✓ Cały kod aplikacji (.js, .py, .html, itp.)" -ForegroundColor Green
Write-Host ""

$response = Read-Host "Czy na pewno chcesz usunąć te foldery? (wpisz 'TAK' aby potwierdzić)"

if ($response -ne "TAK") {
    Write-Host ""
    Write-Host "Anulowano." -ForegroundColor Yellow
    exit
}

Write-Host ""
Write-Host "Rozpoczynanie czyszczenia..." -ForegroundColor Cyan
$totalSize = 0
$deletedCount = 0

foreach ($pattern in $toDelete) {
    # Obsługa wildcard'ów (tmp_*)
    $paths = @()
    
    if ($pattern -like "*\**") {
        # Zawiera wildcard
        $basePath = Split-Path -Parent $pattern
        $filter = Split-Path -Leaf $pattern
        if (Test-Path $basePath) {
            $paths = Get-ChildItem -Path $basePath -Filter $filter -ErrorAction SilentlyContinue
        }
    } else {
        # Dokładna ścieżka
        if (Test-Path $pattern) {
            $paths = @(Get-Item $pattern)
        }
    }
    
    foreach ($path in $paths) {
        try {
            $size = 0
            if ($path.PSIsContainer) {
                # Folder
                $size = (Get-ChildItem -Path $path -Recurse -Force | Measure-Object -Property Length -Sum).Sum
                Remove-Item -Path $path -Recurse -Force -ErrorAction Stop
                Write-Host "  ✓ Usunięto: $($path.FullName) (~$([math]::Round($size/1GB, 2)) GB)" -ForegroundColor Green
            } else {
                # Plik
                $size = $path.Length
                Remove-Item -Path $path -Force -ErrorAction Stop
                Write-Host "  ✓ Usunięto: $($path.FullName) (~$([math]::Round($size/1MB, 2)) MB)" -ForegroundColor Green
            }
            $totalSize += $size
            $deletedCount++
        }
        catch {
            Write-Host "  ✗ Błąd przy usuwaniu $($path.FullName): $_" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Czyszczenie ukończone!" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Usunięto:" -ForegroundColor Green
Write-Host "  - $deletedCount folderów/plików" -ForegroundColor Green
Write-Host "  - ~$([math]::Round($totalSize/1GB, 2)) GB miejsca zwolnionego" -ForegroundColor Green
Write-Host ""
Write-Host "Aplikacja powinna działać bez problemów!" -ForegroundColor Cyan
Write-Host ""
