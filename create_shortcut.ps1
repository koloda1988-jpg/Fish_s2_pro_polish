# create_shortcut.ps1 — generuje app_icon.ico i skrot "Audiobook Generator.lnk"
# Uruchom raz z PowerShell w katalogu projektu: .\create_shortcut.ps1

Add-Type -AssemblyName System.Drawing

$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

Write-Host "Generuje ikone..." -ForegroundColor Cyan

# ─── Rysowanie ikony (audio waveform bars na ciemnym kole) ──────────────────
$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Ciemne tlo — kolo
$bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 12, 12, 22))
$g.FillEllipse($bg, 0, 0, 255, 255)

# Subtelna niebieska ramka
$ring = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 91, 140, 255), 5)
$g.DrawEllipse($ring, 3, 3, 249, 249)

# 5 pionowych pasków (waveform) — wysokosci: krotki, sredni, wysoki, sredni, krotki
$heights = @(56, 100, 144, 100, 56)
$barW    = 26
$gap     = 13
$nBars   = $heights.Count
$totalW  = $nBars * $barW + ($nBars - 1) * $gap   # 182 px
$sx      = [int](($size - $totalW) / 2)            # 37 px od lewej
$cy      = [int]($size / 2)                        # 128 (srodek)
$r       = [int]($barW / 2)                        # promien zaokraglenia = 13

$blue = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 91, 140, 255))

for ($i = 0; $i -lt $nBars; $i++) {
    $h = $heights[$i]
    $x = $sx + $i * ($barW + $gap)
    $y = $cy - [int]($h / 2)

    # Kapsulka (pill shape) — 4 segmenty laczace sie w zamkniety ksztalt
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    # Gorny polukrag (od lewej, CW przez gore, do prawej)
    $path.AddArc($x, $y, $barW, $barW, 180, 180)
    # Prawa krawedz (w dol)
    $path.AddLine($x + $barW, $y + $r, $x + $barW, $y + $h - $r)
    # Dolny polukrag (od prawej, CW przez dol, do lewej)
    $path.AddArc($x, $y + $h - $barW, $barW, $barW, 0, 180)
    # Lewa krawedz (w gore)
    $path.AddLine($x, $y + $h - $r, $x, $y + $r)
    $path.CloseFigure()
    $g.FillPath($blue, $path)
    $path.Dispose()
}

# Subtelny highlight (jasniejsza plama posrodku gory — efekt glossy)
$gloss = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    [System.Drawing.PointF]::new(80, 20),
    [System.Drawing.PointF]::new(80, 100),
    [System.Drawing.Color]::FromArgb(30, 255, 255, 255),
    [System.Drawing.Color]::Transparent
)
$g.FillEllipse($gloss, 60, 15, 136, 80)

$g.Dispose()
$bg.Dispose(); $ring.Dispose(); $blue.Dispose(); $gloss.Dispose()

# ─── PNG → ICO (Windows akceptuje PNG wewnatrz ICO od Vista+) ───────────────
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $ms.ToArray()
$ms.Dispose(); $bmp.Dispose()

$ico = New-Object System.IO.MemoryStream
$w   = New-Object System.IO.BinaryWriter($ico)

# ICONDIR (6 bajtow)
$w.Write([uint16]0)   # reserved
$w.Write([uint16]1)   # type = 1 (ICO)
$w.Write([uint16]1)   # liczba obrazow = 1

# ICONDIRENTRY (16 bajtow)
$w.Write([byte]0)     # szerokosc (0 = 256)
$w.Write([byte]0)     # wysokosc  (0 = 256)
$w.Write([byte]0)     # liczba kolorow (0 = True Color)
$w.Write([byte]0)     # reserved
$w.Write([uint16]1)   # planes
$w.Write([uint16]32)  # bits per pixel
$w.Write([uint32]$pngBytes.Length)
$w.Write([uint32]22)  # offset danych = 6 + 16 = 22

# PNG data
$w.Write($pngBytes)
$w.Flush()

$icoPath = Join-Path $root "app_icon.ico"
[System.IO.File]::WriteAllBytes($icoPath, $ico.ToArray())
$w.Dispose(); $ico.Dispose()

Write-Host "  Ikona zapisana: app_icon.ico" -ForegroundColor Green

# ─── Skrot Windows (.lnk) ────────────────────────────────────────────────────
Write-Host "Tworze skrot..." -ForegroundColor Cyan

$shell   = New-Object -ComObject WScript.Shell
$lnkPath = Join-Path $root "Fin Fish Voice.lnk"
$sc      = $shell.CreateShortcut($lnkPath)
$sc.TargetPath      = Join-Path $root "start_app.bat"
$sc.WorkingDirectory= $root
$sc.IconLocation    = "$icoPath,0"
$sc.Description     = "Fin Fish Voice 0.1 beta - Audiobook Maker | Fish Audio S2-Pro (NF4) | koloda"
$sc.WindowStyle     = 1   # normal window
$sc.Save()

Write-Host "  Skrot zapisany: Fin Fish Voice.lnk" -ForegroundColor Green
Write-Host ""
Write-Host "Gotowe! Kliknij dwukrotnie 'Fin Fish Voice.lnk' zeby uruchomic aplikacje." -ForegroundColor Yellow
