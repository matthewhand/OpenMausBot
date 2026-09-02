### LAN / headless (Windows)

The harness can bind beyond localhost and run without the Electron window:

- `OMB_HOST=0.0.0.0` `OMB_PORT=8799` — listen on all interfaces
- `OMB_AUTH_TOKEN` — Bearer token required for `/api/*` except `/api/health`
- `OMB_CORS_ORIGIN` — CORS allow-list (`*` or a specific origin)
- `OMB_UI_HOST=0.0.0.0` — Vite dev UI on the LAN (`OMB_UI_PORT`, default 5199)

See [docs/headless-lan-access.md](docs/headless-lan-access.md). On Windows, [scripts/windows/install-service.ps1](scripts/windows/install-service.ps1) installs a headless NSSM service; details in [docs/windows-service.md](docs/windows-service.md).
