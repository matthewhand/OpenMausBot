# Windows Service Setup for OpenMausBot

Run OpenMausBot as a Windows service that starts automatically at boot, without requiring an interactive desktop session. This is ideal for running OpenMausBot on Windows Server or as a headless background service.

> **Cross-Platform Daemons:**
> - For **Linux (systemd)**, use [`scripts/linux/install-service.sh`](../scripts/linux/install-service.sh)
> - For **macOS (launchd)**, use [`scripts/macos/install-service.sh`](../scripts/macos/install-service.sh)
> - For headless LAN access guide across all platforms, see [Headless Web UI and LAN Access](./headless-lan-access.md)

## Overview

This setup uses **NSSM (Non-Sucking Service Manager)** to wrap the Node.js server as a Windows service. NSSM provides:

- ✅ Automatic startup at boot
- ✅ Restart on failure with throttling
- ✅ Log rotation
- ✅ Environment variable configuration
- ✅ No interactive session required
- ✅ Works on Windows Server and Windows 10/11

## Prerequisites

1. **Windows Server 2016+** or **Windows 10/11**
2. **Administrator privileges**
3. **OpenMausBot installed** (either packaged `.exe` or built from source)
4. **Node.js 24+** installed and in PATH
5. **PowerShell 5.1+** (included in Windows)

## Quick Start

### 1. Enable LAN Access (Required First)

Before installing the service, you must have completed **PR #1** (Enable Web UI LAN Access). The service needs the LAN binding configuration to be accessible from other machines.

See [docs/headless-lan-access.md](./headless-lan-access.md) for details on LAN configuration.

### 2. Install the Service

Open PowerShell as Administrator:

```powershell
cd "C:\path\to\OpenMausBot"
.\scripts\windows\install-service.ps1
```

The installer will:
- Auto-detect your OpenMausBot installation
- Download NSSM if needed
- Configure the service with default settings
- Start the service automatically

### 3. Custom Configuration

Install with custom settings:

```powershell
# Generate a strong authentication token
$token = [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# Install with custom configuration
.\scripts\windows\install-service.ps1 `
    -ServiceName "OpenMausBot" `
    -Port 8799 `
    -Host "0.0.0.0" `
    -AuthToken $token `
    -CorsOrigin "*"
```

**Options:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `-ServiceName` | `OpenMausBot` | Windows service name |
| `-Port` | `8799` | Server port |
| `-Host` | `0.0.0.0` | Bind address (`0.0.0.0` = all interfaces, `127.0.0.1` = localhost only) |
| `-AuthToken` | (none) | Bearer token for authentication (**required for LAN**) |
| `-CorsOrigin` | `*` | CORS origin (`*` = allow all, or specific origin like `http://10.0.0.32:5199`) |
| `-InstallDir` | (auto) | OpenMausBot installation directory |

### 4. Verify the Service

```powershell
# Check service status
Get-Service OpenMausBot

# View recent logs
Get-Content "C:\ProgramData\OpenMausBot\logs\service-stdout.log" -Tail 50

# Test the API
Invoke-RestMethod -Uri "http://localhost:8799/api/health"
```

## Managing the Service

### Start/Stop/Restart

```powershell
# Start
Start-Service OpenMausBot

# Stop
Stop-Service OpenMausBot

# Restart
Restart-Service OpenMausBot

# Check status
Get-Service OpenMausBot
```

### View Logs

Logs are written to `C:\ProgramData\OpenMausBot\logs\`:

```powershell
# View stdout (server output)
Get-Content "C:\ProgramData\OpenMausBot\logs\service-stdout.log" -Tail 50 -Wait

# View stderr (errors)
Get-Content "C:\ProgramData\OpenMausBot\logs\service-stderr.log" -Tail 50 -Wait
```

Log rotation is enabled automatically:
- Maximum log size: 10 MB per file
- Keeps 5 rotated files
- Old logs are automatically deleted

### Uninstall the Service

```powershell
.\scripts\windows\uninstall-service.ps1
```

This will:
- Stop the service
- Remove the service registration
- Optionally delete log files

## Accessing from the LAN

Once the service is running with `Host=0.0.0.0`, you can access OpenMausBot from other machines:

### 1. Find Your Server's IP Address

```powershell
# Get the server's LAN IP
Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Ethernet*", "Wi-Fi*" | 
    Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -ne "127.0.0.1" } | 
    Select-Object IPAddress
```

Example output: `10.0.0.32`

### 2. Configure Firewall

Allow incoming connections on the server port:

```powershell
New-NetFirewallRule `
    -DisplayName "OpenMausBot Service" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 8799 `
    -Action Allow
```

### 3. Access from Another Machine

Open a browser on another computer and navigate to:

```
http://10.0.0.32:8799
```

(Replace `10.0.0.32` with your server's actual IP address)

If you configured an auth token, you'll need to set it in the browser:

```javascript
// Open browser console (F12) and run:
localStorage.setItem('ombAuthToken', 'your-token-here');
```

Then refresh the page.

## Troubleshooting

### Service Won't Start

1. **Check the logs:**
   ```powershell
   Get-Content "C:\ProgramData\OpenMausBot\logs\service-stderr.log" -Tail 50
   ```

2. **Verify Node.js is in PATH:**
   ```powershell
   node --version
   ```

3. **Check service configuration:**
   ```powershell
   Get-Service OpenMausBot | Format-List *
   ```

4. **Try running manually first:**
   ```powershell
   cd "C:\path\to\OpenMausBot"
   $env:OMB_HOST = "0.0.0.0"
   $env:OMB_PORT = "8799"
   node --experimental-strip-types server/index.ts
   ```

### Port Already in Use

If port 8799 is already in use:

```powershell
# Find what's using the port
Get-NetTCPConnection -LocalPort 8799 | Select-Object -Property OwningProcess

# Install with a different port
.\scripts\windows\install-service.ps1 -Port 9000
```

### Service Keeps Restarting

Check for errors in the stderr log:

```powershell
Get-Content "C:\ProgramData\OpenMausBot\logs\service-stderr.log"
```

Common causes:
- Missing dependencies (`pnpm install`)
- Invalid configuration
- Port already in use
- Permission issues

### Can't Access from LAN

1. **Verify the server is listening on 0.0.0.0:**
   ```powershell
   netstat -an | findstr :8799
   ```
   Should show `0.0.0.0:8799` (not `127.0.0.1:8799`)

2. **Check Windows Firewall:**
   ```powershell
   Get-NetFirewallRule -DisplayName "OpenMausBot*" | Select-Object -Property DisplayName, Enabled, Direction, Action
   ```

3. **Test from the server itself:**
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:8799/api/health"
   ```

4. **Test from another machine:**
   ```bash
   curl http://10.0.0.32:8799/api/health
   ```

### Authentication Errors

If you get "unauthorized" errors:

1. **Verify the token is set:**
   ```powershell
   # Check service environment variables
   $nssmExe = "$env:TEMP\nssm\nssm.exe"
   & $nssmExe get OpenMausBot AppEnvironmentExtra
   ```

2. **Test with the token:**
   ```powershell
   $token = "your-token-here"
   $headers = @{ Authorization = "Bearer $token" }
   Invoke-RestMethod -Uri "http://localhost:8799/api/instances" -Headers $headers
   ```

## Advanced Configuration

### Change Service Configuration

To modify the service after installation:

```powershell
# Stop the service
Stop-Service OpenMausBot

# Modify configuration
$nssmExe = "$env:TEMP\nssm\nssm.exe"

# IMPORTANT: Each `nssm set AppEnvironmentExtra` call REPLACES all previous
# values. Always pass every variable in a single command.
& $nssmExe set OpenMausBot AppEnvironmentExtra "OMB_HOST=0.0.0.0" "OMB_PORT=9000" "OMB_AUTH_TOKEN=new-token"

# Start the service
Start-Service OpenMausBot
```

### Running Multiple Instances

You can run multiple OpenMausBot instances as separate services:

```powershell
.\scripts\windows\install-service.ps1 `
    -ServiceName "OpenMausBot-Dev" `
    -Port 8800

.\scripts\windows\install-service.ps1 `
    -ServiceName "OpenMausBot-Prod" `
    -Port 8799
```

### Service Recovery Options

NSSM is configured to:
- Restart on any failure
- Wait 5 seconds before restarting
- Throttle restarts (max 3 restarts in 10 minutes)

To customize recovery:

```powershell
$nssmExe = "$env:TEMP\nssm\nssm.exe"

# Change restart delay to 10 seconds
& $nssmExe set OpenMausBot AppRestartDelay 10000

# Change throttle window to 5 minutes
& $nssmExe set OpenMausBot AppThrottle 300000
```

## Security Best Practices

1. **Always use authentication when binding to 0.0.0.0**
   ```powershell
   $token = [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
   ```

2. **Restrict firewall rules to trusted IPs**
   ```powershell
   New-NetFirewallRule `
       -DisplayName "OpenMausBot Service" `
       -Direction Inbound `
       -Protocol TCP `
       -LocalPort 8799 `
       -Action Allow `
       -RemoteAddress "10.0.0.0/24"  # Only allow from your subnet
   ```

3. **Use HTTPS with a reverse proxy** (nginx, IIS, Caddy)

4. **Regularly update OpenMausBot**
   ```powershell
   Stop-Service OpenMausBot
   # Update OpenMausBot
   Start-Service OpenMausBot
   ```

5. **Monitor logs for suspicious activity**
   ```powershell
   Get-Content "C:\ProgramData\OpenMausBot\logs\service-stdout.log" -Wait | 
       Select-String -Pattern "unauthorized"
   ```

6. **Backup your configuration**
   ```powershell
   Copy-Item "$env:USERPROFILE\.openmausbot" -Destination "C:\Backups\openmausbot-$(Get-Date -Format 'yyyyMMdd')" -Recurse
   ```

## Production Checklist

Before deploying to production:

- [ ] PR #1 (LAN access) is deployed and tested
- [ ] Strong authentication token generated and configured
- [ ] Service installed with correct configuration
- [ ] Firewall rules configured
- [ ] HTTPS reverse proxy configured (optional but recommended)
- [ ] Logs directory has sufficient disk space
- [ ] Service starts automatically after reboot (test it!)
- [ ] Health endpoint accessible from expected clients
- [ ] Backup strategy in place for `~/.openmausbot` directory
- [ ] Monitoring/alerting configured for service failures

## Alternative: Task Scheduler

If you prefer not to use NSSM, you can use Windows Task Scheduler:

1. Create a `.bat` file:
   ```batch
   @echo off
   set OMB_HOST=0.0.0.0
   set OMB_PORT=8799
   set OMB_AUTH_TOKEN=your-token
   cd "C:\path\to\OpenMausBot"
   node --experimental-strip-types server\index.ts >> "C:\ProgramData\OpenMausBot\logs\openmausbot.log" 2>&1
   ```

2. Create a scheduled task:
   - Open Task Scheduler
   - Create Task → General → "Run whether user is logged on or not"
   - Triggers → New → "At startup"
   - Actions → New → Start a program → Your `.bat` file
   - Settings → "If task fails, restart every 5 minutes"

However, NSSM is **strongly recommended** over Task Scheduler because:
- Better error handling and recovery
- Automatic log rotation
- Easier management (PowerShell commands)
- Better integration with Windows services

## Related Documentation

- [LAN Access Setup](./headless-lan-access.md) - Headless setup and LAN access across Linux, macOS, and Windows
- [Linux systemd Install Script](../scripts/linux/install-service.sh) - Service installer for Linux
- [macOS launchd Install Script](../scripts/macos/install-service.sh) - Service installer for macOS
- [Windows Release Build](./.claude/skills/windows-release/SKILL.md) - Building Windows installer

## Support

If you encounter issues:

1. Check the logs in `C:\ProgramData\OpenMausBot\logs\`
2. Search existing issues: https://github.com/matthewhand/OpenMausBot/issues
3. Create a new issue with:
   - Service configuration (remove sensitive tokens!)
   - Log excerpts
   - Windows version
   - Node.js version
