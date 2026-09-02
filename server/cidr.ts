/**
 * CIDR and IPv4 subnet matching utility for LAN authentication bypass.
 *
 * Supports parsing IPv4 addresses, single IP targets, CIDR notations (e.g. 10.0.0.0/24),
 * and standard RFC1918 private network presets.
 */

export interface Ipv4Cidr {
  raw: string;
  network: number;
  mask: number;
}

export const RFC1918_PRIVATE_CIDRS = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "127.0.0.0/8",
];

/** Convert IPv4 string (e.g. "192.168.1.1") to 32-bit unsigned integer. */
export function parseIpv4(ip: string): number | null {
  const trimmed = ip.trim();
  const parts = trimmed.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (let i = 0; i < 4; i++) {
    const p = parts[i];
    if (!/^\d{1,3}$/.test(p)) return null;
    const part = Number(p);
    if (!Number.isInteger(part) || part < 0 || part > 255) return null;
    num = ((num << 8) | part) >>> 0;
  }
  return num;
}

/** Parse CIDR notation (e.g. "10.0.0.0/24") or single IP ("10.0.0.5") into Ipv4Cidr. */
export function parseCidr(cidrStr: string): Ipv4Cidr | null {
  const trimmed = cidrStr.trim();
  if (!trimmed) return null;

  const slashIdx = trimmed.indexOf("/");
  if (slashIdx === -1) {
    const ipNum = parseIpv4(trimmed);
    if (ipNum === null) return null;
    return {
      raw: trimmed,
      network: ipNum,
      mask: 0xffffffff >>> 0,
    };
  }

  const ipStr = trimmed.slice(0, slashIdx);
  const prefixStr = trimmed.slice(slashIdx + 1);
  const ipNum = parseIpv4(ipStr);
  if (ipNum === null) return null;
  if (!/^\d{1,2}$/.test(prefixStr.trim())) return null;
  const prefix = Number(prefixStr.trim());
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (ipNum & mask) >>> 0;
  return {
    raw: trimmed,
    network,
    mask,
  };
}

/** Check whether a given IPv4 string falls within a CIDR subnet. */
export function isIpInCidr(ip: string, cidr: Ipv4Cidr): boolean {
  const ipNum = parseIpv4(ip);
  if (ipNum === null) return false;
  return ((ipNum & cidr.mask) >>> 0) === cidr.network;
}

/** Check whether a given IPv4 string matches any CIDR in the list. */
export function isIpInCidrs(ip: string, cidrs: readonly Ipv4Cidr[]): boolean {
  const ipNum = parseIpv4(ip);
  if (ipNum === null) return false;
  for (const cidr of cidrs) {
    if (((ipNum & cidr.mask) >>> 0) === cidr.network) return true;
  }
  return false;
}

/**
 * Normalizes client remoteAddress from Node HTTP sockets.
 * Converts IPv4-mapped IPv6 (::ffff:10.0.0.1) and IPv6 loopback (::1).
 */
export function normalizeClientIp(raw: string | undefined | null): string {
  if (!raw) return "";
  let trimmed = raw.trim();
  const zoneIdx = trimmed.indexOf("%");
  if (zoneIdx >= 0) trimmed = trimmed.slice(0, zoneIdx);
  const ipv4Mapped = trimmed.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (ipv4Mapped) return ipv4Mapped[1];
  if (trimmed === "::1" || trimmed === "0:0:0:0:0:0:0:1") return "127.0.0.1";
  return trimmed;
}

/**
 * Parse an environment variable value for bypass subnets/CIDRs.
 * Supports:
 * - "true", "1", "auto": all RFC1918 private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
 * - Comma/space separated CIDRs or IPs (e.g. "10.0.0.0/24, 192.168.1.0/24")
 */
export function parseBypassConfig(val: string | undefined | null): Ipv4Cidr[] {
  if (!val) return [];
  const trimmed = val.trim();
  if (!trimmed) return [];

  if (trimmed.toLowerCase() === "true" || trimmed === "1" || trimmed.toLowerCase() === "auto") {
    return RFC1918_PRIVATE_CIDRS.map((c) => parseCidr(c)!).filter(Boolean);
  }

  const entries = trimmed.split(/[\s,]+/);
  const result: Ipv4Cidr[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    const cidr = parseCidr(entry);
    if (cidr) {
      result.push(cidr);
    }
  }
  return result;
}
