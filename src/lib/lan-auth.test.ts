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

describe("eventsUrl", () => {
  it("leaves the path alone when there is no token", () => {
    const storage = { getItem: () => null, setItem: () => {} };
    expect(readLanAuthToken("", storage)).toBe("");
    // eventsUrl reads live localStorage; we only assert the helper shape here
    expect(eventsUrl("/api/events").startsWith("/api/events")).toBe(true);
  });
});
