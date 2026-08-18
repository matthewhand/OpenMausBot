/** WHATWG URL turns http://[::ffff:127.0.0.1] into hostname [::ffff:7f00:1]. */
function ipv4MappedAddress(host: string): string | null {
  const dotted = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

/** noVNC is bound to 127.0.0.1:6080 on purpose. Opening that URL from a
 *  LAN browser hits the *client's* loopback, which has no viewer. */
export function loopbackViewerUsable(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const mapped = ipv4MappedAddress(host);
  if (mapped) return loopbackViewerUsable(mapped);
  if (host === "localhost" || host === "localhost.") return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  return host === "127.0.0.1" || host.startsWith("127.");
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
