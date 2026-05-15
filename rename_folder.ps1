# rename_folder.ps1 — Zmień nazwę folderu projektu na "Fin Fish Voice"
# WAŻNE: Zamknij VS Code i wszystkie terminale przed uruchomieniem!
# Run: .\rename_folder.ps1  (from parent folder: "Audiobook (1)\")

$parent  = Split-Path $PSScriptRoot -Parent          # ..\Audiobook (1)\
$oldName = Split-Path $PSScriptRoot -Leaf            # wersja 2
$newName = "Fin Fish Voice"

$oldPath = Join-Path $parent $oldName
$newPath = Join-Path $parent $newName

Write-Host ""
Write-Host "Zmiana nazwy folderu projektu" -ForegroundColor Cyan
Write-Host "  SKAD : $oldPath"
Write-Host "  DO   : $newPath"
Write-Host ""

if (-not (Test-Path $oldPath)) {
    Write-Host "BLAD: Folder nie istnieje: $oldPath" -ForegroundColor Red
    exit 1
}
if (Test-Path $newPath) {
    Write-Host "BLAD: Folder docelowy juz istnieje: $newPath" -ForegroundColor Red
    exit 1
}

# Usuń stary skrót jeśli istnieje
$oldLnk = Join-Path $oldPath "Audiobook Generator.lnk"
if (Test-Path $oldLnk) {
    Remove-Item $oldLnk -Force
    Write-Host "  Usuniety stary skrot: Audiobook Generator.lnk" -ForegroundColor DarkGray
}

Rename-Item -Path $oldPath -NewName $newName -ErrorAction Stop
Write-Host "Folder przemianowany!" -ForegroundColor Green

Write-Host ""
Write-Host "Co teraz:" -ForegroundColor Yellow
Write-Host "  1. Otworz VS Code w nowym folderze: $newPath"
Write-Host "  2. Uruchom: .\create_shortcut.ps1  (stworzy 'Fin Fish Voice.lnk')"
Write-Host "  3. Uruchom: .\backup.ps1            (opcjonalnie)"
Write-Host ""
