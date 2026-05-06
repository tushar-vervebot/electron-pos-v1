<#
.SYNOPSIS
    Uninstalls all POS hardware-integration services.
    Called by the WiX MSI deferred custom action (SYSTEM context, elevated).
    Runs BEFORE files are removed so WinSW.exe is still present.

.NOTES
    Layout: <root>\app-1.0.0\resources\scripts\ (this script)
            <root>\app-1.0.0\resources\pos-health\ (WinSW)
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'   # don't abort if svc already gone

$here         = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
$resourcesDir = Split-Path $here -Parent   # ..\app-1.0.0\resources

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'   # don't abort if svc already gone

$logDir  = "$env:ProgramData\POS System\logs"
$logFile = "$logDir\service-uninstall.log"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

function Write-Log {
    param([string]$Msg)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Msg"
    Add-Content -Path $logFile -Value $line
    Write-Host $line
}

Write-Log "=== POS Service Uninstaller started ==="

# ─────────────────────────────────────────────────────────────────────────────
# Helper: stop and delete a Windows service
# ─────────────────────────────────────────────────────────────────────────────
function Remove-WindowsService {
    param([string]$Name)

    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $svc) {
        Write-Log "Service '$Name' not found – nothing to remove."
        return
    }

    if ($svc.Status -ne 'Stopped') {
        Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue
        Write-Log "Stopped service: $Name"
    }

    # sc.exe delete is the most reliable way to remove a service
    $result = & sc.exe delete $Name 2>&1
    Write-Log "Deleted service '$Name': $result"
}

# ─────────────────────────────────────────────────────────────────────────────
# 1. Label Printer Service
# ─────────────────────────────────────────────────────────────────────────────
Remove-WindowsService -Name "POS_LabelPrinterService"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Python Hardware Bridge (via NSSM)
# ─────────────────────────────────────────────────────────────────────────────
$nssmExe = Join-Path $resourcesDir "nssm\nssm.exe"
$svcName = "POS_HardwareBridge"

if (Test-Path $nssmExe) {
    # Use NSSM's own remove command for a clean unregister
    & $nssmExe stop   $svcName confirm 2>&1 | ForEach-Object { Write-Log $_ }
    & $nssmExe remove $svcName confirm 2>&1 | ForEach-Object { Write-Log $_ }
} else {
    # Fallback: plain sc.exe if NSSM isn't present
    Remove-WindowsService -Name $svcName
}

# ─────────────────────────────────────────────────────────────────────────────
# 3. POS Health Service (WinSW-managed)
# ─────────────────────────────────────────────────────────────────────────────
$healthSvcName = "POS_HealthService"
$winsw = Join-Path $resourcesDir "pos-health\POS_HealthService.exe"

if (Test-Path $winsw) {
    & $winsw stop    2>&1 | ForEach-Object { Write-Log $_ }
    & $winsw uninstall 2>&1 | ForEach-Object { Write-Log $_ }
    Write-Log "POS_HealthService removed via WinSW"
} else {
    # Fallback: plain sc.exe
    Remove-WindowsService -Name $healthSvcName
}

# ─────────────────────────────────────────────────────────────────────────────
# 4. Remove Firewall rules
# ─────────────────────────────────────────────────────────────────────────────
$fwRuleNames = @("POS HW Bridge IN", "POS HW Bridge OUT", "POS Health IN", "POS Health OUT")
foreach ($ruleName in $fwRuleNames) {
    Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    Write-Log "Removed firewall rule: $ruleName"
}

Write-Log "=== POS Service Uninstaller finished ==="
exit 0
