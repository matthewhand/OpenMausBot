/** Optional LAN bearer token for harness API calls. Screenshot polling and
 *  the shared `api()` client must send the same Authorization header — a
 *  raw `fetch()` here 401s over LAN once a token is required.
 *  EventSource cannot send headers; that bootstrap stays out of this file. */

export const LAN_AUTH_STORAGE_KEY = "ombAuthToken";

type TokenStorage = Pick<Storage, "getItem" | "setItem">;

function defaultTokenStorage(): TokenStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function resolveTokenStorage(storage?: TokenStorage | null): TokenStorage | null {
  return storage === undefined ? defaultTokenStorage() : storage;
}

export function readLanAuthToken(
  search = typeof window === "undefined" ? "" : window.location.search,
  storage: TokenStorage | null = defaultTokenStorage(),
): string {
  try {
    const fromQuery = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("access_token");
    if (fromQuery) {
      storage?.setItem(LAN_AUTH_STORAGE_KEY, fromQuery);
      return fromQuery;
    }
    return storage?.getItem(LAN_AUTH_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function lanAuthHeaders(storage?: TokenStorage | null): Record<string, string> {
  const token = readLanAuthToken(typeof window === "undefined" ? "" : window.location.search, resolveTokenStorage(storage));
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function headerRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...(headers as Record<string, string>) };
}

/** JSON API init used by store `api()` and ComputerPanel screenshot polls. */
export function lanAuthRequestInit(init?: RequestInit, storage?: TokenStorage | null): RequestInit {
  return {
    ...init,
    headers: {
      "content-type": "application/json",
      ...lanAuthHeaders(storage),
      ...headerRecord(init?.headers),
    },
  };
}
