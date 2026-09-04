# Local computer control (look-only map)

Look-only architecture notes for **REQ-189**
([open-swarm#645](https://github.com/matthewhand/open-swarm/issues/645)).
No runtime product change. Secret values are omitted; environment **names**
only.

**Scope:** how OpenMausBot lets a bot drive a **local** desktop — the host
machine (“This computer”) and the isolated **Local VM** (Docker / Podman /
Apple `container`). **Out of scope:** Box cloud computers, BYO-VPS, the
built-in Browser panel / CDP tools, Android USB, SaaS browser products.

Related product docs (user-facing, not this map):

- [Give a bot a computer](../../apps/docs/content/docs/computers/index.mdx)
- [This computer](../../apps/docs/content/docs/computers/local-computer.mdx)
- [Local VM](../../apps/docs/content/docs/computers/local-vm.mdx)
- [Ubuntu Desktop](../linux-desktop.md)
- [Computer-use decision doc (2026-08-12)](../computer-use-integration.md)

---

## 1. Two local backends (do not collapse them)

| | **This computer** (host / bare metal) | **Local VM** (container desktop) |
|---|---|---|
| Destination on the bot | `computer: "local"` | `computer: "vm"` |
| Isolation | None — the user’s live desktop | Hardened container; only `/home/cua/workspace` is durable |
| Who owns the driver | **Electron main** spawns `cua-driver` so OS grants attribute to OpenMausBot | Supervisor inside the container; harness never reimplements input |
| Driver version (as of this map) | Packaged Linux host: **0.19.3** | Managed image: **0.20.0** (pinned wheel + digest) |
| Display | Host Xorg / macOS session | Guest `DISPLAY=:1` (XFCE) |
| Person takeover | Physical mouse stays theirs (private logical cursor on Linux). Panel “take control” does **not** gate official host MCP. | Loopback noVNC; MCP bridge **refuses** agent `tools/call` while held |
| Default | Off. Linux also needs a global beta opt-in. Auto never picks Linux host. | Off until image + container are prepared. Auto never provisions it. |

Policy (decision doc + code): **CUA is the only local desktop-control
provider.** No cliclick, robotjs, nut.js, or Python `computer-server` on
the host path. The harness does not reimplement click / type / screenshot /
window discovery for Local VM either — it only owns sandbox lifecycle.

Windows: **This computer is not mounted** (`shouldMountLocalComputer` is
darwin/linux only). Local VM on Windows prefers **Podman**.

---

## 2. End-to-end shape

```text
SPA Computer panel  ──HTTP──▶  harness (server/index.ts)
   │  Runs on: Cloud | Local VM | This computer | Off
   │  take / release / dismiss-help
   │  Local VM lifecycle + preview screenshot
   ▼
Electron main (host only)
   └── cua-driver serve --embedded --socket <private>
         └── writes <userData>/cua-connection.json

Turn start (server/index.ts send path)
   bot.computer === "local"  →  readCuaConnection()  →  integrations.localComputer
        command/args/env = official `cua-driver mcp --embedded --socket …`
        scope = "local-computer"  →  permission broker, no MCP pre-allow
   bot.computer === "vm"     →  containerComputerMcp()
        node container-mcp.ts → docker|podman|container exec
        → `cua-driver mcp --socket /run/user/1000/openmausbot-cua.sock`
        no host scope          →  isolated; Claude pre-allows mcp__computer
   who-is-driving (VM/VPS)   →  OMB_CONTROL_URL + OMB_CONTROL_TOKEN on the bridge
```

Browser-only SPA (`window.ogb` absent) reports
`localComputer.reasonCode: "desktop-app-required"`. Host control cannot
start. Local VM lifecycle still works if the **harness process** has a
container runtime — that is a property of the server machine, not of the
tab.

---

## 3. Entry points

### 3.1 SPA (human)

| Surface | File | Role |
|---|---|---|
| Computer panel | `src/components/ComputerPanel.tsx` | Destination picker, preview, take/release, Local VM create/stop, Linux/macOS host cards |
| Destination rules | `src/lib/local-computer.ts` | When “This computer” is selectable; Linux Auto never picks host |
| Take/release choreography | `src/lib/computer-control.ts` | Coordinates harness lease + Electron browser gate |
| Settings → Local VM | `src/components/LocalComputerSection.tsx` | Shared image pull, shared/per-bot policy, watch screenshot |
| Linux host opt-in | `src/components/LinuxLocalControl.tsx` | Enable / disable / retry via `window.ogb.localControl` |
| macOS grants | `src/components/MacLocalControl.tsx` | Deep-link Accessibility + Screen Recording, then retry |
| Linux view-only preview | `src/components/LocalScreenPreview.tsx` | User-initiated `getDisplayMedia`; **not** control |
| Capability cache | `src/lib/desktop.ts`, `src/components/DesktopCapabilities.tsx` | Electron IPC vs browser fallback |
| IPC types | `src/types/ogb.d.ts` | `localControl`, `getCapabilities`, `screenFrame` |

Panel destination buttons: **Cloud / Local VM / This computer / Off**
(`bot.computer`). Switching to host while Auto-approve is on shows
`LocalComputerAutoWarning`.

The built-in **Browser** tab on the same panel is a different stack
(Electron `WebContentsView` + CDP). Ignore it for this map.

### 3.2 HTTP API (harness)

Routed in `server/index.ts`. Mutating computer routes require
`Content-Type: application/json` (non-simple; no CORS grant).

**Host / shared hold**

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/bots/:id/computer/control` | Person: snapshot, `take`, `release`, `dismiss-help` (optional `controlLeaseId`) |
| GET/POST/DELETE | `/api/internal/computer-control?botId=` | Proxies: hold snapshot, `requestHelp`, expire plea. Bearer `OMB_CONTROL_TOKEN`. |
| POST | `/api/local-computer/interrupt` | Stop every bot currently on `computer: "local"` (used before Linux disable/retry) |

**Local VM lifecycle** (shared target = App Settings; per-bot = Computer panel)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/local-computer` | Shared VM + runtime/image status |
| POST | `/api/local-computer/{pull,run,start,stop,remove}` | Shared lifecycle (`start` is rejected: recreate instead) |
| POST | `/api/local-computer/screenshot` | Shared preview (`get_desktop_state` + file) |
| GET | `/api/bots/:id/local-computer` | That bot’s target (shared or `per-bot`) |
| POST | `/api/bots/:id/local-computer/{run,stop,remove}` | Per-bot only; shared mode returns 409 |
| POST | `/api/bots/:id/local-computer/screenshot` | Per-bot preview |

`GET /api/bots/:id/computer` and
`POST /api/bots/:id/computer/{provision,join,sleep,exec,screenshot,remove}`
are **Box / VPS**, not host or Local VM.

Bot destination is ordinary bot PATCH (`computer`: `cloud` | `vm` |
`local` | `off`) via the store (`server/store.ts`).

### 3.3 CLI / MCP (coordination, not hands)

| Entry | File | Computer control? |
|---|---|---|
| `pnpm mcp` | `scripts/mcp-server.ts` | **No.** Docs: cannot approve, grant, or change computer/VM lifecycle. |
| `pnpm control:omb` | `scripts/control-omb.ts` | Verification adapter over the same MCP. Computer panel / VM modal **unmapped**. |
| `pair-cli` | packaged `dist-server/pair-cli.js` | Pairing only. |

There is **no** first-class CLI that clicks, types, or screenshots a
desktop. Agents get CUA only as an MCP server injected into Claude / Codex
/ ACP at turn start.

### 3.4 Electron (host daemon)

| File | Role |
|---|---|
| `electron/cua.mjs` | macOS embedded vs standalone; Linux runtime; IPC `cua:*` |
| `electron/cua-linux-runtime.cjs` | Opt-in daemon: `serve --embedded --no-overlay --permission-mode standard` |
| `electron/cua-linux.cjs` | Driver identity / doctor probes |
| `electron/cua-connection.cjs` | Persist `<userData>/cua-connection.json` |
| `electron/capabilities.cjs` | Session (Xorg/Wayland/headless); Wayland host control fail-closed |
| `electron/main.mjs` | `screen:frame` (macOS `desktopCapturer` only); preview intent |

Harness **must not** spawn host `cua-driver`. It only reads the
descriptor Electron wrote (`server/local-computer.ts`).

---

## 4. Mouse, keyboard, screenshot, window targeting

OpenMausBot does **not** implement a second input library. The agent’s
tool names are **Cua Driver’s official MCP surface**, forwarded as MCP
server `computer`.

Documented host tool list (`docs/computer-use-integration.md`, from
`cua-driver list-tools`):

`start_session`, `click`, `double_click`, `right_click`, `drag`, `scroll`,
`type_text`, `press_key`, `hotkey`, `move_cursor`, `get_window_state`,
`get_desktop_state`, `get_accessibility_tree`, `list_windows`,
`list_apps`, `launch_app`, `bring_to_front`, `check_permissions`,
`get_screen_size`, `zoom`, `screenshot`.

**Window targeting:** prefer accessibility / window ids over raw pixels
(`list_windows`, `get_window_state`, `bring_to_front`, `launch_app`,
AX paths). System prompt for both host and Local VM says: inspect desktop
state first; prefer accessibility over coordinates
(`server/index.ts` around the `computerKind` persona suffix).

**Linux host cursor:** daemon starts with `--no-overlay`. CUA uses a
**private logical cursor**; approved click/type still hit the requested
window; the user’s physical pointer is not stolen
(`docs/linux-desktop.md`, `electron/cua-linux-runtime.cjs`).

**macOS delivery ladder** (inside the binary, not OMB code):
`ax → ax_fg → cgevent → cgevent_fg → cgevent_hid` (background
pid-addressed input first).

**Screenshots — three different pipes**

| Who | Path | Notes |
|---|---|---|
| Agent on host | CUA `screenshot` / `get_desktop_state` via official MCP | Same socket as clicks |
| Agent on Local VM | Same CUA tools inside the container | Bridge is byte-transparent except hold gate |
| Panel preview, Local VM | `POST …/local-computer/screenshot` | `cua-driver call get_desktop_state --screenshot-out-file` then `base64`; PNG/JPEG footer check (`wholeScreenshot`) |
| Panel preview, macOS host | `window.ogb.screenFrame()` → `desktopCapturer` | First capture is the Screen Recording prompt. **Not** the agent tool. |
| Panel preview, Linux host | `LocalScreenPreview` + portal / Xorg `getDisplayMedia` | View-only. Starting preview **does not** grant control. |
| Person driving Local VM | noVNC `viewer_url` on `127.0.0.1` | Password in URL fragment; loopback bind required |

Host Linux panel does **not** poll CUA for a live frame (unlike macOS
`screenFrame`). Preview and control are independent.

---

## 5. Docker vs host display

### 5.1 Local VM = computer on this machine, not “OMB in Docker”

`server/container-computer.ts` is the Local VM:

- Runtime probe order: `docker`, `podman`, `container` (Apple).
- Base: `docker.io/trycua/xfce-cua` @ pinned digest; local tag
  `localhost/openmausbot/cua-local-vm:driver-0.20.0-v4`.
- Guest display **`:1`**. CUA serve:
  `cua-driver serve --socket /run/user/1000/openmausbot-cua.sock --permission-mode standard`
  with `DISPLAY=:1`, user `cua`.
- Viewer: container `6901` → host `127.0.0.1:6080` (shared) or an
  ephemeral loopback port (per-bot).
- Hardening checked before “ready”: loopback-only publish, cap-drop ALL +
  SETUID/SETGID, memory/CPU/pids, private ipc/cgroup, durable workspace
  mount, managed labels + exact driver version.
- Shared container name: `openmausbot-computer`. Per-bot:
  `openmausbot-computer-<sha256(botId)[0:16]>`, workspace under
  `DATA_DIR/vm-homes/<short>`.

MCP launch (`containerComputerMcp`): Node
`container-mcp.ts <runtime> <container> <socket>` →
`runMcpBridge` → `docker|podman exec -i -u cua -e DISPLAY=:1 … cua-driver mcp --socket …`.
The bridge (`server/mcp-bridge.ts`) defines **no tools**. Optional
**who-is-driving gate**: while the person holds control, `tools/call` is
answered locally and never forwarded.

`start` is intentionally unsupported (stale desktop); remove + recreate.

Compose files **do not** create this VM. The desktop app / harness shells
out to the host’s Docker/Podman.

### 5.2 `deploy/docker-compose.yml` = headless tenant, not host hands

Default compose (`deploy/docker-compose.yml`, `Dockerfile`):

- Node harness + static SPA; **no Electron**, **no `cua-driver`**, **no
  `DISPLAY`**, **no `docker.sock`**.
- Server binds loopback inside the container; Caddy shares the network
  namespace.
- Self-hosting doc: host desktop control is **desktop-app only**. Cloud
  or *container computers* can still run **if** that server process can
  reach a runtime — the stock compose image cannot talk to host Docker.

`deploy/docker-compose.dev.yml`: bind-mounts `OMB_DEV_HOME` as
`/host-home`, still no display and no Docker socket. Useful for LAN SPA
against a server; **not** a host-CUA fixture.

Implication for a compose-only OpenMausBot box: **This computer is
impossible**; **Local VM is not wired** unless you add a runtime + socket
(not in-tree).

### 5.3 Headless / LAN SPA on bare metal

`docs/headless-lan-access.md` + `docs/self-hosting.md`: harness without
Electron. Local VM **can** work if `docker`/`podman` is on that server’s
`PATH`. Host CUA **cannot** (no `cua-connection.json` writer).

---

## 6. Permissions and approvals

Layers, outermost first:

1. **OS / session**
   - macOS: Accessibility + Screen Recording; spawn from Electron main
     (TCC identity). Packaged: `EmbeddedCuaDriverHost`. Dev: often
     standalone `CuaDriver.app`.
   - Linux Xorg: explicit **Enable local control (Beta)**; bundled 0.19.3;
     fail-closed identity (path, hashes, private socket, live pids).
   - Linux Wayland: **blocked**
     (`linux-wayland-seat-safety-blocked`, issue #345). Legacy opt-in
     cleared. No env override. Preview still works via portal.
   - Windows host: unsupported.

2. **Global enable ≠ bot assignment.** Linux writes a supervised
   descriptor only after enable. Each bot must still be set to **This
   computer**. Preview never grants input.

3. **Engine capability.** `localComputerMcp` (Claude unless
   `bypassPermissions`; Codex; ACP/pi unless full-auto). Antigravity does
   **not** advertise host MCP. `bypassPermissions` **throws** if the turn
   would control the host.

4. **Permission broker (host only).** Host tools are **not** pre-allowed.
   Claude tags `mcp__computer*` with `approvalScope: "local-computer"`.
   Cards titled “Local computer approval”.
   `server/auto-approve.ts`: remembered always-allow does **not** fire for
   host unless the bot’s **Auto** switch is on (after the in-panel
   warning). Destructive/sensitive still card. Unattended/webhook turns
   never inherit Auto. Local VM is isolated: Claude **does** pre-allow
   `mcp__computer`.

5. **Who is driving** (`server/computer-control.ts`). In-memory per boot.
   Only the person `take`/`release`s. Bot may `requestHelp` (never grants).
   While held, **VM/VPS/box proxies** refuse actions (not queued). Host
   official `cua-driver mcp` is **not** wrapped by `mcp-bridge`, so the
   hold is **not** enforced on the host MCP byte stream — Linux also
   leaves the physical pointer with the user. Control client fail-open if
   the harness is unreachable (`server/control-client.ts`).

6. **Local VM sandbox contract.** Ready only if image labels, managed
   labels, loopback, hardening, durable mount, and CUA health + readiness
   screenshot all pass. Lease: one turn per VM target
   (`server/local-vm-lease.ts`). Idle timer (`server/local-vm-idle.ts`).

7. **Companion / LAN.** Companion must not call computer screenshot/exec
   APIs (`companion/test/routes.test.ts`). Loopback noVNC hidden from LAN
   clients (`canOpenExternalUrl` / `loopback-viewer`).

---

## 7. Environment variable **names** (no values)

### Host CUA (Electron / descriptor)

| Name | Where |
|---|---|
| `CUA_DRIVER_EMBEDDED` | Must be `1` on embedded MCP |
| `CUA_DRIVER_HOST_BUNDLE_ID` | `com.openmausbot.app` |
| `CUA_DRIVER_RS_UPDATE_CHECK` | Forced off on Linux descriptor |
| `CUA_DRIVER_RS_TELEMETRY_ENABLED` | Forced off |
| `CUA_DRIVER_RS_ENABLE_WAYLAND` | Present only on the (currently blocked) Wayland descriptor path |
| `CUA_DRIVER_PARENT_LIVENESS_STDIN` | Linux daemon child |
| `CUA_DRIVER_PATH` | Dev/override; **ignored as replacement** in packaged Linux |
| `OPENMAUSBOT_CUA_EMBEDDED` | Force embedded host in unpackaged macOS |
| `OPENMAUSBOT_CUA_SDK_LIBRARY` | Packaged macOS SDK dylib path |
| `OMB_USER_DATA` | Where harness looks for `cua-connection.json` |
| `APPIMAGE` | Triggers private 0700 CUA stage |
| `XDG_SESSION_TYPE` | `x11` / `wayland` — Wayland wins over `DISPLAY` |
| `WAYLAND_DISPLAY` | Implies Wayland even if `DISPLAY` exists |
| `DISPLAY` | Xorg / XWayland; **never** bypasses the Wayland gate |
| `XDG_CURRENT_DESKTOP` | Compositor doctor |
| `XDG_RUNTIME_DIR` | Private socket parent (mode/owner checked) |

### Local VM / who-is-driving

| Name | Where |
|---|---|
| `OMB_CONTROL_URL` | Loopback control endpoint (env, not argv) |
| `OMB_CONTROL_TOKEN` | Same |
| `OMB_CONTROL_POLL_MS` | Box proxy wait cadence (cloud file; same client) |
| `OMB_CONTROL_WAIT_MS` | Box proxy wait ceiling |
| `ELECTRON_RUN_AS_NODE` | Bridge / MCP child |
| `CUA_DRIVER_INSTALL_CHANNEL` | Guest exec (`python_package`) |
| `VNC_PW` | Guest viewer password (generated at `run`) |
| `DISPLAY` | Guest `:1` |

### Harness / compose (not CUA, but local deploy)

| Name | Where |
|---|---|
| `OMB_HOST` / `OMB_PORT` | Bind |
| `OMB_DATA_DIR` | Includes `vm-home` / `vm-homes` |
| `OMB_STATIC_DIR` | SPA |
| `OMB_AUTH_TOKEN` / `OMB_LAN_BYPASS_CIDR` / `OMB_CORS_ORIGIN` | LAN |
| `OMB_DEV_HOME` / `OMB_DEV_UID` / `OMB_DEV_GID` / `OMB_DATA_SUBDIR` | `docker-compose.dev.yml` |
| `OMB_WEBHOOK_PORT` / `OMB_WEBHOOK_PUBLIC_URL` / `OMB_PUBLIC_URL` | Prod compose |
| `OMB_EXTRA_PATH` | Linux CLI discovery |
| `ENGINES` / `DOMAIN` | Image / Caddy |

`OGB_BOX_*` appears in `computer-proxy.ts` (cloud REST adapter). Not a
local-control path.

---

## 8. Compose and dev docs (pointers)

| Doc / file | Relevance |
|---|---|
| `CONTRIBUTING.md` | `pnpm dev:server` + `pnpm dev` + `pnpm dev:desktop`; Ubuntu package checklist includes overlay-free CUA smoke |
| `docs/linux-desktop.md` | Host control enablement, Xorg vs Wayland, package hashes, `OMB_EXTRA_PATH` |
| `docs/self-hosting.md` | Compose tenant; host control desktop-only |
| `docs/headless-lan-access.md` | Bind/auth for SPA without Electron |
| `docs/mcp-server.md` | Coordination MCP cannot drive computers |
| `docs/verification/README.md` | `control:omb` does not prove Computer panel / VM modal |
| `docs/computer-use-integration.md` | 2026-08-12 CUA-only + Electron-owns-driver decision |
| `apps/docs/content/docs/computers/*.mdx` | Shipped user docs |
| `apps/docs/content/docs/security/permissions-and-secrets.mdx` | OS grants + approval cards |
| `deploy/docker-compose.yml` | Prod tenant (no CUA, no docker.sock) |
| `deploy/docker-compose.dev.yml` | Dev bind-mount home |
| `deploy/.env.example` / `.env.example` | Name lists above |
| `Dockerfile` | `ELECTRON_SKIP_BINARY_DOWNLOAD=1`; `HOME=/data` |
| `scripts/smoke-cua.mjs`, `scripts/smoke-cua-x11-input.mjs`, `scripts/smoke-cua-container.mjs` | Host / container smokes |
| `third_party/cua-driver/README.md` | 0.19.3 Linux host redistribution / SBOM |

Local VM config in app settings (also shown in user docs):

```json
{ "localVm": { "mode": "per-bot", "maxInstances": 2 } }
```

---

## 9. Turn mount (strict destinations)

`server/index.ts` (computer mount block):

- `vm` → Local VM lease + `containerComputerMcp`. **Must not** fall
  through to host CUA.
- `local` → `shouldMountLocalComputer` + `readCuaConnection()`. Fail if
  descriptor missing/invalid.
- `cloud` / Auto → Box or VPS (out of scope here). Auto may reuse a
  **ready** cloud box; Auto host fallback is **macOS only**.
- Linux Auto description: cloud if configured, else **off** — never the
  user’s desktop.

Engines that cannot mount (`localComputerMcp` / `computerMcp` false) get
a hard error if the user picked host or VM.

---

## 10. File pointer index

**Host CUA**

- `electron/cua.mjs`, `electron/cua-linux-runtime.cjs`, `electron/cua-linux.cjs`, `electron/cua-connection.cjs`, `electron/capabilities.cjs`
- `server/local-computer.ts` — decode + fail-closed Linux runtime revalidation
- `server/local-routing.ts` — who may mount host
- `third_party/cua-driver/` — packaged 0.19.3 provenance

**Local VM**

- `server/container-computer.ts` — image, run args, status, screenshot, MCP spawn
- `server/container-mcp.ts` — stdio entry
- `server/mcp-bridge.ts` — drain-safe pipe + optional hold gate
- `server/local-vm-lease.ts`, `server/local-vm-idle.ts`

**Hold + approvals**

- `server/computer-control.ts`, `server/control-client.ts`
- `server/auto-approve.ts`, `server/auto-review.ts`
- `server/drivers/claude.ts` (broker + `controlsHost`), `codex.ts`, `acp/core.ts`, `pi.ts`

**Cloud adapter (do not copy for local)**

- `server/computer-proxy.ts` — high-latency Box REST; Local VM bypasses this

**UI**

- `src/components/ComputerPanel.tsx`, `LocalComputerSection.tsx`, `LinuxLocalControl.tsx`, `MacLocalControl.tsx`, `LocalScreenPreview.tsx`, `LocalComputerAutoWarning.tsx`
- `src/lib/local-computer.ts`, `src/lib/computer-control.ts`, `src/lib/computer-panel-view.ts`

**Observation helpers** (crop / browser-target policy; used heavily by cloud proxy)

- `server/computer-observation.ts`

---

## 11. Notes for open-swarm adaptation (REQ-189)

Copy-shaped ideas (local only):

1. **One provider** for real desktop IO (here: CUA). Do not grow a second
   click stack beside it.
2. **Desktop process owns the host daemon**; the agent host only receives
   a validated MCP spawn contract.
3. **Split destinations:** host vs compose/container sandbox. Never let
   “VM” fall through to the user’s seat.
4. **Two consent bits on host:** global enable + per-agent assignment.
   Preview ≠ permission.
5. **Approvals stricter on host** than inside an isolated VM.
6. **Person hold** as a first-class lease; refuse (don’t queue) agent
   input while the human is driving a **shared** framebuffer (VM/VNC).
7. **Loopback-only viewer**; password not on argv.
8. **Fail closed** on session type, binary identity, and health.

Drop or defer for open-swarm:

- Box REST `computer-proxy.ts` fused screenshot/JPEG path (SaaS / WAN).
- macOS TCC / bundled ELF supply-chain (unless shipping an Electron host).
- Host MCP without a hold gate (OMB’s official `cua-driver mcp` on host
  does not see `ComputerControl`).
- Wayland host control (explicitly unsafe / blocked here).
- Coupling Local VM to “OMB in Docker”; they are different compose
  problems.

Phasing sketch (proposal only): SPA computer icon → destination enum →
permission cards → Docker sandbox with in-guest CUA + loopback viewer →
optional later host seat with OS grants. No Neon; SaaS browser deferred
per #645.
