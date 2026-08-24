# OpenMausBot Windows Service Installation Script
# This script installs OpenMausBot as a Windows service using NSSM (Non-Sucking Service Manager)
#
# Prerequisites:
# - PowerShell 5.1+ (run as Administrator)
# - NSSM (downloaded automatically if not present)
# - OpenMausBot installed
# - Node.js 24+ installed
#
# Usage:
#   .\install-service.ps1 [-ServiceName "OpenMausBot"] [-Port 8799] [-Host "0.0.0.0"] [-AuthToken "your-token"]

param(
    [string]$ServiceName = "OpenMausBot",
    [string]$Port = "8799",
    [string]$Host = "0.0.0.0",
    [string]$AuthToken = "",
    [string]$LanBypassCidr = "",
    [string]$CorsOrigin = "*",
    [string]$InstallDir = "",
    [switch]$Help
)

if ($Help) {
    Write-Host @"
OpenMausBot Windows Service Installation

Usage: .\install-service.ps1 [OPTIONS]

Options:
  -ServiceName <name>    Service name (default: OpenMausBot)
  -Port <port>           Server port (default: 8799)
  -Host <host>           Bind address (default: 0.0.0.0 for LAN access)
  -AuthToken <token>     Authentication token (required for LAN)
  -LanBypassCidr <cidr>  Subnets/CIDRs to allow without auth (e.g. "10.0.0.0/24" or "true")
  -CorsOrigin <origin>   CORS origin (default: *)
  -InstallDir <path>     OpenMausBot installation directory (auto-detected)
  -Help                  Show this help message

Examples:
  # Install with default settings
  .\install-service.ps1

  # Install with custom token
  .\install-service.ps1 -AuthToken "my-secure-token"

  # Install with custom port and localhost only
  .\install-service.ps1 -Port 9000 -Host "127.0.0.1"

Security Warning:
  When binding to 0.0.0.0, always set a strong AuthToken!
  Generate one with: [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
"@
    exit 0
}

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator. Right-click PowerShell and select 'Run as Administrator'."
    exit 1
}

# Auto-detect OpenMausBot installation directory
if (-not $InstallDir) {
    # Check common installation locations
    $possiblePaths = @(
        "$env:LOCALAPPDATA\Programs\OpenMausBot",
        "$env:PROGRAMFILES\OpenMausBot",
        "${env:PROGRAMFILES(X86)}\OpenMausBot",
        (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),  # Repo root (scripts/windows -> scripts -> root)
        "$PSScriptRoot",
        "$PWD"  # Current working directory
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path "$path\package.json") {
            $InstallDir = $path
            break
        }
    }
    
    if (-not $InstallDir) {
        Write-Error "Could not auto-detect OpenMausBot installation. Please specify -InstallDir"
        exit 1
    }
}

Write-Host "Using OpenMausBot installation at: $InstallDir" -ForegroundColor Cyan

# Verify Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "Found Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Error "Node.js is not installed or not in PATH. Please install Node.js 24+ first."
    exit 1
}

# Verify OpenMausBot is installed
if (-not (Test-Path "$InstallDir\server\index.ts") -and -not (Test-Path "$InstallDir\dist-server\index.js")) {
    Write-Error "OpenMausBot server not found in $InstallDir"
    exit 1
}

# Security warning
if ($Host -eq "0.0.0.0" -and [string]::IsNullOrWhiteSpace($AuthToken)) {
    Write-Warning @"

⚠️  SECURITY WARNING ⚠️
You are binding the server to 0.0.0.0 (all network interfaces) without an authentication token.
This will expose your OpenMausBot instance to anyone on your network!

It is STRONGLY RECOMMENDED to set an authentication token.
Generate one with:
  `$token = [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

Then re-run this script with: -AuthToken "`$token"

Press Ctrl+C to cancel or wait 10 seconds to continue anyway...
"@
    Start-Sleep -Seconds 10
}

# Download NSSM if not present
$nssmDir = "$env:TEMP\nssm"
$nssmExe = "$nssmDir\nssm.exe"

if (-not (Test-Path $nssmExe)) {
    Write-Host "Downloading NSSM (Non-Sucking Service Manager)..." -ForegroundColor Yellow
    $nssmZip = "$env:TEMP\nssm.zip"
    $nssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
    
    try {
        Invoke-WebRequest -Uri $nssmUrl -OutFile $nssmZip -UseBasicParsing
        Expand-Archive -Path $nssmZip -DestinationPath $env:TEMP -Force
        
        # Find the correct architecture
        $arch = if ([Environment]::Is64BitOperatingSystem) { "win64" } else { "win32" }
        New-Item -ItemType Directory -Path $nssmDir -Force | Out-Null
        Copy-Item "$env:TEMP\nssm-2.24\$arch\nssm.exe" $nssmExe -Force
        
        Remove-Item $nssmZip -Force
        Remove-Item "$env:TEMP\nssm-2.24" -Recurse -Force
        
        Write-Host "NSSM downloaded successfully" -ForegroundColor Green
    } catch {
        Write-Error "Failed to download NSSM: $_"
        exit 1
    }
}

# Stop and remove existing service if it exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Removing existing service '$ServiceName'..." -ForegroundColor Yellow
    & $nssmExe stop $ServiceName
    & $nssmExe remove $ServiceName confirm
    Start-Sleep -Seconds 2
}

# Determine the entry point
$useSource = Test-Path "$InstallDir\server\index.ts"
$nodeExe = (Get-Command node).Source
$serverScript = if ($useSource) { "$InstallDir\server\index.ts" } else { "$InstallDir\dist-server\index.js" }
$nodeArgs = if ($useSource) { "--experimental-strip-types", $serverScript } else { $serverScript }

Write-Host "Installing service '$ServiceName'..." -ForegroundColor Cyan

# Install the service
& $nssmExe install $ServiceName $nodeExe $nodeArgs

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install service"
    exit 1
}

# Configure the service
Write-Host "Configuring service..." -ForegroundColor Cyan

# Set working directory
& $nssmExe set $ServiceName AppDirectory $InstallDir

# Set environment variables (must be a single call — NSSM overwrites on each set)
$envVars = @("OMB_HOST=$Host", "OMB_PORT=$Port")
if (-not [string]::IsNullOrWhiteSpace($AuthToken)) {
    $envVars += "OMB_AUTH_TOKEN=$AuthToken"
}
if (-not [string]::IsNullOrWhiteSpace($LanBypassCidr)) {
    $envVars += "OMB_LAN_BYPASS_CIDR=$LanBypassCidr"
}
if (-not [string]::IsNullOrWhiteSpace($CorsOrigin)) {
    $envVars += "OMB_CORS_ORIGIN=$CorsOrigin"
}
& $nssmExe set $ServiceName AppEnvironmentExtra $envVars

# Set up logging
$logDir = "$env:PROGRAMDATA\OpenMausBot\logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

& $nssmExe set $ServiceName AppStdout "$logDir\service-stdout.log"
& $nssmExe set $ServiceName AppStderr "$logDir\service-stderr.log"

# Rotate logs (10 MB, keep 5 files)
& $nssmExe set $ServiceName AppStdoutCreationDisposition 4  # OPEN_ALWAYS
& $nssmExe set $ServiceName AppStderrCreationDisposition 4
& $nssmExe set $ServiceName AppRotateFiles 1
& $nssmExe set $ServiceName AppRotateBytes 10485760  # 10 MB
& $nssmExe set $ServiceName AppRotateOnline 1

# Configure service properties
& $nssmExe set $ServiceName DisplayName "OpenMausBot Agent Harness"
& $nssmExe set $ServiceName Description "OpenMausBot local-first chat app for running a team of AI agents"
& $nssmExe set $ServiceName Start SERVICE_AUTO_START

# Configure restart on failure
& $nssmExe set $ServiceName AppExit Default Restart
& $nssmExe set $ServiceName AppRestartDelay 5000  # 5 seconds

# Set restart throttling (don't restart more than 3 times in 10 minutes)
& $nssmExe set $ServiceName AppThrottle 600000  # 10 minutes in milliseconds

Write-Host "`nService installed successfully!" -ForegroundColor Green
Write-Host "`nService Details:" -ForegroundColor Cyan
Write-Host "  Name:        $ServiceName"
Write-Host "  Port:        $Port"
Write-Host "  Host:        $Host"
Write-Host "  Auth:        $(if ($AuthToken) { 'Enabled' } else { 'Disabled' })"
Write-Host "  Logs:        $logDir"
Write-Host "  Install Dir: $InstallDir"

Write-Host "`nStarting service..." -ForegroundColor Cyan
& $nssmExe start $ServiceName

Start-Sleep -Seconds 3

# Check if service is running
$service = Get-Service -Name $ServiceName
if ($service.Status -eq 'Running') {
    Write-Host "`n✓ Service is running!" -ForegroundColor Green
    
    # Test the endpoint
    Start-Sleep -Seconds 5
    try {
        $checkHost = if ($Host -eq "0.0.0.0") { "127.0.0.1" } else { $Host }
        $url = "http://${checkHost}:${Port}/api/health"
        $response = Invoke-RestMethod -Uri $url -TimeoutSec 5
        if ($response.app -eq "openmausbot") {
            Write-Host "✓ Server is responding at $url" -ForegroundColor Green
            
            # Get the server's IP address for LAN access
            if ($Host -eq "0.0.0.0") {
                $ipAddress = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Ethernet*", "Wi-Fi*" | Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -ne "127.0.0.1" } | Select-Object -First 1).IPAddress
                if ($ipAddress) {
                    Write-Host "`nAccess from LAN: http://${ipAddress}:${Port}" -ForegroundColor Cyan
                    if ($AuthToken) {
                        Write-Host "Auth header: Authorization: Bearer $AuthToken" -ForegroundColor Yellow
                    }
                }
            }
        }
    } catch {
        Write-Warning "Service is running but not responding yet. Check logs: $logDir"
    }
} else {
    Write-Warning "Service installed but not running. Status: $($service.Status)"
    Write-Host "Check logs at: $logDir"
}

Write-Host "`nUseful commands:" -ForegroundColor Cyan
Write-Host "  View service status:  Get-Service $ServiceName"
Write-Host "  Stop service:         Stop-Service $ServiceName"
Write-Host "  Start service:        Start-Service $ServiceName"
Write-Host "  View logs:            Get-Content '$logDir\service-stdout.log' -Tail 50 -Wait"
Write-Host "  Uninstall service:    .\uninstall-service.ps1"
