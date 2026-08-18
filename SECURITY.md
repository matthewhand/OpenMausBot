# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Email **soni.mil2001@gmail.com** with
the details (or use GitHub's private vulnerability reporting on this repo if enabled). You'll get a
response as soon as possible, normally within a few days.

## Scope notes for researchers

- The harness server defaults to **127.0.0.1** with no authentication — it trusts the local user.
  Off-machine bind (`OMB_HOST=0.0.0.0`, `::`, or a LAN IP) is allowed only with `OMB_AUTH_TOKEN`;
  the server refuses to start otherwise. See [`docs/headless-lan-access.md`](docs/headless-lan-access.md).
  Anything that makes the default unauthenticated loopback listener reachable from off-machine, or
  lets one local *unprivileged other user* drive it, is a vulnerability.
- API keys live in `~/.openmausbot/config.json` and are write-only through the API (`configured`
  booleans out, never values). Any path that echoes a stored secret back — API response, SSE event,
  log line, argv visible in `ps` — is a vulnerability.
- Agents run real CLIs (`claude`, `codex`) with the user's own privileges, and the permission broker
  is the consent layer for risky actions. Bypasses of the broker (approving without a user decision,
  spoofing the broker socket) are vulnerabilities.
- Spawning must never route user-influenced strings through a shell. Report any `shell: true` /
  `cmd.exe` string-building you find.
