// Bind-address gate: loopback may stay unauthenticated; a non-loopback
// listen without OMB_AUTH_TOKEN must refuse to start.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { isLoopbackBindHost, lanBindAllowed } from "./lan-bind.ts";
import { removeTempDir, waitForExit } from "./testing/cleanup.ts";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SERVER_DIR, "..");

describe("isLoopbackBindHost", () => {
  it("accepts IPv4 loopback, localhost, and ::1", () => {
    expect(isLoopbackBindHost("127.0.0.1")).toBe(true);
    expect(isLoopbackBindHost("127.4.5.6")).toBe(true);
    expect(isLoopbackBindHost(" localhost ")).toBe(true);
    expect(isLoopbackBindHost("LocalHost")).toBe(true);
    expect(isLoopbackBindHost("localhost.")).toBe(true);
    expect(isLoopbackBindHost("::1")).toBe(true);
    expect(isLoopbackBindHost("[::1]")).toBe(true);
    expect(isLoopbackBindHost("0:0:0:0:0:0:0:1")).toBe(true);
  });

  it("rejects unspecified and off-machine addresses", () => {
    expect(isLoopbackBindHost("0.0.0.0")).toBe(false);
    expect(isLoopbackBindHost("::")).toBe(false);
    expect(isLoopbackBindHost("[::]")).toBe(false);
    expect(isLoopbackBindHost("192.168.1.10")).toBe(false);
    expect(isLoopbackBindHost("10.0.0.5")).toBe(false);
    expect(isLoopbackBindHost("127.0.0.1.example")).toBe(false);
    expect(isLoopbackBindHost("")).toBe(false);
    expect(isLoopbackBindHost("   ")).toBe(false);
  });
});

describe("lanBindAllowed", () => {
  it("allows loopback with or without a token", () => {
    expect(lanBindAllowed("127.0.0.1", null)).toBe(true);
    expect(lanBindAllowed("127.0.0.1", "")).toBe(true);
    expect(lanBindAllowed("localhost", undefined)).toBe(true);
    expect(lanBindAllowed("::1", "secret")).toBe(true);
  });

  it("allows off-machine bind only with a non-empty token", () => {
    expect(lanBindAllowed("0.0.0.0", "secret")).toBe(true);
    expect(lanBindAllowed("::", "secret")).toBe(true);
    expect(lanBindAllowed("192.168.1.10", "secret")).toBe(true);
    expect(lanBindAllowed("0.0.0.0", null)).toBe(false);
    expect(lanBindAllowed("0.0.0.0", "")).toBe(false);
    expect(lanBindAllowed("0.0.0.0", "   ")).toBe(false);
    expect(lanBindAllowed("10.0.0.5", undefined)).toBe(false);
  });
});

describe("off-machine bind without token", () => {
  it("exits non-zero and names OMB_AUTH_TOKEN before listening", async () => {
    const port = 40_000 + Math.floor(Math.random() * 20_000);
    const home = mkdtempSync(join(tmpdir(), "omb-lan-bind-"));
    mkdirSync(join(home, ".openmausbot"), { recursive: true });
    writeFileSync(
      join(home, ".openmausbot", "config.json"),
      JSON.stringify({ instances: { ghost: { driver: "not-a-real-driver", displayName: "Ghost" } } }),
    );

    const child = spawn(process.execPath, ["--experimental-strip-types", join(SERVER_DIR, "index.ts")], {
      cwd: ROOT,
      env: {
        ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        HOME: home,
        USERPROFILE: home,
        OMB_PORT: String(port),
        OMB_HOST: "0.0.0.0",
        OMB_WEBHOOK_PORT: String(port + 1),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr!.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const finished = await new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
      const timer = setTimeout(() => resolve({ code: child.exitCode, timedOut: true }), 8_000);
      timer.unref?.();
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve({ code, timedOut: false });
      });
    });

    if (finished.timedOut) {
      await waitForExit(child, { signal: "SIGKILL", graceMs: 1_000 });
      await removeTempDir(home);
      throw new Error(`server still running (listened?). stderr:\n${stderr}`);
    }

    await waitForExit(child, { graceMs: 1_000 });
    await removeTempDir(home);

    expect(finished.code).not.toBe(0);
    expect(stderr).toMatch(/OMB_AUTH_TOKEN/);
  }, 10_000);
});
