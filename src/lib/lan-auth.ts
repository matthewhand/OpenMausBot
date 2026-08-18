/** LAN bearer token for the harness. EventSource cannot send headers, so
 *  GET /api/events also accepts ?access_token=. A first visit can bootstrap
 *  via that query (or ?access_token= on any page) into localStorage. */

const STORAGE_KEY = "ombAuthToken";

export function readLanAuthToken(
  search = typeof window === "undefined" ? "" : window.location.search,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
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

export function lanAuthHeaders(): Record<string, string> {
  const token = readLanAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function eventsUrl(path = "/api/events"): string {
  const token = readLanAuthToken();
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
