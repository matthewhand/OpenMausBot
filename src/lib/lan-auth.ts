/** Optional LAN bearer token for harness API calls. Screenshot polling and
 *  the shared `api()` client must send the same Authorization header — a
 *  raw `fetch()` here 401s over LAN once a token is required.
 *  EventSource cannot send headers; that bootstrap stays out of this file. */

export const LAN_AUTH_STORAGE_KEY = "ombAuthToken";

type TokenStorage = Pick<Storage, "getItem" | "setItem">;

function defaultTokenStorage(): TokenStorage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function currentSearch(): string {
  try {
    return window.location.search;
  } catch {
    return "";
  }
}

function resolveTokenStorage(storage?: TokenStorage | null): TokenStorage | null {
  return storage === undefined ? defaultTokenStorage() : storage;
}

export function readLanAuthToken(
  search = currentSearch(),
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

export function lanAuthHeaders(storage?: TokenStorage | null) {
  const token = readLanAuthToken(currentSearch(), resolveTokenStorage(storage));
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/** JSON API init used by store `api()` and ComputerPanel screenshot polls. */
export function lanAuthRequestInit(init?: RequestInit, storage?: TokenStorage | null): RequestInit {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  const token = readLanAuthToken(currentSearch(), resolveTokenStorage(storage));
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return { ...init, headers };
}
