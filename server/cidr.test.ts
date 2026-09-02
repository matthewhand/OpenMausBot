import { describe, expect, it } from "vitest";
import {
  isIpInCidr,
  isIpInCidrs,
  normalizeClientIp,
  parseBypassConfig,
  parseCidr,
  parseIpv4,
  RFC1918_PRIVATE_CIDRS,
} from "./cidr.js";

describe("parseIpv4", () => {
  it("parses valid IPv4 addresses", () => {
    expect(parseIpv4("0.0.0.0")).toBe(0);
    expect(parseIpv4("10.0.0.1")).toBe((10 << 24) | 1);
    expect(parseIpv4("255.255.255.255")).toBe(0xffffffff >>> 0);
    expect(parseIpv4("192.168.1.1")).toBe(((192 << 24) | (168 << 16) | (1 << 8) | 1) >>> 0);
  });

  it("returns null for invalid IPv4 addresses", () => {
    expect(parseIpv4("")).toBeNull();
    expect(parseIpv4("10.0.0")).toBeNull();
    expect(parseIpv4("10.0.0.1.1")).toBeNull();
    expect(parseIpv4("256.0.0.1")).toBeNull();
    expect(parseIpv4("-1.0.0.1")).toBeNull();
    expect(parseIpv4("10.0.0.abc")).toBeNull();
    expect(parseIpv4("localhost")).toBeNull();
  });
});

describe("parseCidr and isIpInCidr", () => {
  it("matches 10.0.0.0/24 subnet", () => {
    const cidr = parseCidr("10.0.0.0/24")!;
    expect(cidr).toBeDefined();
    expect(isIpInCidr("10.0.0.0", cidr)).toBe(true);
    expect(isIpInCidr("10.0.0.1", cidr)).toBe(true);
    expect(isIpInCidr("10.0.0.254", cidr)).toBe(true);
    expect(isIpInCidr("10.0.0.255", cidr)).toBe(true);
    expect(isIpInCidr("10.0.1.1", cidr)).toBe(false);
    expect(isIpInCidr("192.168.1.1", cidr)).toBe(false);
  });

  it("matches 10.0.0.0/8 subnet", () => {
    const cidr = parseCidr("10.0.0.0/8")!;
    expect(cidr).toBeDefined();
    expect(isIpInCidr("10.0.0.1", cidr)).toBe(true);
    expect(isIpInCidr("10.254.12.34", cidr)).toBe(true);
    expect(isIpInCidr("11.0.0.1", cidr)).toBe(false);
  });

  it("matches single IP without slash as /32", () => {
    const cidr = parseCidr("10.0.0.5")!;
    expect(cidr).toBeDefined();
    expect(cidr.mask).toBe(0xffffffff >>> 0);
    expect(isIpInCidr("10.0.0.5", cidr)).toBe(true);
    expect(isIpInCidr("10.0.0.6", cidr)).toBe(false);
  });

  it("handles 0.0.0.0/0 (all IPv4)", () => {
    const cidr = parseCidr("0.0.0.0/0")!;
    expect(cidr).toBeDefined();
    expect(isIpInCidr("1.2.3.4", cidr)).toBe(true);
    expect(isIpInCidr("10.0.0.1", cidr)).toBe(true);
    expect(isIpInCidr("192.168.1.1", cidr)).toBe(true);
  });

  it("rejects invalid CIDR strings", () => {
    expect(parseCidr("")).toBeNull();
    expect(parseCidr("10.0.0.0/33")).toBeNull();
    expect(parseCidr("10.0.0.0/-1")).toBeNull();
    expect(parseCidr("10.0.0.0/abc")).toBeNull();
    expect(parseCidr("not-an-ip/24")).toBeNull();
  });
});

describe("normalizeClientIp", () => {
  it("normalizes IPv4-mapped IPv6 addresses", () => {
    expect(normalizeClientIp("::ffff:10.0.0.5")).toBe("10.0.0.5");
    expect(normalizeClientIp("::ffff:192.168.1.1")).toBe("192.168.1.1");
  });

  it("normalizes IPv6 loopback to 127.0.0.1", () => {
    expect(normalizeClientIp("::1")).toBe("127.0.0.1");
  });

  it("preserves standard IPv4 addresses", () => {
    expect(normalizeClientIp("10.0.0.5")).toBe("10.0.0.5");
    expect(normalizeClientIp("127.0.0.1")).toBe("127.0.0.1");
  });

  it("handles null or undefined", () => {
    expect(normalizeClientIp(null)).toBe("");
    expect(normalizeClientIp(undefined)).toBe("");
  });
});

describe("parseBypassConfig and isIpInCidrs", () => {
  it("parses true / 1 / auto into RFC1918 private CIDRs", () => {
    const cidrsTrue = parseBypassConfig("true");
    expect(cidrsTrue.length).toBe(RFC1918_PRIVATE_CIDRS.length);
    expect(isIpInCidrs("10.0.0.1", cidrsTrue)).toBe(true);
    expect(isIpInCidrs("172.16.5.10", cidrsTrue)).toBe(true);
    expect(isIpInCidrs("192.168.1.100", cidrsTrue)).toBe(true);
    expect(isIpInCidrs("127.0.0.1", cidrsTrue)).toBe(true);
    expect(isIpInCidrs("8.8.8.8", cidrsTrue)).toBe(false);

    const cidrs1 = parseBypassConfig("1");
    expect(cidrs1.length).toBe(RFC1918_PRIVATE_CIDRS.length);
  });

  it("parses comma-separated custom CIDRs", () => {
    const cidrs = parseBypassConfig("10.0.0.0/24, 192.168.10.0/24");
    expect(cidrs.length).toBe(2);

    expect(isIpInCidrs("10.0.0.55", cidrs)).toBe(true);
    expect(isIpInCidrs("192.168.10.1", cidrs)).toBe(true);
    expect(isIpInCidrs("10.0.1.55", cidrs)).toBe(false);
    expect(isIpInCidrs("192.168.1.1", cidrs)).toBe(false);
  });

  it("handles empty or invalid configs gracefully", () => {
    expect(parseBypassConfig("")).toEqual([]);
    expect(parseBypassConfig(null)).toEqual([]);
    expect(parseBypassConfig(undefined)).toEqual([]);
    expect(parseBypassConfig("invalid-cidr, also-invalid")).toEqual([]);
  });
});
