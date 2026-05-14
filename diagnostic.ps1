param(
    [string]$ProjectRoot = $PSScriptRoot,
    [string]$PythonExe = "",
    [string]$RequirementsFile = "requirements.txt",
    [switch]$Json
)

$ErrorActionPreference = "Stop"

function ConvertTo-NormalizedName([string]$name) {
    if ([string]::IsNullOrWhiteSpace($name)) { return "" }
    return ($name.Trim().ToLower() -replace "_", "-")
}

function Get-RequirementNames([string]$reqPath) {
    $result = @()
    if (-not (Test-Path $reqPath)) { return $result }

    foreach ($line in (Get-Content $reqPath)) {
        $t = $line.Trim()
        if ($t -eq "" -or $t.StartsWith("#")) { continue }
        if ($t.StartsWith("-")) { continue } # pip options: --extra-index-url, -f, etc.

        # Remove environment markers and version constraints.
        $pkg = ($t -split ";", 2)[0].Trim()
        $pkg = ($pkg -split "\[", 2)[0].Trim()  # drop extras
        $pkg = ($pkg -split "==|>=|<=|!=|~=|>|<", 2)[0].Trim()

        if (-not [string]::IsNullOrWhiteSpace($pkg)) {
            $result += (ConvertTo-NormalizedName $pkg)
        }
    }

    return ($result | Sort-Object -Unique)
}

function Get-SystemPython {
    foreach ($candidate in @("python", "python3", "py")) {
        try {
            $cmd = Get-Command $candidate -ErrorAction Stop
            $v = & $cmd.Source --version 2>&1
            if ($v -match "Python (\d+)\.(\d+)") {
                $major = [int]$Matches[1]
                $minor = [int]$Matches[2]
                if ($major -gt 3 -or ($major -eq 3 -and $minor -ge 10)) {
                    return $cmd.Source
                }
            }
        } catch {
        }
    }
    return ""
}

$root = (Resolve-Path $ProjectRoot).Path
$venvPython = Join-Path $root "venv\Scripts\python.exe"
$reqPath = if ([System.IO.Path]::IsPathRooted($RequirementsFile)) { $RequirementsFile } else { Join-Path $root $RequirementsFile }

$pythonToUse = ""
if ($PythonExe -and (Test-Path $PythonExe)) {
    $pythonToUse = $PythonExe
} elseif (Test-Path $venvPython) {
    $pythonToUse = $venvPython
} else {
    $pythonToUse = Get-SystemPython
}

$pythonVersion = ""
$packageMap = @{}
$pipOk = $false

if ($pythonToUse -and (Test-Path $pythonToUse)) {
    try {
        $pythonVersion = (& $pythonToUse --version 2>&1).ToString().Trim()
    } catch {
        $pythonVersion = "unknown"
    }

    try {
        $pipJson = & $pythonToUse -m pip list --format=json 2>$null
        $packages = $pipJson | ConvertFrom-Json
        foreach ($p in $packages) {
            $name = ConvertTo-NormalizedName $p.name
            if ($name) {
                $packageMap[$name] = $p.version
            }
        }
        $pipOk = $true
    } catch {
        $pipOk = $false
    }
}

$requirements = Get-RequirementNames $reqPath
$missing = @()
if ($pipOk) {
    foreach ($req in $requirements) {
        if (-not $packageMap.ContainsKey($req)) {
            $missing += $req
        }
    }
} else {
    $missing = $requirements
}

$summary = [ordered]@{
    timestamp = (Get-Date).ToString("s")
    projectRoot = $root
    requirementsFile = $reqPath
    venvExists = (Test-Path $venvPython)
    pythonExe = $pythonToUse
    pythonVersion = $pythonVersion
    pipOk = $pipOk
    requirementsCount = $requirements.Count
    installedCount = $packageMap.Count
    missingPackages = $missing
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 5
    if ($missing.Count -gt 0 -or -not $pythonToUse) { exit 1 }
    exit 0
}

Write-Host "=== DIAGNOSTIC: Python / venv / packages ===" -ForegroundColor Cyan
Write-Host "Project:      $($summary.projectRoot)"
Write-Host "Requirements: $($summary.requirementsFile)"
Write-Host "venv exists:  $($summary.venvExists)"
Write-Host "Python exe:   $($summary.pythonExe)"
Write-Host "Python ver:   $($summary.pythonVersion)"
Write-Host "pip ok:       $($summary.pipOk)"
Write-Host "Installed:    $($summary.installedCount)"
Write-Host "Required:     $($summary.requirementsCount)"

if ($missing.Count -eq 0) {
    Write-Host "Missing:      0" -ForegroundColor Green
} else {
    Write-Host "Missing:      $($missing.Count)" -ForegroundColor Yellow
    foreach ($m in $missing) {
        Write-Host "  - $m" -ForegroundColor Yellow
    }
}

if (-not $pythonToUse) {
    Write-Host "BLAD: Nie znaleziono Python 3.10+" -ForegroundColor Red
    exit 2
}

if (-not $summary.venvExists) {
    Write-Host "BLAD: Brak lokalnego venv (venv\\Scripts\\python.exe)" -ForegroundColor Red
    exit 3
}

if ($missing.Count -gt 0) {
    exit 1
}

exit 0
