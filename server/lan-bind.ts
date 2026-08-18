// Bind-address gate: loopback may stay unauthenticated; anything off-machine
// needs OMB_AUTH_TOKEN or the process must refuse to listen.
import { isIP } from "node:net";

/** Hosts that may bind without a token: 127.*, localhost, ::1. */
export function isLoopbackBindHost(host: string): boolean {
  const value = host.trim().toLowerCase();
  if (!value) return false;

  let hostname = value;
  if (value.startsWith("[") && value.endsWith("]")) {
    hostname = value.slice(1, -1);
  }

  if (hostname === "localhost" || hostname === "localhost.") return true;
  if (hostname === "::1" || hostname === "0:0:0:0:0:0:0:1") return true;
  const mapped = ipv4MappedAddress(hostname);
  if (mapped) return isLoopbackBindHost(mapped);
  return isIP(hostname) === 4 && hostname.startsWith("127.");
}

/** WHATWG / Node may print IPv4-mapped loopback as ::ffff:127.0.0.1 or ::ffff:7f00:1. */
function ipv4MappedAddress(host: string): string | null {
  const dotted = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return null;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

/** Off-machine bind is allowed only when a non-empty token is present. */
export function lanBindAllowed(host: string, token: string | null | undefined): boolean {
  if (isLoopbackBindHost(host)) return true;
  return Boolean(token?.trim());
}
