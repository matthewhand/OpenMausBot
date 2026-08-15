// LAN access authentication test: boots the harness server with OMB_AUTH_TOKEN
// and verifies that public API endpoints require authentication.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SERVER_DIR, "..");
const PORT = 18900 + Math.floor(Math.random() * 10_000);
const BASE = `http://127.0.0.1:${PORT}`;
const AUTH_TOKEN = "test-token-" + Math.random().toString(36);
const CORS_ORIGIN = "*";

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
  if (opts?.auth !== false) {
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
  home = mkdtempSync(join(tmpdir(), "omb-lan-test-"));
  // minimal fleet
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
      OMB_CORS_ORIGIN: CORS_ORIGIN,
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

describe("LAN access authentication", () => {
  it("allows /api/health without authentication", async () => {
    const res = await api("GET", "/api/health", { auth: false });
    expect(res.status).toBe(200);
    expect(res.body.app).toBe("openmausbot");
  });

  it("blocks /api/instances without authentication", async () => {
    const res = await api("GET", "/api/instances", { auth: false });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("unauthorized");
  });

  it("allows /api/instances with valid token", async () => {
    const res = await api("GET", "/api/instances");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.instances)).toBe(true);
  });

  it("blocks /api/instances with invalid token", async () => {
    const res = await api("GET", "/api/instances", { auth: "wrong-token" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("unauthorized");
  });

  it("blocks /api/bots without authentication", async () => {
    const res = await api("GET", "/api/bots", { auth: false });
    expect(res.status).toBe(401);
  });

  it("allows /api/bots with valid token", async () => {
    const res = await api("GET", "/api/bots");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.bots)).toBe(true);
  });

  it("blocks POST /api/bots without authentication", async () => {
    const res = await api("POST", "/api/bots", { body: {}, auth: false });
    expect(res.status).toBe(401);
  });

  it("allows POST /api/bots with valid token", async () => {
    const res = await api("POST", "/api/bots", { body: {} });
    expect(res.status).toBe(201);
    expect(res.body.bot).toBeDefined();
  });

  it("blocks /api/config without authentication", async () => {
    const res = await api("GET", "/api/config", { auth: false });
    expect(res.status).toBe(401);
  });

  it("allows /api/config with valid token", async () => {
    const res = await api("GET", "/api/config");
    expect(res.status).toBe(200);
  });

  it("includes CORS headers in responses", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.headers.get("access-control-allow-origin")).toBe(CORS_ORIGIN);
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
  });

  it("handles OPTIONS preflight requests", async () => {
    const res = await fetch(`${BASE}/api/instances`, {
      method: "OPTIONS",
      headers: {
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(CORS_ORIGIN);
  });
});
