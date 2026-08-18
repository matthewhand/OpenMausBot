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

### Option 2: Packaged App (Headless Windows Server)

The packaged Electron app can run headless by starting it with the embedded harness server and accessing the web UI it serves.

#### Prerequisites

- Windows Server (tested on Windows Server 2019/2022)
- OpenMausBot installed (download from releases)
- Node.js 24+ and pnpm (if running from source)

#### Configuration

1. **Set environment variables** for the server:

Open PowerShell as Administrator:

```powershell
# Set system environment variables
[Environment]::SetEnvironmentVariable("OMB_HOST", "0.0.0.0", "Machine")
[Environment]::SetEnvironmentVariable("OMB_PORT", "8799", "Machine")
[Environment]::SetEnvironmentVariable("OMB_AUTH_TOKEN", "your-strong-random-token-here", "Machine")
[Environment]::SetEnvironmentVariable("OMB_CORS_ORIGIN", "*", "Machine")
```

Or create a `.env` file in the OpenMausBot data directory (`%USERPROFILE%\.openmausbot\.env`).

2. **Build the packaged app** (if running from source):

```bash
pnpm package:win
```

This creates `release/OpenMausBot-setup.exe`.

3. **Run headless** (see Windows Service section below for automatic startup).

#### Client Configuration

When accessing OpenMausBot from another machine, you need to provide the auth token:

1. Open `http://10.0.0.32:8799` in your browser (replace with your server IP)
2. Open browser console and set localStorage:

```javascript
localStorage.setItem('ombAuthToken', 'your-strong-random-token-here');
```

3. Refresh the page - you should now be authenticated

Or configure the token in `~/.openmausbot/config.json` on the client machine:

```json
{
  "apiToken": "your-strong-random-token-here"
}
```

## Testing Your Setup

1. **Check the server is listening**:

```bash
# On the server
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
# Should fail without token
curl http://10.0.0.32:8799/api/instances

# Should succeed with token
curl -H "Authorization: Bearer your-token" http://10.0.0.32:8799/api/instances
```

## Firewall Configuration

On Windows Server, you may need to allow incoming connections:

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

- Verify the server is running: `netstat -an | findstr :8799`
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
4. **Network isolation**: Use a VPN or restrict firewall rules to trusted IPs only
5. **Monitor logs**: Check `%APPDATA%\OpenMausBot\logs\server.log` regularly
6. **Backup**: Regularly backup `%USERPROFILE%\.openmausbot\` directory

## Next Steps

For automatic startup on Windows Server, see the [Windows Service documentation](./windows-service.md).

To enable LAN access before setting up the service, ensure you've configured the environment variables as described in this guide.
