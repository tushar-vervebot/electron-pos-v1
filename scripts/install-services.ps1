<#
.SYNOPSIS
    Installs all POS hardware-integration services.
    Called by the WiX MSI deferred custom action (SYSTEM context, elevated).
    Runs AFTER all files are committed to disk.

.NOTES
    Layout after install (extraResource copies outside the asar):
      <root>\app-1.0.0\resources\scripts\   <- this script ($PSScriptRoot)
      <root>\app-1.0.0\resources\pos-health\ <- WinSW + service.js
    where <root> = C:\Program Files (x86)\POS System\
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Resolve paths relative to this script's location
$here         = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
$resourcesDir = Split-Path $here -Parent   # ..\app-1.0.0\resources
$healthSvcDirResolved = Join-Path $resourcesDir 'pos-health'

# ── Logging ──────────────────────────────────────────────────────────────────
$logDir  = "$env:ProgramData\POS System\logs"
$logFile = "$logDir\service-install.log"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

function Write-Log {
    param([string]$Msg)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Msg"
    Add-Content -Path $logFile -Value $line
    Write-Host $line
}

Write-Log "=== POS Service Installer started ==="
Write-Log "InstallDir: $InstallDir"

# ─────────────────────────────────────────────────────────────────────────────
# Helper: create a Windows Service that auto-starts and runs as SYSTEM
# ─────────────────────────────────────────────────────────────────────────────
function Install-WindowsService {
    param(
        [string]$Name,
        [string]$DisplayName,
        [string]$Description,
        [string]$BinaryPath
    )

    if (Get-Service -Name $Name -ErrorAction SilentlyContinue) {
        Write-Log "Service '$Name' already exists – skipping."
        return
    }

    New-Service `
        -Name        $Name `
        -DisplayName $DisplayName `
        -Description $Description `
        -BinaryPathName $BinaryPath `
        -StartupType Automatic | Out-Null

    Start-Service -Name $Name
    Write-Log "Installed and started service: $Name"
}

# ─────────────────────────────────────────────────────────────────────────────
# 1. Label Printer Service  (stub – binary not yet provided)
# ─────────────────────────────────────────────────────────────────────────────
$printerServiceExe = Join-Path $resourcesDir "LabelPrinterService\LabelPrinterService.exe"
if (Test-Path $printerServiceExe) {
    Install-WindowsService `
        -Name        "POS_LabelPrinterService" `
        -DisplayName "POS Label Printer Service" `
        -Description "Manages label printer communication for POS System." `
        -BinaryPath  "`"$printerServiceExe`""
} else {
    Write-Log "WARNING: Label printer service binary not found at '$printerServiceExe'. Skipping."
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. Python Hardware Bridge (integrates barcode scanners, cash drawers, etc.)
#    We use NSSM (Non-Sucking Service Manager) to wrap the Python script
#    as a proper Windows service.
# ─────────────────────────────────────────────────────────────────────────────
$nssmExe        = Join-Path $resourcesDir "nssm\nssm.exe"
$pythonExe      = Join-Path $resourcesDir "python\python.exe"
$hwBridgeScript = Join-Path $resourcesDir "hw_bridge\hw_bridge.py"

if ((Test-Path $nssmExe) -and (Test-Path $pythonExe) -and (Test-Path $hwBridgeScript)) {
    $svcName = "POS_HardwareBridge"
    if (-not (Get-Service -Name $svcName -ErrorAction SilentlyContinue)) {
        & $nssmExe install $svcName $pythonExe $hwBridgeScript 2>&1 | ForEach-Object { Write-Log $_ }
        & $nssmExe set $svcName DisplayName "POS Hardware Bridge" 2>&1 | Out-Null
        & $nssmExe set $svcName Description "Python-based bridge for barcode, cash drawer, and scale integration." 2>&1 | Out-Null
        & $nssmExe set $svcName Start SERVICE_AUTO_START 2>&1 | Out-Null
        & $nssmExe set $svcName AppStdout "$logDir\hw_bridge_stdout.log" 2>&1 | Out-Null
        & $nssmExe set $svcName AppStderr "$logDir\hw_bridge_stderr.log" 2>&1 | Out-Null
        Start-Service -Name $svcName
        Write-Log "Installed and started service: $svcName"
    } else {
        Write-Log "Service '$svcName' already exists – skipping."
    }
} else {
    Write-Log "WARNING: Python HW Bridge components not found. Skipping POS_HardwareBridge."
}

# ─────────────────────────────────────────────────────────────────────────────
# 3. POS Health Service – Node.js HTTP health check on localhost:5001
#    Uses WinSW (bundled as POS_HealthService.exe) to wrap service.js.
# ─────────────────────────────────────────────────────────────────────────────
$healthSvcName = "POS_HealthService"
$healthSvcDir  = $healthSvcDirResolved
$winsw         = Join-Path $healthSvcDir "POS_HealthService.exe"
$serviceScript = Join-Path $healthSvcDir "service.js"

if (-not (Get-Service -Name $healthSvcName -ErrorAction SilentlyContinue)) {

    # Locate node.exe on the system
    $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $nodeExe) {
        foreach ($candidate in @(
            "$env:ProgramFiles\nodejs\node.exe",
            "$env:ProgramFiles(x86)\nodejs\node.exe",
            "$env:APPDATA\nvm\v*\node.exe"
        )) {
            $resolved = Resolve-Path $candidate -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($resolved) { $nodeExe = $resolved.Path; break }
        }
    }

    if (-not $nodeExe -or -not (Test-Path $nodeExe)) {
        Write-Log "WARNING: node.exe not found – skipping POS_HealthService. Install Node.js and re-run install-services.ps1."
    } elseif (-not (Test-Path $winsw)) {
        Write-Log "WARNING: WinSW not found at '$winsw' – skipping POS_HealthService."
    } else {
        # Write WinSW XML config (must live alongside the .exe with same base name)
        $xmlPath = Join-Path $healthSvcDir "POS_HealthService.xml"
        @"
<service>
  <id>POS_HealthService</id>
  <name>POS Health Service</name>
  <description>POS System health check HTTP service on localhost:5001</description>
  <executable>$nodeExe</executable>
  <arguments>"$serviceScript"</arguments>
  <startmode>Automatic</startmode>
  <log mode="rotate">
    <sizeThreshold>5120</sizeThreshold>
    <keepFiles>3</keepFiles>
  </log>
  <logpath>$logDir</logpath>
  <logname>pos-health-winsw</logname>
</service>
"@ | Set-Content -Encoding UTF8 -Path $xmlPath

        Write-Log "Installing POS_HealthService via WinSW (node: $nodeExe)"
        $install = & $winsw install 2>&1
        Write-Log "WinSW install: $install"
        $start = & $winsw start 2>&1
        Write-Log "WinSW start: $start"
        Write-Log "POS_HealthService installed. Health endpoint: http://localhost:5001/health"
    }
} else {
    Write-Log "Service '$healthSvcName' already exists – skipping."
}

# ─────────────────────────────────────────────────────────────────────────────
# 4. Windows Firewall rules – allow local loopback traffic for the services
#    (services listen on localhost only – NOT exposed to the network)
# ─────────────────────────────────────────────────────────────────────────────
$fwRules = @(
    @{ Name = "POS HW Bridge IN";   Port = 5000; Direction = "Inbound" },
    @{ Name = "POS HW Bridge OUT";  Port = 5000; Direction = "Outbound" },
    @{ Name = "POS Health IN";      Port = 5001; Direction = "Inbound" },
    @{ Name = "POS Health OUT";     Port = 5001; Direction = "Outbound" }
)
foreach ($rule in $fwRules) {
    if (-not (Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule `
            -DisplayName    $rule.Name `
            -Direction      $rule.Direction `
            -Protocol       TCP `
            -LocalPort      $rule.Port `
            -Profile        Private,Domain `
            -Action         Allow | Out-Null
        Write-Log "Firewall rule created: $($rule.Name)"
    }
}

Write-Log "=== POS Service Installer finished ==="
exit 0
