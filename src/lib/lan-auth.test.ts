import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { LAN_AUTH_STORAGE_KEY, lanAuthHeaders, lanAuthRequestInit, readLanAuthToken } from "./lan-auth";

function memoryStorage(initial?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    store,
    storage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    },
  };
}

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function headerValue(headers: HeadersInit | undefined, name: string): string | null {
  return new Headers(headers).get(name);
}

describe("readLanAuthToken", () => {
  it("bootstraps from ?access_token= and persists it", () => {
    const { store, storage } = memoryStorage();
    expect(readLanAuthToken("?access_token=secret-1", storage)).toBe("secret-1");
    expect(store.get(LAN_AUTH_STORAGE_KEY)).toBe("secret-1");
    expect(readLanAuthToken("", storage)).toBe("secret-1");
  });

  it("returns empty when nothing is stored", () => {
    const storage = { getItem: () => null, setItem: () => {} };
    expect(readLanAuthToken("", storage)).toBe("");
  });
});

describe("lanAuthHeaders", () => {
  it("returns no headers when there is no token", () => {
    const { storage } = memoryStorage();
    expect(lanAuthHeaders(storage)).toEqual({});
  });

  it("returns Authorization Bearer when a token is stored", () => {
    const { storage } = memoryStorage({ [LAN_AUTH_STORAGE_KEY]: "secret+1/x" });
    expect(lanAuthHeaders(storage)).toEqual({ Authorization: "Bearer secret+1/x" });
  });
});

describe("screenshot / API Bearer contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("screenshot POST carries Bearer when a LAN token is stored", async () => {
    const { storage } = memoryStorage({ [LAN_AUTH_STORAGE_KEY]: "lan-secret" });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ image: "frame" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const init = lanAuthRequestInit({ method: "POST" }, storage);
    await fetch("/api/local-computer/screenshot", init);

    expect(init.method).toBe("POST");
    expect(headerValue(init.headers, "content-type")).toBe("application/json");
    expect(headerValue(init.headers, "Authorization")).toBe("Bearer lan-secret");
    expect(calls).toEqual([
      { url: "/api/local-computer/screenshot", init },
    ]);
  });

  it("screenshot POST sends no Authorization when auth is off", () => {
    const { storage } = memoryStorage();
    const init = lanAuthRequestInit({ method: "POST" }, storage);
    expect(headerValue(init.headers, "content-type")).toBe("application/json");
    expect(headerValue(init.headers, "Authorization")).toBeNull();
  });

  it("caller headers cannot drop the Bearer token", () => {
    const { storage } = memoryStorage({ [LAN_AUTH_STORAGE_KEY]: "keep-me" });
    const init = lanAuthRequestInit({ headers: { "x-debug": "1" } }, storage);
    expect(headerValue(init.headers, "Authorization")).toBe("Bearer keep-me");
    expect(headerValue(init.headers, "x-debug")).toBe("1");
  });

  it("ComputerPanel screenshot polls go through lanAuthRequestInit, not raw fetch", () => {
    const src = readFileSync(join(srcRoot, "components/ComputerPanel.tsx"), "utf8");
    expect(src).toContain("lanAuthRequestInit");
    expect(src).toContain("`/api/bots/${bot.id}/computer/screenshot`");
    expect(src).toContain('api("/api/local-computer/screenshot"');
    expect(src).not.toMatch(/fetch\(\s*["'`]\/api\/local-computer\/screenshot/);
    expect(src).not.toMatch(/fetch\(\s*`\/api\/bots\/\$\{bot\.id\}\/computer\/screenshot/);
  });

  it("store api() attaches the same LAN Bearer helper", () => {
    const src = readFileSync(join(srcRoot, "state/store.tsx"), "utf8");
    expect(src).toContain("lanAuthRequestInit");
    expect(src).toMatch(/export async function api\(/);
  });

  it("LocalComputerSection leftover fetches use the same helper", () => {
    const src = readFileSync(join(srcRoot, "components/LocalComputerSection.tsx"), "utf8");
    expect(src).toContain("lanAuthRequestInit");
    expect(src).toContain('fetch("/api/local-computer", lanAuthRequestInit');
    expect(src).toContain('lanAuthRequestInit({ method: "POST"');
  });
});
