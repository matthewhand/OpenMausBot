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
  return isIP(hostname) === 4 && hostname.startsWith("127.");
}

/** Off-machine bind is allowed only when a non-empty token is present. */
export function lanBindAllowed(host: string, token: string | null | undefined): boolean {
  if (isLoopbackBindHost(host)) return true;
  return Boolean(token?.trim());
}
