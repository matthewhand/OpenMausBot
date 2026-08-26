# Skeptical review: UI and architecture of this fork

- **Repository:** `matthewhand/OpenMausBot` (fork of `milind-soni/OpenMausBot`)
- **Reviewed at:** fork `main` = `04fb640` ("Merge latest milind-soni/OpenMausBot main into fork"), plus the six open draft PRs (#11, #12, #14, #15, #16, #17)
- **Date:** 2026-08-26
- **Reviewer:** Cursor cloud agent (Claude Fable 5)
- **Ground rules honored:** review only — nothing merged, no rebases onto upstream, no draft-PR conflicts touched, no secrets read or written. All numbers below were measured, not estimated.

## Verdict in one paragraph

The inherited codebase is better than a skeptic expects — disciplined two-process design, real tests (976 pass on fork `main`, 1,727 on the newest branch), write-only secrets, honest SSE replay semantics — but it has classic god-file growth (`server/index.ts` at 3,486 lines, hand-rolled routing) and an untyped `any` HTTP boundary in the UI that this fork's own branches trip over. The fork's six draft PRs range from genuinely good (custom MCP servers, loopback viewer) to needs-a-threat-model-conversation (LAN auth, NSSM service). The single most damaging problem, however, is not in any diff: the fork's branch topology makes four of the six PRs unreviewable and unmergeable as opened, because `main` is older than the branches' own bases.

---

## 1. The branch topology is the first thing to fix (highest severity, zero code)

Measured facts:

- Fork `main` contains **no original work** — its only commits not in upstream are two merge commits (`04fb640`, `e569fdb`). Everything else on `main` is upstream content.
- Fork `main` is **464 commits behind** upstream `main` (upstream is at ~v0.1.37; fork `main`'s `package.json` says 0.1.24).
- Four branches (`feat/lan-auth`, `feat/custom-mcp-servers`, `feat/openai-compatible-tts`, `feat/windows-nssm-service`) are based on upstream commit `04e2fe7` (~v0.1.32 era) — which is **newer than fork `main` itself**. `main` is older than its own feature branches' bases.

Consequences, visible in the open PRs right now:

| PR | Branch | Base | Diff as opened |
|---|---|---|---|
| #16 LAN auth | `feat/lan-auth` | `main` | **+79,166 / −3,039** (real feature: ~+1,048) |
| #15 Custom MCP | `feat/custom-mcp-servers` | `main` | **+79,070 / −3,008** (real: ~+953) |
| #14 OpenAI TTS | `feat/openai-compatible-tts` | `main` | **+79,259 / −3,054** (real: ~+1,143) |
| #17 NSSM service | `feat/windows-nssm-service` | `feat/lan-auth` | +778 (correctly stacked) |
| #12 Comm popups | `feat/agent-comm-popups-v2` | `main` | +442 (clean) |
| #11 Loopback viewer | `feat/lan-loopback-viewer-v2` | `main` | +216 (clean) |

A PR whose diff is 98.7% upstream drift cannot be reviewed, and merging any one of them would silently import ~76k lines of unreviewed upstream change into `main` as a side effect — after which the other three conflict. Note also that #16 and #17 carry parallel copies of the same LAN-auth commits under different SHAs (`a6834b5` vs `3dac265`, etc.), so merging both produces duplicate history even though the content converges.

**Recommendation** (not performed here, per the review-only instruction): advance fork `main` to at least `04e2fe7` (the branches' common base) with a plain merge, at which point PRs #14–16 collapse to their real ~1k-line diffs. Do this before spending any more effort on the feature branches themselves. Secondary hygiene: the remote carries superseded v1 branches (`feat/agent-comm-popups`, `feat/lan-loopback-viewer`, `feat/mcp-tts-lan-review`) alongside their v2 replacements — prune them.

## 2. Verification results (what actually runs)

- Fork `main`: `pnpm typecheck` passes. `vitest run`: **100 files, 976 passed, 8 skipped** under Node 24.
- `feat/lan-auth` (full suite, isolated worktree): **166 files, 1,727 passed, 8 skipped**. The 32 new LAN tests pass.
- `feat/agent-comm-popups-v2`: new focus-trap/comm-popup tests pass (15).
- **Trap worth fixing:** under Node 22 the suite fails with **85 confusing test failures** (spawned `node --experimental-strip-types` children behave differently). The `engines: ">=24"` field only produces a pnpm *warning*; nothing enforces it at runtime. A three-line version preflight at the top of `server/index.ts` would convert an hour of debugging into an immediate, explicit error.

## 3. The inherited architecture, read skeptically

Fork `main` is a snapshot of upstream, but every fork branch builds on this foundation, so its weaknesses are the fork's weaknesses.

### Credit where due

These are real strengths and the fork should preserve them: the two-process split (UI holds zero transports; one SSE stream with sequence numbers, a bounded replay buffer, and an *honest* refusal to partially replay — `server/index.ts:2325-2342`); write-only secrets (`GET /api/config` never echoes keys); loopback Host + Origin gates against DNS rebinding/CSRF; timing-safe token compares; atomic JSON writes plus `node:sqlite` for messages; Electron with `contextIsolation: true` and the sandbox kept on; and unusual test discipline — logic is systematically extracted into pure modules with co-located tests (88 test files on `main`).

### Where it will hurt

1. **`server/index.ts` is a 3,486-line hand-rolled router** (~68 route matches via `path === "..."` / `path.match(...)` against a shared scratch variable `let m`), inside a ~19,800-line non-test server. There is no middleware concept, so every cross-cutting concern — CORS, auth, origin checks — must be threaded by hand through the one giant `createServer` callback. This is not hypothetical: PR #16 had to edit global request handling inline, and all three large fork branches collide in this one file.
2. **The driver SPI leaks.** `server/contracts.ts` is admirably small, but `driverKind === "boxAgent"` special cases appear at least seven times in `server/index.ts` (lines 1102, 1218, 1225, 1264, 1380, 1422, plus `"grok"` at 1164). The "adding a provider is one file" claim in the README holds only for well-behaved providers.
3. **The UI's HTTP boundary is untyped.** The shared client is `api(path, init): Promise<any>` (`src/state/store.tsx:879`). `src/types/ogb.d.ts` types are asserted, never validated. Worse, components bypass the client with raw `fetch()` (`LocalComputerSection`, `Onboarding`, `InspectorPanel`, `ComputerPanel`, `SettingsModal`) — which is precisely why PR #16 needed a whack-a-mole commit titled "send Bearer on leftover fetches", and why PR #11 reintroduces the same bug (§5).
4. **One reducer, 58 action types, one context.** The store context value (`{ state, dispatch, refreshInstances }`, `store.tsx:1474`) changes on every dispatch, so every `useStore` consumer re-renders on every action. Partial mitigation exists — a separate `StreamContext` isolates high-frequency token streaming — but there are no selectors, and the reducer is a monolith that every feature must grow.
5. **Components are effectively untested.** 2 of 44 components in `src/components/` have test files. The extracted-logic-in-lib pattern covers algorithms, not rendering, wiring, or regressions in the 1,664-line `CursorAvatar.tsx`, 1,168-line `Sidebar.tsx`, or 1,055-line `ChatView.tsx`.
6. **Transcript rendering is windowed, not virtualized** (`slice(start, end)` over messages, `src/lib/transcript-window.ts:69`). Bounded and fine for now; will need revisiting if threads grow unbounded.

## 4. The fork's six branches, individually

### PR #16 — LAN auth (`feat/lan-auth`, ~1,048 real lines) — the centerpiece, and the one to slow down on

The detail-level engineering is genuinely careful: the server **refuses to bind** off-loopback without `OMB_AUTH_TOKEN` (`server/lan-bind.ts`, including IPv4-mapped forms like `::ffff:127.0.0.1`); the query-string token is accepted **only** on `GET /api/events` (EventSource can't send headers) and never on mutating routes; compares are constant-time; `?access_token=` is scrubbed from the address bar via `history.replaceState`; 32 tests pass; the docs are thorough.

The skepticism is at the threat-model level, not the code level:

1. **A single static bearer token over cleartext HTTP is the entire perimeter of an RCE API.** This server's purpose is spawning agent CLIs that execute shell commands on the host. There is no TLS story anywhere in the branch, so on a LAN the token traverses the wire in cleartext on every request — possession of one sniffed packet is code execution on the host. No rotation, no revocation, no per-client tokens, no rate limiting or lockout on failed auth.
2. **The token lives in `localStorage`** (`src/lib/lan-auth.ts`). This app renders agent-generated markdown, and its agents ingest untrusted web content — a prompt-injection-to-XSS-to-token-exfiltration chain is squarely inside this product's threat model. An `HttpOnly` cookie would also eliminate the query-token bootstrap entirely, since EventSource sends cookies.
3. **Setting the token weakens loopback defense.** `lanMode` disables the loopback-Host gate globally (`if (!lanMode && !isLoopbackHost(...))`), even when the server is still bound to 127.0.0.1 — the DNS-rebinding protection is traded for the token even for purely local use.
4. **`OMB_CORS_ORIGIN=*` is supported** and is the default in PR #17's install script. With a wildcard origin, any website the operator visits can read API responses if it ever obtains the token.
5. The Electron shell appends the token to the loaded URL even in dev (`electron/main.mjs` `withToken(DEV_URL)`), and the SSE query token will appear in any intermediary's access logs.

None of this makes the branch wrong; it makes "expose the harness to the LAN" a product decision that deserves an explicit threat-model document, not a flag. Alternatives worth weighing before shipping: recommend a WireGuard/Tailscale overlay instead of raw LAN exposure, or add TLS with a self-signed pinned cert; move the browser credential to an `HttpOnly` cookie; scope tokens.

### PR #17 — Windows NSSM service (`feat/windows-nssm-service`, stacked on #16)

- **Unverified supply chain:** the installer downloads `nssm-2.24.zip` (released 2014) from `nssm.cc` with **no checksum or signature verification**, while running as Administrator, then installs it as a service manager (`scripts/windows/install-service.ps1:132`).
- **Runs the harness as LocalSystem.** The script never sets `ObjectName`, and NSSM's default account is LocalSystem — so agent CLIs that execute arbitrary shell commands run as SYSTEM, reachable from the network. It should run as a named low-privilege (or at least the installing) user. Practical corollary: `claude`/`codex` logins live in the user profile; under SYSTEM those CLIs likely aren't logged in at all, so the service as installed may not be able to run any agent.
- **Insecure defaults:** `-Host "0.0.0.0"` and `-CorsOrigin "*"` are the defaults; the loopback-without-token refusal is correctly mirrored from `lan-bind.ts`, but the happy path steers users to maximum exposure. The token is echoed to the console at the end (`"Auth header: Authorization: Bearer $AuthToken"`) and stored in the registry via `AppEnvironmentExtra`.
- Readiness is `Start-Sleep`-based. Minor, but a retry loop against `/api/health` is barely more code.

### PR #15 — Custom MCP servers (`feat/custom-mcp-servers`) — the best of the six

Zod-validated config with reserved-name and duplicate guards; headers treated as write-only secrets with a careful merge so a header-less PUT can't wipe stored credentials (`mergeMcpServers`, `server/config.ts`); ACP transport-capability filtering with stdio always allowed; solid tests including fake-CLI integration. Two flags:

1. **Custom MCP tools bypass the approval broker.** The Claude driver pushes `mcp__${server.name}` onto the allowed-tools list (`server/drivers/claude.ts:~575`), blanket-authorizing *every tool* the remote server exposes, with no approval cards. This follows the existing Composio precedent, but Composio is a single vetted integration; an arbitrary user-entered URL is not. The README's headline promise is "bots ask before they act" — a per-server "auto-allow tools" checkbox (default off) would honor it.
2. `CustomMcpTab.tsx` is a 313-line new component with a test file — better than the codebase norm; noted approvingly.

### PR #14 — OpenAI-compatible TTS (`feat/openai-compatible-tts`)

Useful feature (Kokoro/LiteLLM support), key-optional for local servers, decent tests. Structural gripe: `server/tts/index.ts` now threads `if (provider === "openai-compatible")` through **every** function (`voiceConfigured`, `voiceReady`, `describeVoice`, `verifyKey`, `listVoices`, `speak`), and the flat config sprouts parallel fields (`key`/`openaiKey`, `voice`/`openaiVoice`, `openaiModel`). The branch's own commit history shows why this shape is risky — two of its seven commits fix key/voice cross-contamination between providers. A third provider forces the rewrite; a small `TtsProvider` interface would cost ~50 lines now.

### PR #12 — Comm popups (`feat/agent-comm-popups-v2`)

Small, based on current `main`, tested, and it *removes* inline JSX from `ChatView` rather than adding to it. The hand-rolled focus trap (`src/lib/focus-trap.ts`) is the weak spot: its selector misses `[contenteditable]` and `details > summary`, and `canTakeTab` checks the `hidden` attribute but not computed visibility, so `display:none` elements pass. For one popup it's acceptable; don't let it become the app's de-facto focus-trap library.

### PR #11 — Loopback viewer guard (`feat/lan-loopback-viewer-v2`)

Correct idea, correctly small: loopback noVNC URLs are meaningless from a LAN tab, so hide/refuse them and offer harness-proxied screenshot polling instead. Good tests including IPv4-mapped hosts. Two flags:

1. **Predicted integration bug with #16:** the new watch loop calls `fetch("/api/local-computer/screenshot", { method: "POST" })` raw — it does not go through `api()` and carries no Bearer header. #16's "leftover fetches" sweep patched the fetches that existed on *its* branch; this branch adds new ones on a branch without #16. Merge both and "Watch screen" 401s over LAN — the exact scenario this PR exists to serve. (This is the untyped/scattered-fetch weakness of §3.3 collecting its tax.)
2. Screenshot polling is a `POST` every 3 seconds for a read. It works, but it's chatty, uses POST-for-GET semantics, and ignores the existing SSE screen-frame channel (`replayBuffer` deliberately excludes `screen` frames, so SSE may be unsuitable — but then a `GET` with cache headers still reads better).

## 5. Cross-branch interaction risks (nobody's PR, everybody's problem)

- `src/state/store.tsx` is touched by #14, #15, and #16; `server/index.ts` by #14, #15, #16/#17; `server/tts/index.ts` and `src/lib/tts/index.ts` by #14 and #16. Whatever merges second conflicts. Merge order is effectively forced: fix `main`'s base (§1), then #16 → #17, with #15/#14 rebased between, then #11 patched for auth (§4/#11), then #12.
- #16 + #11: unauthenticated screenshot fetches break over LAN (detailed above).
- #16 + #17 duplicate-SHA history (detailed in §1).

## 6. Prioritized recommendations

1. **Repair the fork topology** (§1) before reviewing or merging anything else — advance `main` to `04e2fe7`+, retarget PRs, delete superseded v1 branches. Until then, PRs #14–16 cannot be meaningfully reviewed on GitHub at all.
2. **Write the LAN threat model down** before merging #16/#17: cleartext-HTTP bearer = RCE-on-host token; decide TLS vs overlay-network guidance; move the browser token out of `localStorage` (an `HttpOnly` cookie also kills the query-token path); reconsider `CORS_ORIGIN=*`; keep the loopback Host gate active for loopback clients even in LAN mode.
3. **Harden the NSSM installer:** pin an NSSM checksum (or vendor the binary), default `-Host` to `127.0.0.1`, set a service account, stop echoing the token, and document that SYSTEM has no agent-CLI logins.
4. **Route custom MCP tools through the permission broker** (or add an explicit per-server auto-allow opt-in) in #15.
5. **Type and centralize the HTTP boundary:** make `api()` generic over a typed route map (or zod-validate responses) and eliminate raw `fetch()` in components — this single change is what would have prevented both the "leftover fetches" churn in #16 and the predicted 401 in #11.
6. **Add a Node version preflight** to `server/index.ts` (§2) — the Node-22 failure mode currently looks like 85 unrelated broken tests.
7. **Extract a TTS provider interface** in #14 before a third provider lands.
8. Longer-term, inherited: split `server/index.ts` by resource with a tiny route table, and push `boxAgent` special cases behind the driver SPI.

## Not reviewed

`ios/`, `companion/` internals (beyond the proxy auth change), `cloudflare/composio-broker`, packaging/signing pipelines, and the `.claude/skills/windows-release` flow. Upstream's 464 newer commits were used only to position the fork, not reviewed.
