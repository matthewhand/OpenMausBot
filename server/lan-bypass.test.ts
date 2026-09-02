// LAN access authentication bypass test: boots the harness server with OMB_AUTH_TOKEN
// and OMB_LAN_BYPASS_CIDR="127.0.0.1/32,10.0.0.0/24" to verify that matching clients bypass auth.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SERVER_DIR, "..");
const PORT = 19900 + Math.floor(Math.random() * 5_000);
const BASE = `http://127.0.0.1:${PORT}`;
const AUTH_TOKEN = "test-token-secret-123";
const BYPASS_CIDR = "127.0.0.1/32,10.0.0.0/24";

let child: ChildProcess;
let home: string;
let stderr = "";

const api = async (
  method: string,
  path: string,
  opts?: { body?: unknown; auth?: boolean | string },
): Promise<{ status: number; body: any }> => {
  const headers: Record<string, string> = {};
  if (opts?.body) headers["content-type"] = "application/json";
  if (opts?.auth !== false && opts?.auth !== undefined) {
    const token = typeof opts?.auth === "string" ? opts.auth : AUTH_TOKEN;
    headers["authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), "omb-bypass-test-"));
  mkdirSync(join(home, ".openmausbot"), { recursive: true });
  writeFileSync(
    join(home, ".openmausbot", "config.json"),
    JSON.stringify({ instances: { ghost: { driver: "not-a-real-driver", displayName: "Ghost" } } }),
  );

  child = spawn(process.execPath, ["--experimental-strip-types", join(SERVER_DIR, "index.ts")], {
    cwd: ROOT,
    env: {
      ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      HOME: home,
      USERPROFILE: home,
      OMB_PORT: String(PORT),
      OMB_HOST: "127.0.0.1",
      OMB_AUTH_TOKEN: AUTH_TOKEN,
      OMB_LAN_BYPASS_CIDR: BYPASS_CIDR,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr!.on("data", (c) => (stderr += c));

  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`server never came up. stderr:\n${stderr}`);
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}. stderr:\n${stderr}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}, 30_000);

afterAll(async () => {
  child?.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.on("close", () => resolve());
    setTimeout(() => (child.kill("SIGKILL"), resolve()), 5_000).unref?.();
  });
  rmSync(home, { recursive: true, force: true });
});

describe("LAN bypass mode (OMB_LAN_BYPASS_CIDR)", () => {
  it("reports authRequired: false in /api/health for bypassed loopback client", async () => {
    const res = await api("GET", "/api/health", { auth: false });
    expect(res.status).toBe(200);
    expect(res.body.app).toBe("openmausbot");
    expect(res.body.authRequired).toBe(false);
  });

  it("allows /api/instances without authentication when client matches bypass CIDR", async () => {
    const res = await api("GET", "/api/instances", { auth: false });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.instances)).toBe(true);
  });

  it("allows /api/config without authentication when client matches bypass CIDR", async () => {
    const res = await api("GET", "/api/config", { auth: false });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("mcpServers");
  });
});
