import { describe, expect, it } from "vitest";

import { eventsUrl, readLanAuthToken } from "./lan-auth";

describe("readLanAuthToken", () => {
  it("bootstraps from ?access_token= and persists it", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    expect(readLanAuthToken("?access_token=secret-1", storage)).toBe("secret-1");
    expect(store.get("ombAuthToken")).toBe("secret-1");
    expect(readLanAuthToken("", storage)).toBe("secret-1");
  });

  it("returns empty when nothing is stored", () => {
    const storage = { getItem: () => null, setItem: () => {} };
    expect(readLanAuthToken("", storage)).toBe("");
  });
});

describe("consumeLanAuthTokenFromLocation", () => {
  it("strips access_token from the query after persisting it", async () => {
    const { consumeLanAuthTokenFromLocation } = await import("./lan-auth");
    const replaced: string[] = [];
    consumeLanAuthTokenFromLocation(
      { search: "?access_token=abc&x=1", pathname: "/", hash: "#room" },
      { replaceState: (_s, _t, url) => replaced.push(String(url)) },
    );
    expect(replaced).toEqual(["/?x=1#room"]);
  });
});

describe("saveLanAuthToken and clearLanAuthToken", () => {
  it("saves a token and clears it from storage", async () => {
    const { saveLanAuthToken, clearLanAuthToken } = await import("./lan-auth");
    const store = new Map<string, string>();
    const storage = {
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    saveLanAuthToken("my-token-123", storage);
    expect(store.get("ombAuthToken")).toBe("my-token-123");

    clearLanAuthToken(storage);
    expect(store.has("ombAuthToken")).toBe(false);
  });
});

describe("eventsUrl", () => {
  it("leaves the path alone when there is no token", () => {
    const storage = { getItem: () => null, setItem: () => {} };
    expect(readLanAuthToken("", storage)).toBe("");
    expect(eventsUrl("/api/events").startsWith("/api/events")).toBe(true);
  });
});
