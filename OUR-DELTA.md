# Fork Delta: matthewhand/OpenMausBot vs upstream milind-soni/OpenMausBot

This document lists the key differences and additional features in this fork compared to the upstream repository.

## Fork Status

- **Fork main** (this sync): 5 commits ahead of `milind-soni/OpenMausBot` `main`, 0 behind
- **Last synced**: 2026-08-28 — merged upstream `677538e` (`docs(contributing): MCP tool schemas must stay flat`) into the fork. The merge on this branch was conflict-free because fork `main` only carried `OUR-DELTA.md` plus prior upstream-merge commits.
- **Feature work** lives on open draft PRs, not on `main`. Those PR branches were merge-updated onto this sync (no force-push, no branch deletions). Historical PRs #1–#4 remain closed; use #14–#17. Closed original branches `cursor/tts-provider-selection-6ce3` (#3) and `cursor/custom-mcp-servers-5978` (#4) still conflict with current upstream and should not be revived.

## Open Draft Pull Requests

### #17: Windows NSSM Service ([PR #17](https://github.com/matthewhand/OpenMausBot/pull/17))
**Branch**: `feat/windows-nssm-service` (based on `feat/lan-auth`)  
**Status**: MERGEABLE (was CONFLICTING, now resolved)

**What it adds**:
- `scripts/windows/install-service.ps1` — Admin script to download NSSM 2.24, install OpenMausBot as a Windows service with auto-start and log rotation under `%PROGRAMDATA%\OpenMausBot\logs`
- `scripts/windows/uninstall-service.ps1` — Stop and remove the service
- `docs/windows-service.md` — Installation guide, token setup, and logging details
- Enforces: Off-machine bind without `-AuthToken` is refused (no bypass)
- Health probe uses Bearer auth when token is set

**Use case**: Run OpenMausBot headless on Windows Server or dedicated Windows machines with automatic startup.

---

### #16: Opt-in LAN Auth ([PR #16](https://github.com/matthewhand/OpenMausBot/pull/16))
**Branch**: `feat/lan-auth` (based on `main`)  
**Status**: MERGEABLE

**What it adds**:
- Environment variables: `OMB_HOST`, `OMB_PORT`, `OMB_AUTH_TOKEN`, `OMB_CORS_ORIGIN`
- Bearer token authentication for API requests when binding to non-loopback interfaces
- EventSource token support via `?access_token=` query parameter on `/api/events`
- Security: Server refuses to start if binding to `0.0.0.0` or other non-loopback addresses without `OMB_AUTH_TOKEN`
- Token trimming and validation
- UI localStorage token persistence (`ombAuthToken`)
- Companion sidecar presents `OMB_AUTH_TOKEN` automatically
- Updated documentation in `docs/headless-lan-access.md`

**Use case**: Securely access OpenMausBot web UI from other machines on your LAN (e.g., access a Windows Server installation from laptops/desktops).

---

### #15: Custom HTTP/SSE MCP Servers ([PR #15](https://github.com/matthewhand/OpenMausBot/pull/15))
**Branch**: `feat/custom-mcp-servers` (based on `main`)  
**Status**: MERGEABLE

**What it adds**:
- First-class support for custom HTTP and SSE MCP servers
- No Composio API key required for custom MCP servers
- Per-bot MCP server configuration with URL and custom headers
- Claude fake-CLI dumps include `{ type, url, headers }` and `mcp__<name>` allow/deny
- Reserved name validation in the editor
- Compatible with agents that support http/sse MCP capabilities (grok CLI, Claude ACP)

**Use case**: Connect bots to your own self-hosted MCP servers without going through Composio.

---

### #14: OpenAI-Compatible TTS ([PR #14](https://github.com/matthewhand/OpenMausBot/pull/14))
**Branch**: `feat/openai-compatible-tts` (based on `main`)  
**Status**: MERGEABLE

**What it adds**:
- OpenAI-compatible TTS provider alongside ElevenLabs
- Works with Kokoro, LiteLLM, OpenAI, or any OpenAI `/v1/audio/speech` compatible endpoint
- Per-provider configuration: separate keys, voice IDs, and models
- Voice list endpoints: tries `/audio/voices` then `/voices`
- Custom voice ID field in settings
- Per-bot voice storage separate from ElevenLabs voice IDs
- Sends model and `response_format: mp3` in requests

**Use case**: Use self-hosted or alternative TTS providers (like Kokoro) instead of being locked into ElevenLabs.

---

### #12: Bot-to-Bot Comm Popups ([PR #12](https://github.com/matthewhand/OpenMausBot/pull/12))
**Branch**: `feat/agent-comm-popups-v2` (based on `main`)  
**Status**: MERGEABLE

**What it adds**:
- Open bot-to-bot communication exchanges in a modal popup from the comm pill
- Focus trap (Tab wrap, skip hidden/disabled/aria-hidden)
- Focus returns to the chip when popup closes
- Surgical changes to ChatView/GroupView CommChip only
- Tests: `src/lib/comm-popup.test.ts`, `src/lib/focus-trap.test.ts`

**Use case**: Better UX when reviewing bot-to-bot delegations and approvals.

---

### #11: Loopback Viewer Protection ([PR #11](https://github.com/matthewhand/OpenMausBot/pull/11))
**Branch**: `feat/lan-loopback-viewer-v2` (based on `main`)  
**Status**: MERGEABLE

**What it adds**:
- Prevents opening loopback-bound computer URLs (noVNC `127.0.0.1:6080`) from LAN browser tabs
- `loopbackViewerUsable` / `canOpenExternalUrl` helpers in `src/lib/loopback-viewer.ts`
- Handles IPv4-mapped loopback addresses (`::ffff:127.0.0.1`, `[::ffff:7f00:1]`)
- Shows error message when trying to join loopback viewer from LAN
- Cloud desktop URLs still work from anywhere
- Frame src normalization for base64/data URLs

**Use case**: Prevent confusion when accessing OpenMausBot from LAN - loopback computer viewers won't open dead tabs.

---

## Key Fork Features Summary

1. **Headless Windows Service**: Run as a Windows service with NSSM for always-on operation
2. **Secure LAN Access**: Bearer token authentication for network access with mandatory security
3. **Custom MCP Servers**: First-class HTTP/SSE MCP support without Composio dependency
4. **Alternative TTS**: OpenAI-compatible TTS for self-hosted or alternative providers
5. **Better UX**: Popup comm viewers and loopback protection for LAN access

## Testing Status

All PRs include comprehensive test coverage:
- Server-side: `server/*.test.ts`
- Client-side: `src/**/*.test.ts`
- Integration tests for authentication, MCP, TTS, and UI components

## Security Notes

- LAN auth is **opt-in** with mandatory token requirement
- Non-loopback bind without token is a **hard error** (server refuses to start)
- No loopback exemption when `OMB_AUTH_TOKEN` is set
- Loopback viewer protection prevents accidental dead-tab scenarios
- All custom MCP headers are user-controlled (no automatic credential injection)

## Development

All branches have been updated to include the latest changes from fork main. Each PR is independently mergeable and can be tested in isolation.
