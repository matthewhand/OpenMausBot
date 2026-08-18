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
- A non-loopback bind **requires** `OMB_AUTH_TOKEN`; the server will refuse to start otherwise
- Your API keys and credentials stored in OpenMausBot could be exposed
- Bots could be instructed to perform actions on your behalf

**A non-loopback bind requires `OMB_AUTH_TOKEN`.** Loopback (`127.0.0.1`, other `127.*`, `localhost`, `::1`) still defaults to no auth.

There is **no loopback exemption**. If `OMB_AUTH_TOKEN` is set, requests to `127.0.0.1` still need the token. The Vite dev proxy does **not** inject a Bearer header.

## Environment Variables

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OMB_HOST` | `127.0.0.1` | Host to bind the harness server (port 8799). Set to `0.0.0.0` for all interfaces or a specific IP for one interface. Non-loopback binds require `OMB_AUTH_TOKEN`. |
| `OMB_PORT` | `8799` | Port for the harness server. |
| `OMB_AUTH_TOKEN` | (none) | Bearer token required for all API requests. **Required** when `OMB_HOST` is not loopback; the server will refuse to start without it. |
| `OMB_CORS_ORIGIN` | (none) | CORS origin for the frontend. Set to `*` for any origin, or a specific origin like `http://10.0.0.32:8799`. |

When `OMB_CORS_ORIGIN=*`, the server does **not** send `Access-Control-Allow-Credentials`. Use a specific origin if you need credentials.

## Setup Guide

### Option 1: Development Mode (pnpm dev)

For development with `pnpm dev` and `pnpm dev:server`:

1. **Create a `.env` file** in the project root (or export the variables in the shell that starts the server):

```env
# Server (harness) configuration
OMB_HOST=0.0.0.0
OMB_PORT=8799
OMB_AUTH_TOKEN=your-strong-random-token-here
OMB_CORS_ORIGIN=*
```

The Vite UI still binds `127.0.0.1:5199` in this PR. For LAN development, access the packaged/static harness on `OMB_PORT`, or run the UI on the same machine as Vite.

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

# Terminal 2: Start the UI dev server (localhost)
pnpm dev
```

4. **Access from another machine** (packaged/static UI served by the harness):

```
http://10.0.0.32:8799
```

Replace `10.0.0.32` with your server's actual IP address.

5. **Open the UI with the token once.** The browser cannot put a header on `EventSource`, so the first visit should be:

```
http://10.0.0.32:8799/?access_token=your-strong-random-token-here
```

The UI stores that value in `localStorage.ombAuthToken` and sends it as `Authorization: Bearer …` on every `fetch` through `api()`. The SSE stream uses the same token as `?access_token=` on `/api/events`. The token is then stripped from the address bar so it is not copied, bookmarked, or sent as a Referer. Later visits to `http://10.0.0.32:8799` reuse the stored token.

### Option 2: Packaged App (Headless)

The packaged Electron app can run headless by starting it with the embedded harness server and accessing the web UI it serves.

#### Configuration

1. **Set environment variables** for the server:

```powershell
# Windows (PowerShell as Administrator, machine-wide)
[Environment]::SetEnvironmentVariable("OMB_HOST", "0.0.0.0", "Machine")
[Environment]::SetEnvironmentVariable("OMB_PORT", "8799", "Machine")
[Environment]::SetEnvironmentVariable("OMB_AUTH_TOKEN", "your-strong-random-token-here", "Machine")
[Environment]::SetEnvironmentVariable("OMB_CORS_ORIGIN", "*", "Machine")
```

```bash
# Linux/macOS (export in the service/unit that starts the process)
export OMB_HOST=0.0.0.0
export OMB_PORT=8799
export OMB_AUTH_TOKEN=your-strong-random-token-here
export OMB_CORS_ORIGIN=*
```

The server reads these from the process environment. It does not load a `.env` file on its own.

2. **Run the harness** (`pnpm dev:server` from source, or start the packaged app so its embedded server is up).

#### Client Configuration

When accessing OpenMausBot from another machine, provide the auth token on the first visit:

```
http://10.0.0.32:8799/?access_token=your-strong-random-token-here
```

Or set it in the browser console before refresh:

```javascript
localStorage.setItem('ombAuthToken', 'your-strong-random-token-here');
```

Companion and Electron present `OMB_AUTH_TOKEN` to the harness automatically. The phone token still authenticates the sidecar, not the harness.

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

Should return: `{"app":"openmausbot","pid":12345,"static":true}` (or `static:false` in dev).

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
```

## Troubleshooting

### "unauthorized: valid OMB_AUTH_TOKEN required"

- Make sure you're sending the `Authorization: Bearer <token>` header (or `?access_token=` on `/api/events`)
- Verify the token matches exactly (no extra spaces or newlines)
- Loopback is not exempt — `127.0.0.1` also needs the token

### "Connection refused"

- Verify the server is running: `netstat -an | findstr :8799`
- Check firewall rules allow incoming connections
- Verify `OMB_HOST` is set to `0.0.0.0` or your server's IP

### CORS errors in browser console

- Set `OMB_CORS_ORIGIN=*` or your specific origin
- Restart the server after changing environment variables
- Check browser console for the exact CORS error
- `*` cannot be combined with credentials; this server omits `Allow-Credentials` when the origin is `*`

### Server not binding to 0.0.0.0

- Verify environment variables are set correctly
- Restart the server after setting variables
- Check server logs for a bind line like `openmausbot server on http://0.0.0.0:8799`
- A missing `OMB_AUTH_TOKEN` is a hard error: the process exits without listening and stderr names `OMB_AUTH_TOKEN`

## Production Considerations

1. **Use a strong auth token**: Generate with `openssl rand -hex 32` or equivalent
2. **HTTPS**: Consider putting OpenMausBot behind a reverse proxy (nginx, Caddy) with HTTPS
3. **Restrict origins**: Set `OMB_CORS_ORIGIN` to your specific frontend URL instead of `*`
4. **Network isolation**: Use a VPN or restrict firewall rules to trusted IPs only
5. **Monitor logs**: Check `%APPDATA%\OpenMausBot\logs\server.log` regularly
6. **Backup**: Regularly backup `%USERPROFILE%\.openmausbot\` directory
