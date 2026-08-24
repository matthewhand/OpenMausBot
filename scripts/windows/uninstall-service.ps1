# OpenMausBot Windows Service Uninstallation Script
# This script removes the OpenMausBot Windows service
#
# Prerequisites:
# - PowerShell 5.1+ (run as Administrator)
#
# Usage:
#   .\uninstall-service.ps1 [-ServiceName "OpenMausBot"]

param(
    [string]$ServiceName = "OpenMausBot",
    [switch]$Help
)

if ($Help) {
    Write-Host @"
OpenMausBot Windows Service Uninstallation

Usage: .\uninstall-service.ps1 [OPTIONS]

Options:
  -ServiceName <name>    Service name to uninstall (default: OpenMausBot)
  -Help                  Show this help message

Example:
  .\uninstall-service.ps1
"@
    exit 0
}

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator. Right-click PowerShell and select 'Run as Administrator'."
    exit 1
}

# Check if NSSM is available
$nssmExe = "$env:TEMP\nssm\nssm.exe"
if (-not (Test-Path $nssmExe)) {
    Write-Error "NSSM not found at $nssmExe. The service may have been installed differently."
    Write-Host "Trying to remove service using sc.exe..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName
    exit $LASTEXITCODE
}

# Check if service exists
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
    Write-Host "Service '$ServiceName' does not exist." -ForegroundColor Yellow
    exit 0
}

Write-Host "Uninstalling service '$ServiceName'..." -ForegroundColor Cyan

# Stop the service if running
if ($service.Status -eq 'Running') {
    Write-Host "Stopping service..." -ForegroundColor Yellow
    & $nssmExe stop $ServiceName
    Start-Sleep -Seconds 2
}

# Remove the service
& $nssmExe remove $ServiceName confirm

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Service uninstalled successfully!" -ForegroundColor Green
    
    # Ask about log cleanup
    $logDir = "$env:PROGRAMDATA\OpenMausBot\logs"
    if (Test-Path $logDir) {
        Write-Host "`nLog files are still present at: $logDir" -ForegroundColor Cyan
        $cleanup = Read-Host "Do you want to delete the log files? (Y/N)"
        if ($cleanup -eq 'Y' -or $cleanup -eq 'y') {
            Remove-Item $logDir -Recurse -Force
            Write-Host "✓ Log files deleted" -ForegroundColor Green
        }
    }
} else {
    Write-Error "Failed to uninstall service. Exit code: $LASTEXITCODE"
    exit $LASTEXITCODE
}
