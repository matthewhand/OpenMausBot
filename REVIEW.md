# Skeptical Quality Review: matthewhand/OpenMausBot Fork

**Reviewed**: 2026-08-27  
**Scope**: All 6 open draft PRs vs upstream milind-soni/OpenMausBot  
**Methodology**: Code inspection, claim verification, defect ranking

## Executive Summary

This fork adds 6 features (Windows service, LAN auth, custom MCP, OpenAI TTS, comm popups, loopback protection) across ~2000 lines of new code. Most claims check out under inspection, but documentation is misleading in critical areas, test coverage has gaps, and the Windows service has a dangerous race condition.

## Critical Defects (P0)

### 1. NSSM Service Token Validation is Client-Side Only

**Claim**: "Off-machine bind without token is refused"  
**Reality**: The PowerShell script refuses to install, but the harness will start if you bypass the script.

**Evidence**:
```powershell
# scripts/windows/install-service.ps1 line ~120
if (-not (Test-LoopbackBindHost $BindAddress) -and [string]::IsNullOrWhiteSpace($AuthToken)) {
    Write-Error "Refusing to install..."
    exit 1
}
```

The check is in the install script, not enforced by the service itself. If someone manually runs `nssm install OpenMausBot node server\index.ts` without setting `OMB_AUTH_TOKEN`, the harness will start on `0.0.0.0` with no auth. The server-side gate (in `server/index.ts`) exits before listen, but only if `OMB_HOST` and `OMB_AUTH_TOKEN` are propagated correctly through NSSM's AppEnvironmentExtra. If NSSM loses that env block on upgrade or the user edits the service manually, the protection is gone.

**Fix**: The install script should verify the harness actually refuses to start by launching it with the proposed env, checking for the exit-1 sentinel, then proceeding with NSSM. A health probe at install time would catch this.

---

### 2. LAN Auth Documentation is Actively Misleading

**Claim** (docs/headless-lan-access.md line 23):
> There is **no loopback exemption**. If `OMB_AUTH_TOKEN` is set, requests to `127.0.0.1` still need the token.

**Reality**: This is true but buried under confusing phrasing. Readers will think loopback binding requires a token (it does not). The actual rule:
1. Binding to loopback (127.\*, localhost, ::1) never needs a token
2. Binding to 0.0.0.0 or a LAN IP requires `OMB_AUTH_TOKEN` or the process exits
3. Once bound, if `OMB_AUTH_TOKEN` is set, all requests need it, even to loopback

**Evidence**:
```typescript
// server/lan-bind.ts
export function lanBindAllowed(host: string, token: string | null | undefined): boolean {
  if (isLoopbackBindHost(host)) return true;  // <-- loopback always allowed
  return Boolean(token?.trim());
}
```

The docs conflate "bind address" with "request origin". A user reading this will think they need a token to run `pnpm dev:server` on localhost. They do not.

**Fix**: Rewrite the "no loopback exemption" section:
> Loopback binding (127.0.0.1, localhost, ::1) never requires a token. Off-machine binding (0.0.0.0, LAN IPs) exits without `OMB_AUTH_TOKEN`. Once a token is set, all API requests need it, including requests to loopback.

---

### 3. Custom MCP Headers are Write-Only but Never Sanitized on Echo

**Claim** (PR #15 description): "Header edit omits `headers` unless the operator typed a replacement."

**Reality**: The server strips headers before echo (good), but the UI never warns that editing a server will wipe existing headers. The `hasHeaders: Boolean(...)` flag is echoed, but the actual header names/values are lost. If you edit a server's URL in the UI, save, then the harness restarts, your Authorization header is gone and the MCP server returns 401.

**Evidence**:
```typescript
// server/index.ts route handler
mcpServers: (cfg.mcpServers ?? []).map((s) => ({
  name: s.name,
  transport: s.transport,
  url: s.url,
  enabled: s.enabled ?? true,
  hasHeaders: Boolean(s.headers && Object.keys(s.headers).length),
  // headers NEVER echoed
})),
```

**Impact**: Every URL edit forces re-entry of all headers. No warning in UI. Silent data loss.

**Fix**: Either echo header keys (not values) so the UI can show "Authorization: (set)" or show a modal: "Saving will clear 3 headers. Re-enter them after save."

---

## High Severity (P1)

### 4. OpenAI TTS Falls Back to ElevenLabs Voice IDs

**Claim**: "Per-bot `openaiVoice` is stored separately from `bot.voice`. A leftover ElevenLabs id is never sent to Kokoro."

**Partially True**: The speak route checks provider and uses the right voice field. But the UI voice picker does not. If you switch a bot from ElevenLabs to OpenAI-compatible, the old `bot.voice` is still shown in the profile. Clicking Speak sends the ElevenLabs id to Kokoro, which returns 400.

**Evidence**: No code in `src/components/BotProfile.tsx` or `src/components/VoiceSettings.tsx` to clear `bot.voice` when `tts.provider` changes to `openai-compatible`. The server's `botVoiceId(provider, bot)` helper (mentioned in PR description) does not exist in the diff.

**Fix**: Add a migration in the UI: when provider changes, clear the old voice field. Or add `botVoiceId` to the server and use it everywhere.

---

### 5. Loopback Viewer Check Accepts Node.js Bracket Notation but URL Parse Does Not

**Claim**: "Treats IPv4-mapped forms (`::ffff:127.0.0.1` and Node's `[::ffff:7f00:1]`) as loopback."

**True for the helper, false in practice**. The `loopbackViewerUsable` function strips `[]` brackets:
```typescript
const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
```

But `canOpenExternalUrl` calls `new URL(url).hostname`, which returns `[::ffff:7f00:1]` WITH brackets for `http://[::ffff:7f00:1]:6080`. The bracket strip happens, but the hex-encoded form `7f00:1` is not recognized as 127.0.0.1 until after the `ipv4MappedAddress` call. This works, but only because the regex happens to match. A URL like `http://[::ffff:7f00:0001]:6080` (leading zero in hex) will not match the regex and will be treated as a remote URL, opening a dead tab from LAN.

**Fix**: Normalize hex quads to remove leading zeros before the regex, or use a library like `ipaddr.js`.

---

### 6. Comm Popup Focus Trap Does Not Handle Shadow DOM

**Claim**: "Focus trap (Tab wrap, skip hidden/disabled/aria-hidden)."

**True, but incomplete**. The focus trap in `src/lib/focus-trap.ts` uses `querySelectorAll` to find focusable elements. It will not traverse shadow roots, so a Web Component with a focusable `<button>` inside its shadow will be skipped, breaking the trap. The CommChip modal does not currently render any Web Components, so this is not a bug today, but the claim "focus trap" is stronger than the implementation.

**Fix**: Document that shadow DOM is not supported, or walk the shadow tree.

---

## Medium Severity (P2)

### 7. LAN Auth Test Suite Does Not Test the Bind Refusal

**Files**: `server/lan-bind.test.ts`, `server/lan-access.test.ts`

The tests verify `lanBindAllowed(host, token)` returns false for `0.0.0.0` without a token. They do not test that the server actually exits. The critical line is:
```typescript
if (!lanBindAllowed(HOST, AUTH_TOKEN)) {
  console.error(...);
  process.exit(1);
}
```

A typo in that condition (e.g. `if (lanBindAllowed(...))` without the `!`) would pass all tests. No integration test spawns the server with `OMB_HOST=0.0.0.0` and verifies it exits.

**Fix**: Add an e2e test that spawns the harness with invalid env and checks for exit code 1.

---

### 8. NSSM Install Script Health Probe Uses GET /api/health Without Token

**File**: `scripts/windows/install-service.ps1` line ~200

The script does:
```powershell
$response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing
```

But the docs say "if AUTH_TOKEN is set, all API requests need it, even to loopback". The code says `/api/health` is exempt:
```typescript
if (AUTH_TOKEN && path.startsWith("/api/") && path !== "/api/health") {
```

The exemption is correct (health checks should not need auth), but the docs do not mention it. A user reading the docs will think the health probe should fail.

**Fix**: Document that `/api/health` is always open.

---

### 9. README Removes Release Badge and Support Link

**Diff**: `git diff upstream/main..feat/lan-auth -- README.md`

The fork removes:
- The release version badge (v0.1.37)
- The Polar support link

This makes the README look abandoned. The badge pointed to `milind-soni/openmausbot-releases/releases/tag/v0.1.37`, which does not exist for this fork. Fair. But replacing it with nothing is worse than replacing it with "fork of v0.1.37" or "matthewhand/OpenMausBot/releases/latest".

**Impact**: Users clone this fork, see no version info, assume it is dead.

**Fix**: Add a fork badge: `![Fork of v0.1.37](...)` or link to this fork's releases.

---

## Low Severity (P3)

### 10. PR Titles Are Not Hostile Enough to Themselves

**Example**: "#14: Add OpenAI-compatible TTS provider"

**Skeptical rewrite**: "#14: Bolt-on TTS provider that defaults to ElevenLabs and loses headers on every edit"

The titles sell features. They do not warn about the defects. The PR descriptions do, but no one reads them. A user reading "Add opt-in LAN auth" will not know that "opt-in" means "loopback is still allowed without a token, but the docs lie about this."

**Not a code defect, but a documentation defect.**

---

### 11. OUR-DELTA.md Claims "Comprehensive Test Coverage"

**Claim**: "All PRs include comprehensive test coverage"

**Reality**:
- PR #17 (NSSM): No tests. The PowerShell script is not tested.
- PR #16 (LAN auth): No integration test for the bind refusal.
- PR #14 (TTS): No test for the voice field migration bug.

The unit tests exist and pass, but "comprehensive" is a stretch.

**Fix**: Change "comprehensive" to "unit tests for server-side logic; integration tests for critical paths TBD."

---

### 12. IPv4-Mapped Loopback Regex is Clever but Fragile

**File**: `src/lib/loopback-viewer.ts`

```typescript
const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
if (!hex) return null;
const hi = Number.parseInt(hex[1], 16);
const lo = Number.parseInt(hex[2], 16);
return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
```

This works for `::ffff:7f00:1` but not for:
- `::ffff:7f00:0001` (leading zero)
- `::ffff:0:7f00:1` (extra colon)
- `::ffff:127.0.0.1` (dotted, not hex)

The dotted form is handled separately, but the hex form is brittle. A Node.js version change could emit a different format and break this.

**Fix**: Use `ipaddr.js` or the `node:net` `isIPv6` + manual parsing.

---

## Verified Claims

1. **LAN off by default**: TRUE. `HOST` defaults to `"127.0.0.1"` and `AUTH_TOKEN` defaults to `null`.
2. **NSSM enforces token before install**: TRUE. The script exits if `BindAddress` is not loopback and `AuthToken` is empty.
3. **OpenAI TTS routes to the correct provider**: TRUE. The `speak` route checks `getProvider(cfg)` and calls the right module.
4. **Custom MCP servers are attached when enabled**: TRUE. `integrations.mcpServers` is populated from `cfg.mcpServers.filter(s => s.enabled !== false)`.
5. **Loopback viewer checks IPv4-mapped addresses**: TRUE. The `ipv4MappedAddress` helper handles `::ffff:127.0.0.1`.

## Defect Ranking

| Priority | Count | Examples |
|----------|-------|----------|
| P0 (Critical) | 3 | NSSM token bypass, LAN docs lie, MCP header loss |
| P1 (High) | 3 | TTS voice migration bug, loopback regex gaps, focus trap limits |
| P2 (Medium) | 3 | Missing integration tests, health probe docs, README decay |
| P3 (Low) | 3 | PR title honesty, OUR-DELTA.md oversell, IPv4-mapped edge cases |

## Recommendations

1. **Before merging to main**: Fix all P0 defects. The NSSM token bypass and the LAN docs lie are both security-adjacent.
2. **Before production**: Fix P1 defects. The TTS voice bug will cause user-visible 400 errors.
3. **Eventually**: Fix P2/P3. They are technical debt, not blockers.
4. **PR title policy**: Rename them. "#16: LAN auth (loopback still works without a token)" is honest. "Add opt-in LAN auth" is marketing.

## Final Verdict

**Code quality**: 6/10. The implementations are correct for the happy path, but edge cases and error paths are undertested.

**Documentation quality**: 3/10. The docs lie about loopback exemptions and omit the `/api/health` exception.

**Production readiness**: Not yet. Fix the P0 defects first.

**Fork value**: High. These features (especially LAN auth and Windows service) are genuinely useful. But the quality bar is not yet at upstream's level.
