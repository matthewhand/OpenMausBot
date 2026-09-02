import { describe, expect, it } from "vitest";

function validateMcpServer(name: string, url: string): { ok: boolean; error?: string } {
  const trimmedName = name.trim();
  const trimmedUrl = url.trim();

  if (!trimmedName || !trimmedUrl) {
    return { ok: false, error: "Name and URL are required" };
  }
  if (!/^[\w-]+$/.test(trimmedName)) {
    return { ok: false, error: "Name must contain only letters, numbers, dash, and underscore" };
  }
  if (!/^https?:\/\//i.test(trimmedUrl)) {
    return { ok: false, error: "URL must start with http:// or https://" };
  }
  return { ok: true };
}

describe("Custom MCP input validation", () => {
  it("accepts valid names and HTTP/HTTPS URLs", () => {
    expect(validateMcpServer("github-mcp", "https://api.github.com/mcp")).toEqual({ ok: true });
    expect(validateMcpServer("local_server_1", "http://127.0.0.1:8080/sse")).toEqual({ ok: true });
  });

  it("rejects empty names or URLs", () => {
    expect(validateMcpServer("", "https://api.example.com/mcp")).toEqual({
      ok: false,
      error: "Name and URL are required",
    });
    expect(validateMcpServer("myserver", "   ")).toEqual({
      ok: false,
      error: "Name and URL are required",
    });
  });

  it("rejects names with spaces or special characters", () => {
    expect(validateMcpServer("my server", "https://api.example.com/mcp")).toEqual({
      ok: false,
      error: "Name must contain only letters, numbers, dash, and underscore",
    });
    expect(validateMcpServer("server@foo", "https://api.example.com/mcp")).toEqual({
      ok: false,
      error: "Name must contain only letters, numbers, dash, and underscore",
    });
  });

  it("rejects URLs without http:// or https:// protocol", () => {
    expect(validateMcpServer("myserver", "localhost:8080")).toEqual({
      ok: false,
      error: "URL must start with http:// or https://",
    });
    expect(validateMcpServer("myserver", "ftp://example.com")).toEqual({
      ok: false,
      error: "URL must start with http:// or https://",
    });
  });
});

describe("Custom MCP payload construction", () => {
  function buildServerPayload(
    name: string,
    transport: "http" | "sse",
    url: string,
    enabled: boolean,
    headersList: Array<{ key: string; value: string }>,
    clearingHeaders: boolean,
  ) {
    const headers: Record<string, string> = {};
    for (const h of headersList) {
      if (h.key.trim() && h.value.trim()) headers[h.key.trim()] = h.value.trim();
    }
    const hasNewHeaders = Object.keys(headers).length > 0;
    return {
      name: name.trim(),
      transport,
      url: url.trim(),
      enabled,
      ...(hasNewHeaders ? { headers } : clearingHeaders ? { headers: {} } : {}),
    };
  }

  it("omits headers key when no new headers and not clearing (preserves existing)", () => {
    const payload = buildServerPayload("notion", "http", "https://api.notion.com/mcp", true, [], false);
    expect(payload).toEqual({
      name: "notion",
      transport: "http",
      url: "https://api.notion.com/mcp",
      enabled: true,
    });
    expect("headers" in payload).toBe(false);
  });

  it("includes empty headers object when clearingHeaders is true", () => {
    const payload = buildServerPayload("notion", "http", "https://api.notion.com/mcp", true, [], true);
    expect(payload).toEqual({
      name: "notion",
      transport: "http",
      url: "https://api.notion.com/mcp",
      enabled: true,
      headers: {},
    });
  });

  it("includes new headers when provided", () => {
    const payload = buildServerPayload(
      "notion",
      "http",
      "https://api.notion.com/mcp",
      true,
      [{ key: "Authorization", value: "Bearer sk-test" }],
      false,
    );
    expect(payload).toEqual({
      name: "notion",
      transport: "http",
      url: "https://api.notion.com/mcp",
      enabled: true,
      headers: { Authorization: "Bearer sk-test" },
    });
  });
});
