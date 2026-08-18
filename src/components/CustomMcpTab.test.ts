import { describe, expect, it } from "vitest";

import { customMcpSavePayload } from "./CustomMcpTab";

const editing = {
  name: "notion",
  transport: "http" as const,
  url: "https://mcp.notion.example/mcp",
  enabled: true,
  headers: [] as Array<{ key: string; value: string }>,
};

describe("customMcpSavePayload", () => {
  it("omits headers when the editor has no complete pair — merge keeps secrets", () => {
    expect(customMcpSavePayload(editing)).toEqual({
      name: "notion",
      transport: "http",
      url: "https://mcp.notion.example/mcp",
      enabled: true,
    });
    expect(
      customMcpSavePayload({
        ...editing,
        headers: [{ key: "", value: "" }, { key: "Authorization", value: "  " }],
      }),
    ).not.toHaveProperty("headers");
  });

  it("sends headers only when the operator typed at least one replacement pair", () => {
    expect(
      customMcpSavePayload({
        ...editing,
        headers: [
          { key: "", value: "" },
          { key: " Authorization ", value: " Bearer secret " },
        ],
      }),
    ).toEqual({
      name: "notion",
      transport: "http",
      url: "https://mcp.notion.example/mcp",
      enabled: true,
      headers: { Authorization: "Bearer secret" },
    });
  });
});
