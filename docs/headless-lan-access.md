# Headless Web UI and LAN Access

OpenMausBot can run headless (without the Electron desktop app) and be accessed from other machines on your network. This is useful for running OpenMausBot on a dedicated server (like a Windows Server) and accessing it from other computers.

## Overview

By default, OpenMausBot binds to `127.0.0.1` (localhost only) for security. To enable LAN access:

1. **Configure the host binding** to accept connections from your network
2. **Set up authentication** to protect the harness server
3. **Configure CORS** to allow your frontend origin
4. **Access from the LAN** using the server's IP address

## Security Warning

⚠️ **IMPORTANT**: When you bind OpenMausBot to your network interface (`0.0.0.0` or a specific IP), it becomes accessible to anyone on your network. This means:

- Anyone on your LAN can potentially access your bots, conversations, and connected services
- Without authentication (`OMB_AUTH_TOKEN`), there is **NO** access control
- Your API keys and credentials stored in OpenMausBot could be exposed
- Bots could be instructed to perform actions on your behalf

**Always set `OMB_AUTH_TOKEN` when binding to anything other than `127.0.0.1`.**

## Environment Variables

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OMB_HOST` | `127.0.0.1` | Host to bind the harness server (port 8799). Set to `0.0.0.0` for all interfaces or a specific IP for one interface. |
| `OMB_PORT` | `8799` | Port for the harness server. |
| `OMB_AUTH_TOKEN` | (none) | Bearer token required for all API requests. Set this to a strong random string when enabling LAN access. |
| `OMB_LAN_BYPASS_CIDR` | (none) | Subnet(s) allowed to bypass LAN authentication without a token (e.g. `10.0.0.0/24`, `192.168.1.0/24`, or `true` for all private subnets). |
| `OMB_CORS_ORIGIN` | (none) | CORS origin for the frontend. Set to `*` for any origin, or a specific origin like `http://10.0.0.32:5199`. |

### UI Configuration (Development)

| Variable | Default | Description |
|----------|---------|-------------|
| `OMB_UI_HOST` | `127.0.0.1` | Host to bind the Vite dev server (port 5199). Set to `0.0.0.0` for LAN access. |
| `OMB_UI_PORT` | `5199` | Port for the Vite dev server. |

## Setup Guide

### Option 1: Development Mode (pnpm dev)

For development with `pnpm dev` and `pnpm dev:server`:

1. **Create a `.env` file** in the project root:

```env
# Server (harness) configuration
OMB_HOST=0.0.0.0
OMB_PORT=8799
OMB_AUTH_TOKEN=your-strong-random-token-here
OMB_LAN_BYPASS_CIDR=10.0.0.0/24
OMB_CORS_ORIGIN=*

# UI (Vite) configuration
OMB_UI_HOST=0.0.0.0
OMB_UI_PORT=5199
```

2. **Generate a strong auth token**:

```bash
# On Linux/macOS
openssl rand -hex 32

# On Windows PowerShell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

3. **Start the servers**:

```bash
# Terminal 1: Start the harness server
pnpm dev:server

# Terminal 2: Start the UI dev server
pnpm dev
```

4. **Access from another machine**:

```
http://10.0.0.32:5199
```

Replace `10.0.0.32` with your server's actual IP address.

5. **Open the UI with the token once.** The browser cannot put a header on `EventSource`, so the first visit should be:

```
http://10.0.0.32:5199/?access_token=your-strong-random-token-here
```

The UI stores that value in `localStorage.ombAuthToken` and sends it as `Authorization: Bearer …` on every `fetch`. The SSE stream uses the same token as `?access_token=` on `/api/events`. Later visits to `http://10.0.0.32:5199` reuse the stored token.

### Option 2: Headless Daemon / Background Service

For unattended operation on a dedicated server (Linux, macOS, or Windows), install OpenMausBot as a background service with auto-start on boot and automatic crash recovery:

#### Linux (systemd)

Install OpenMausBot as a systemd service:

```bash
# System-wide service (runs on boot, recommended for headless servers)
sudo ./scripts/linux/install-service.sh --auth-token "your-strong-random-token"

# Or install as a user-level service
./scripts/linux/install-service.sh --user-mode --auth-token "your-strong-random-token"
```

Useful systemd commands:
```bash
sudo systemctl status openmausbot      # Check service status
sudo journalctl -u openmausbot -f     # Follow logs
sudo systemctl restart openmausbot     # Restart service
sudo ./scripts/linux/uninstall-service.sh  # Uninstall service
```

#### macOS (launchd)

Install OpenMausBot as a launchd service:

```bash
# Install as a user LaunchAgent (recommended for user session & CLI access)
./scripts/macos/install-service.sh --auth-token "your-strong-random-token"

# Or install as a system LaunchDaemon (runs before login)
sudo ./scripts/macos/install-service.sh --daemon --auth-token "your-strong-random-token"
```

Useful launchd commands:
```bash
launchctl list | grep openmausbot                       # Check status
tail -f ~/Library/Logs/OpenMausBot/service-stdout.log   # View stdout logs
tail -f ~/Library/Logs/OpenMausBot/service-stderr.log   # View stderr logs
./scripts/macos/uninstall-service.sh                    # Uninstall service
```

#### Windows (NSSM Service)

Install OpenMausBot as a Windows service using PowerShell (as Administrator):

```powershell
$token = [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
.\scripts\windows\install-service.ps1 -AuthToken $token
```

Useful PowerShell commands:
```powershell
Get-Service OpenMausBot                                                    # Check status
Get-Content "C:\ProgramData\OpenMausBot\logs\service-stdout.log" -Tail 50 # View logs
Stop-Service OpenMausBot                                                  # Stop service
.\scripts\windows\uninstall-service.ps1                                   # Uninstall service
```

See [docs/windows-service.md](./windows-service.md) for extensive Windows service configuration options.

#### Client Configuration

When accessing OpenMausBot from another machine, you need to provide the auth token:

1. Open `http://<SERVER_IP>:8799` in your browser (replace `<SERVER_IP>` with your server's IP)
2. Open browser console (F12) and set localStorage:

```javascript
localStorage.setItem('ombAuthToken', 'your-strong-random-token-here');
```

3. Or visit with the query parameter on first load:
```
http://<SERVER_IP>:8799/?access_token=your-strong-random-token-here
```

4. Refresh the page - you should now be authenticated.

## Testing Your Setup

1. **Check the server is listening**:

```bash
# On Linux / macOS
ss -tulpn | grep 8799  # or: lsof -i :8799

# On Windows
netstat -an | findstr :8799
```

You should see `0.0.0.0:8799` if bound to all interfaces.

2. **Test the health endpoint**:

```bash
# From another machine
curl http://10.0.0.32:8799/api/health
```

Should return: `{"app":"openmausbot","pid":12345,"static":true}`

3. **Test authenticated access**:

```bash
# Should fail without token (401 Unauthorized)
curl http://10.0.0.32:8799/api/instances

# Should succeed with token
curl -H "Authorization: Bearer your-token" http://10.0.0.32:8799/api/instances
```

## Firewall Configuration

### Linux (UFW / firewalld)

Allow incoming connections on port 8799:

```bash
# Ubuntu / Debian with UFW
sudo ufw allow 8799/tcp comment "OpenMausBot Harness"

# RHEL / Fedora / AlmaLinux with firewalld
sudo firewall-cmd --add-port=8799/tcp --permanent
sudo firewall-cmd --reload
```

### macOS Firewall

On macOS, allow Node.js or the port in System Settings → Network → Firewall, or via `pfctl` if strict packet filtering is enabled.

### Windows Firewall

On Windows Server or Windows 10/11:

```powershell
# Allow TCP port 8799 for the harness server
New-NetFirewallRule -DisplayName "OpenMausBot Harness" -Direction Inbound -Protocol TCP -LocalPort 8799 -Action Allow

# If using dev mode, also allow port 5199 for the UI
New-NetFirewallRule -DisplayName "OpenMausBot UI" -Direction Inbound -Protocol TCP -LocalPort 5199 -Action Allow
```

## Troubleshooting

### "unauthorized: valid OMB_AUTH_TOKEN required"

- Make sure you're sending the `Authorization: Bearer <token>` header
- Verify the token matches exactly (no extra spaces or newlines)
- Check the server logs for the expected token format

### "Connection refused"

- Verify the server is running: `ss -tulpn | grep 8799` or `netstat -an | findstr :8799`
- Check firewall rules allow incoming connections
- Verify `OMB_HOST` is set to `0.0.0.0` or your server's IP

### CORS errors in browser console

- Set `OMB_CORS_ORIGIN=*` or your specific origin
- Restart the server after changing environment variables
- Check browser console for the exact CORS error

### Server not binding to 0.0.0.0

- Verify environment variables are set correctly
- Restart the server after setting variables
- Check server logs for "Server bound to 0.0.0.0"

## Production Considerations

1. **Use a strong auth token**: Generate with `openssl rand -hex 32` or equivalent
2. **HTTPS**: Consider putting OpenMausBot behind a reverse proxy (nginx, Caddy) with HTTPS
3. **Restrict origins**: Set `OMB_CORS_ORIGIN` to your specific frontend URL instead of `*`
4. **Network isolation**: Use a VPN (e.g. Tailscale, WireGuard) or restrict firewall rules to trusted IPs only
5. **Monitor logs**: Check systemd journal (`journalctl -u openmausbot`), macOS logs (`~/Library/Logs/OpenMausBot`), or Windows logs (`%PROGRAMDATA%\OpenMausBot\logs`)
6. **Backup**: Regularly backup `~/.openmausbot` (or `%USERPROFILE%\.openmausbot`) directory

## Next Steps

For automated background startup on your OS:
- **Linux**: Use [scripts/linux/install-service.sh](../scripts/linux/install-service.sh) for systemd
- **macOS**: Use [scripts/macos/install-service.sh](../scripts/macos/install-service.sh) for launchd
- **Windows**: See the [Windows Service documentation](./windows-service.md) and [scripts/windows/install-service.ps1](../scripts/windows/install-service.ps1)
