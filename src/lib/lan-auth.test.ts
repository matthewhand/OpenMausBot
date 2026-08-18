import { describe, expect, it } from "vitest";

import { eventsUrl, lanAuthHeaders, readLanAuthToken } from "./lan-auth";

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

describe("readLanAuthToken", () => {
  it("bootstraps from ?access_token= and persists it", () => {
    const { store, storage } = memoryStorage();
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

describe("eventsUrl", () => {
  it("leaves the path alone when there is no token", () => {
    const { storage } = memoryStorage();
    expect(eventsUrl("/api/events", storage)).toBe("/api/events");
  });

  it("appends an encoded access_token query when a token is stored", () => {
    const { storage } = memoryStorage({ ombAuthToken: "secret+1/x" });
    expect(eventsUrl("/api/events", storage)).toBe("/api/events?access_token=secret%2B1%2Fx");
  });

  it("joins with & when the path already has a query", () => {
    const { storage } = memoryStorage({ ombAuthToken: "tok" });
    expect(eventsUrl("/api/events?screens=off", storage)).toBe("/api/events?screens=off&access_token=tok");
  });
});

describe("lanAuthHeaders", () => {
  it("returns no headers when there is no token", () => {
    const { storage } = memoryStorage();
    expect(lanAuthHeaders(storage)).toEqual({});
  });

  it("returns Authorization Bearer when a token is stored", () => {
    const { storage } = memoryStorage({ ombAuthToken: "secret+1/x" });
    expect(lanAuthHeaders(storage)).toEqual({ Authorization: "Bearer secret+1/x" });
  });
});
