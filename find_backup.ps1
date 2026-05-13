# Pokazuje wszystkie backupy + rozmiar python_backend.py w kazdym,
# zeby zlokalizowac najstarszy NIEPUSZKODZONY plik.
$bkpRoot = "C:\Users\kolod\Documents\Claude\Projects\Audiobook\Audiobook (1)\backup"
Write-Host "`n=== BACKUPY z python_backend.py ===" -ForegroundColor Cyan
Get-ChildItem $bkpRoot -Directory -ErrorAction SilentlyContinue |
  ForEach-Object {
    $pyFile = Join-Path $_.FullName "python_backend.py"
    if (Test-Path $pyFile) {
      $size = (Get-Item $pyFile).Length
      $lines = (Get-Content $pyFile).Count
      $lastLine = (Get-Content $pyFile -Tail 1).Trim()
      $isBroken = $lastLine -notmatch "main\(\)|^if __name|^[\)\]]" -and $lastLine.Length -gt 0
      [PSCustomObject]@{
        Folder    = $_.Name
        Lines     = $lines
        SizeKB    = [math]::Round($size/1KB, 1)
        Status    = if ($isBroken) { "OBCIETY?" } else { "OK?" }
        LastLine  = if ($lastLine.Length -gt 50) { $lastLine.Substring(0,50)+"..." } else { $lastLine }
        Modified  = $_.LastWriteTime.ToString("yyyy-MM-dd HH:mm")
      }
    }
  } | Sort-Object Modified | Format-Table -AutoSize -Wrap
