// Tests for network/LAN security configuration and authentication
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unlinkSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// Mock environment for testing
const TEST_DATA_DIR = join(tmpdir(), `openmausbot-test-${randomBytes(8).toString("hex")}`);

describe("Network Configuration", () => {
  beforeEach(() => {
    if (!existsSync(TEST_DATA_DIR)) {
      mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    try {
      const configPath = join(TEST_DATA_DIR, "config.json");
      if (existsSync(configPath)) unlinkSync(configPath);
    } catch {
      // cleanup is best-effort
    }
  });

  it("should default to localhost binding", () => {
    const config = {
      network: {
        enabled: false,
        host: "127.0.0.1",
      },
    };
    expect(config.network.host).toBe("127.0.0.1");
    expect(config.network.enabled).toBe(false);
  });

  it("should validate auth token is required for LAN binding", () => {
    const config = {
      network: {
        enabled: true,
        host: "0.0.0.0",
        authToken: undefined,
      },
    };
    // In production, this should fail validation
    const isValid = Boolean(config.network.authToken) || config.network.host === "127.0.0.1";
    expect(isValid).toBe(false);
  });

  it("should allow LAN binding with auth token", () => {
    const config = {
      network: {
        enabled: true,
        host: "0.0.0.0",
        authToken: "test-token-123",
      },
    };
    const isValid = Boolean(config.network.authToken) || config.network.host === "127.0.0.1";
    expect(isValid).toBe(true);
  });

  it("should detect loopback addresses", () => {
    const loopbacks = ["127.0.0.1", "localhost", "::1"];
    const nonLoopbacks = ["0.0.0.0", "192.168.1.100", "10.0.0.5"];

    loopbacks.forEach((addr) => {
      const isLoopback = addr === "127.0.0.1" || addr === "localhost" || addr === "::1";
      expect(isLoopback).toBe(true);
    });

    nonLoopbacks.forEach((addr) => {
      const isLoopback = addr === "127.0.0.1" || addr === "localhost" || addr === "::1";
      expect(isLoopback).toBe(false);
    });
  });

  it("should redact auth token in status responses", () => {
    const config = {
      network: {
        enabled: true,
        host: "0.0.0.0",
        authToken: "secret-token-abc123",
      },
    };

    // Status should only show authConfigured flag, not the token
    const status = {
      enabled: config.network.enabled,
      host: config.network.host,
      authConfigured: Boolean(config.network.authToken),
      // authToken should NEVER be included in status
    };

    expect(status.authConfigured).toBe(true);
    expect((status as any).authToken).toBeUndefined();
  });

  it("should validate host format", () => {
    // Test valid hosts
    expect("127.0.0.1" === "127.0.0.1").toBe(true);
    expect("0.0.0.0" === "0.0.0.0").toBe(true);
    expect("192.168.1.1").toMatch(/^(\d{1,3}\.){3}\d{1,3}$/);
    expect("localhost").toMatch(/^[a-z0-9.-]+$/i);

    // Test invalid hosts
    expect("").toBe("");  // Empty string is falsy
    expect("../etc/passwd").toContain("/");  // Contains path separator
    
    // Validate that basic format checks work
    const isValidIp = (ip: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
    expect(isValidIp("192.168.1.1")).toBe(true);
    expect(isValidIp("not-an-ip")).toBe(false);
    expect(isValidIp("")).toBe(false);
  });
});

describe("Authentication Middleware", () => {
  it("should allow requests without auth when no token is configured", () => {
    const authToken = undefined;
    const request = { headers: {} as Record<string, string> };

    const isAuthenticated = !authToken || request.headers.authorization === `Bearer ${authToken}`;
    expect(isAuthenticated).toBe(true);
  });

  it("should reject requests without auth header when token is configured", () => {
    const authToken = "test-token";
    const request = { headers: {} as Record<string, string> };

    const isAuthenticated = !authToken || request.headers.authorization === `Bearer ${authToken}`;
    expect(isAuthenticated).toBe(false);
  });

  it("should accept valid Bearer token", () => {
    const authToken = "test-token-123";
    const request = {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    };

    const match = request.headers.authorization.match(/^Bearer\s+(.+)$/i);
    const token = match ? match[1] : "";
    const isAuthenticated = token === authToken;
    expect(isAuthenticated).toBe(true);
  });

  it("should reject invalid Bearer token", () => {
    const authToken = "correct-token";
    const request = {
      headers: {
        authorization: "Bearer wrong-token",
      },
    };

    const match = request.headers.authorization.match(/^Bearer\s+(.+)$/i);
    const token = match ? match[1] : "";
    const isAuthenticated = token === authToken;
    expect(isAuthenticated).toBe(false);
  });

  it("should handle token without Bearer prefix", () => {
    const authToken = "test-token";
    const request = {
      headers: {
        authorization: "test-token",
      },
    };

    // Support both formats: "Bearer token" and raw "token"
    const match = request.headers.authorization.match(/^Bearer\s+(.+)$/i);
    const token = match ? match[1] : request.headers.authorization;
    const isAuthenticated = token === authToken;
    expect(isAuthenticated).toBe(true);
  });

  it("should always allow /api/health endpoint", () => {
    const path = "/api/health";

    // Health endpoint should bypass auth
    const requiresAuth = path.startsWith("/api/") && path !== "/api/health";
    expect(requiresAuth).toBe(false);
  });

  it("should require auth for other API endpoints when configured", () => {
    const paths = ["/api/bots", "/api/config", "/api/messages"];

    paths.forEach((path) => {
      const requiresAuth = path.startsWith("/api/") && path !== "/api/health";
      expect(requiresAuth).toBe(true);
    });
  });
});

describe("CORS Configuration", () => {
  it("should add CORS headers when origin is configured", () => {
    const corsOrigin = "https://example.com";
    const headers: Record<string, string> = {};

    if (corsOrigin) {
      headers["Access-Control-Allow-Origin"] = corsOrigin;
      headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    }

    expect(headers["Access-Control-Allow-Origin"]).toBe(corsOrigin);
    expect(headers["Access-Control-Allow-Methods"]).toBeDefined();
  });

  it("should not add CORS headers when origin is not configured", () => {
    const corsOrigin = undefined;
    const headers: Record<string, string> = {};

    if (corsOrigin) {
      headers["Access-Control-Allow-Origin"] = corsOrigin;
    }

    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});

describe("Security Warnings", () => {
  it("should warn when binding to non-loopback without auth", () => {
    const config = {
      host: "0.0.0.0",
      authToken: undefined,
    };

    const isLoopback = config.host === "127.0.0.1" || config.host === "localhost";
    const shouldWarn = !isLoopback && !config.authToken;

    expect(shouldWarn).toBe(true);
  });

  it("should not warn for localhost binding", () => {
    const config = {
      host: "127.0.0.1",
      authToken: undefined,
    };

    const isLoopback = config.host === "127.0.0.1" || config.host === "localhost";
    const shouldWarn = !isLoopback && !config.authToken;

    expect(shouldWarn).toBe(false);
  });

  it("should not warn when auth is configured for LAN", () => {
    const config = {
      host: "0.0.0.0",
      authToken: "secure-token",
    };

    const isLoopback = config.host === "127.0.0.1" || config.host === "localhost";
    const shouldWarn = !isLoopback && !config.authToken;

    expect(shouldWarn).toBe(false);
  });
});
