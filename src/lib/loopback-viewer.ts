/** noVNC is bound to 127.0.0.1:6080 on purpose. Opening that URL from a
 *  LAN browser hits the *client's* loopback, which has no viewer. */
export function loopbackViewerUsable(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

/** Remote (cloud) URLs are fine from anywhere. A loopback URL is only
 *  navigable when this page itself is on loopback. */
export function canOpenExternalUrl(url: string, pageHostname: string): boolean {
  try {
    const host = new URL(url).hostname;
    if (!loopbackViewerUsable(host)) return true;
    return loopbackViewerUsable(pageHostname);
  } catch {
    return false;
  }
}
