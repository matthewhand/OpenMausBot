# LAN / Remote Web UI Access

OpenMausBot's web UI can be accessed from other devices on your local network with proper authentication.

## Default Behavior (Secure)

By default, OpenMausBot binds to `127.0.0.1:8799` and is **only accessible from the same machine**.
This is the secure default for local-first operation.

## Enabling LAN Access

### Prerequisites

- OpenMausBot running on your local machine
- Devices must be on the same local network (LAN)
- Authentication token required for security

### Step-by-Step Setup

1. **Open App Settings**
   - Click the gear icon in the sidebar footer
   - Navigate to **Remote Access** section

2. **Generate Authentication Token**
   - Click "Generate Authentication Token"
   - Copy and save the token securely (it won't be shown again)
   - This token is required for all API requests

3. **Configure Bind Address**
   - Choose `0.0.0.0 (all network interfaces)` to allow LAN access
   - Keep `127.0.0.1` for localhost-only (default)

4. **Enable LAN Access**
   - Check "Enable remote web UI access"
   - Save settings

5. **Restart OpenMausBot**
   - Network changes require a restart to take effect

### Finding Your LAN IP Address

**macOS / Linux:**
```bash
# Find your local IP
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**Windows:**
```cmd
ipconfig | findstr IPv4
```

Common LAN IP ranges:
- `192.168.x.x` (most home routers)
- `10.x.x.x` (corporate networks)
- `172.16.x.x` - `172.31.x.x` (private networks)

## Accessing from Another Device

### Web Browser

Navigate to `http://<your-lan-ip>:8799` in any browser on your network.

Note: You'll need to include the authentication token in requests. For programmatic access:

### API Requests with Authentication

```bash
# Using curl
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://192.168.1.100:8799/api/bots

# Using Python
import requests

headers = {"Authorization": "Bearer YOUR_TOKEN_HERE"}
response = requests.get("http://192.168.1.100:8799/api/bots", headers=headers)
```

### JavaScript/TypeScript

```typescript
const response = await fetch("http://192.168.1.100:8799/api/bots", {
  headers: {
    "Authorization": "Bearer YOUR_TOKEN_HERE"
  }
});
```

## Security Considerations

### Authentication

- **Token required:** Unauthenticated requests are rejected with HTTP 401
- **Token security:** Treat the token like a password; anyone with it can access your bots
- **Token rotation:** Generate a new token in App Settings → Remote Access → Rotate Token
- **Write-only storage:** Once saved, tokens are never displayed again

### Network Security

⚠️ **LAN access is for trusted networks only:**

- Designed for home/office LANs, not public networks
- Not a replacement for HTTPS/TLS on hostile networks
- Ensure your router firewall is configured properly
- Consider network segmentation for additional security

### Best Practices

1. **Use strong tokens:** The generated tokens are cryptographically secure
2. **Rotate regularly:** Change tokens if you suspect compromise
3. **Limit exposure:** Only enable LAN when needed
4. **Monitor access:** Check server logs for unauthorized attempts
5. **Firewall rules:** Configure your OS firewall to restrict access

## CORS Configuration (Optional)

For web applications running on a different origin:

1. In App Settings → Remote Access
2. Enter CORS Origin (e.g., `https://myapp.example.com`)
3. Save and restart

This allows browser-based JavaScript applications to make authenticated requests to your OpenMausBot API.

## Environment Variable Configuration

For advanced users or automation, network settings can be configured via environment variables:

```bash
# Bind address (default: 127.0.0.1)
export OMB_HOST=0.0.0.0

# Authentication token (required for LAN)
export OMB_AUTH_TOKEN=your-secure-token-here

# CORS origin (optional)
export OMB_CORS_ORIGIN=https://myapp.example.com

# Server port (default: 8799)
export OMB_PORT=8799

# Start OpenMausBot
./OpenMausBot
```

**Note:** Environment variables override settings stored in `~/.openmausbot/config.json`.

## Troubleshooting

### "Cannot enable LAN access without authentication token"

Generate a token first before enabling LAN access. This is a security requirement.

### "Connection refused" from another device

1. Verify OpenMausBot is running
2. Check bind address is `0.0.0.0` (not `127.0.0.1`)
3. Confirm you restarted after changing settings
4. Check firewall rules on the host machine
5. Verify devices are on the same network

### "Unauthorized" (HTTP 401)

1. Ensure you're including the `Authorization: Bearer <token>` header
2. Verify the token is correct (no extra spaces)
3. If token was rotated, use the new token
4. Check token wasn't accidentally modified

### Performance/connectivity issues

1. Check network quality (ping, bandwidth)
2. Consider wired vs wireless connection
3. Router QoS settings may affect performance
4. Large responses may be slow over WiFi

## Threat Model & Limitations

### What LAN Access Provides

✅ Token-based authentication  
✅ Protection against casual access  
✅ Suitable for trusted home/office networks  
✅ CORS support for web apps  

### What It Doesn't Provide

❌ HTTPS/TLS encryption (planned for future)  
❌ Multi-user authentication with separate credentials  
❌ Rate limiting or DDoS protection  
❌ Audit logging of access attempts  
❌ IP-based access control lists  

### Future Enhancements

Planned improvements for future releases:

- HTTPS/TLS support with automatic certificate generation
- Multiple authentication tokens with expiration
- IP allowlist/blocklist
- Access logs and monitoring dashboard
- Two-factor authentication (2FA)
- OAuth2 integration

## Windows Service Installation (Optional)

For always-on LAN access on Windows, consider running OpenMausBot as a service using NSSM (Non-Sucking Service Manager).

**Prerequisites:**
- OpenMausBot with LAN access configured
- NSSM installed (see Windows service scripts if available)

**Setup:**
1. Configure LAN access and auth token in UI
2. Install as service (see project's Windows service scripts)
3. Service runs on boot with configured settings

**Note:** This is optional and not required for LAN access. The desktop app works fine without service installation.

## API Endpoints

All endpoints require authentication when LAN is enabled (except `/api/health`).

### Health Check (Public)
```
GET /api/health
```
Returns server status. No authentication required.

### Bots
```
GET /api/bots
POST /api/bots
PATCH /api/bots/:id
DELETE /api/bots/:id
```

### Messages
```
POST /api/bots/:id/messages
```

### Configuration
```
GET /api/config
PUT /api/config
```

See server implementation for full API documentation.

## Support

For issues, questions, or feature requests:

1. Check this documentation first
2. Review GitHub issues: [OpenMausBot Issues](https://github.com/matthewhand/OpenMausBot/issues)
3. Open a new issue with:
   - Your configuration (redact tokens!)
   - Steps to reproduce
   - Error messages or logs
   - Network setup details

## License

This feature is part of OpenMausBot and is released under the MIT License.
See [LICENSE](../LICENSE) for details.
