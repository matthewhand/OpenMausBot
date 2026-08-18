/** LAN bearer token for the harness. EventSource cannot send headers, so
 *  GET /api/events also accepts ?access_token=. A first visit can bootstrap
 *  via that query (or ?access_token= on any page) into localStorage.
 *  Other /api/* routes require Authorization: Bearer — do not put the token
 *  on mutating URLs. */

const STORAGE_KEY = "ombAuthToken";

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
      storage?.setItem(STORAGE_KEY, fromQuery);
      return fromQuery;
    }
    return storage?.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function lanAuthHeaders(storage?: TokenStorage | null): Record<string, string> {
  const token = readLanAuthToken(typeof window === "undefined" ? "" : window.location.search, resolveTokenStorage(storage));
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function eventsUrl(path = "/api/events", storage?: TokenStorage | null): string {
  const token = readLanAuthToken(typeof window === "undefined" ? "" : window.location.search, resolveTokenStorage(storage));
  if (!token) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}access_token=${encodeURIComponent(token)}`;
}

/** Persist ?access_token= then drop it from the address bar so it is not
 *  copied, bookmarked, or sent as a Referer. */
export function consumeLanAuthTokenFromLocation(
  loc: Pick<Location, "search" | "pathname" | "hash"> | null = typeof window === "undefined" ? null : window.location,
  hist: Pick<History, "replaceState"> | null = typeof history === "undefined" ? null : history,
): void {
  if (!loc || !hist) return;
  const params = new URLSearchParams(loc.search.startsWith("?") ? loc.search.slice(1) : loc.search);
  if (!params.has("access_token")) return;
  readLanAuthToken(loc.search);
  params.delete("access_token");
  const next = params.toString();
  hist.replaceState(null, "", `${loc.pathname}${next ? `?${next}` : ""}${loc.hash}`);
}
