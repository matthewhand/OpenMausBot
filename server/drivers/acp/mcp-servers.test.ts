import { describe, expect, it } from "vitest";

import { RESERVED_MCP_NAMES } from "../../config.ts";
import {
  acpMcpHeaders,
  allowAcpMcpServer,
  filterAcpMcpServers,
  mapCustomAcpMcpServers,
} from "./mcp-servers.ts";

const stdioComputer = { name: "computer", command: "node", args: ["computer-proxy.js"], env: [] };
const stdioAgents = { name: "agents", command: "node", args: ["agents-proxy.js"], env: [] };

const notion = {
  name: "notion",
  transport: "http" as const,
  url: "https://mcp.notion.example/mcp",
  headers: { Authorization: "Bearer secret" },
};
const deepwiki = {
  name: "deepwiki",
  transport: "sse" as const,
  url: "https://mcp.deepwiki.example/sse",
};

describe("mapCustomAcpMcpServers", () => {
  it("maps HTTP/SSE servers to the ACP wire shape and headers to {name,value}[]", () => {
    expect(mapCustomAcpMcpServers([notion, deepwiki])).toEqual([
      {
        name: "notion",
        type: "http",
        url: "https://mcp.notion.example/mcp",
        headers: [{ name: "Authorization", value: "Bearer secret" }],
      },
      {
        name: "deepwiki",
        type: "sse",
        url: "https://mcp.deepwiki.example/sse",
        headers: [],
      },
    ]);
  });

  it("emits an empty headers array when none are set", () => {
    expect(acpMcpHeaders(undefined)).toEqual([]);
    expect(acpMcpHeaders({})).toEqual([]);
    expect(mapCustomAcpMcpServers([{ ...deepwiki, headers: undefined }])[0]?.headers).toEqual([]);
  });

  it("omits enabled: false servers", () => {
    expect(
      mapCustomAcpMcpServers([
        { ...notion, enabled: false },
        { ...deepwiki, enabled: true },
      ]),
    ).toEqual([
      {
        name: "deepwiki",
        type: "sse",
        url: "https://mcp.deepwiki.example/sse",
        headers: [],
      },
    ]);
  });

  it("never emits reserved built-in names", () => {
    const reserved = [...RESERVED_MCP_NAMES].map((name) => ({
      name,
      transport: "http" as const,
      url: `https://evil.example/${name}`,
    }));
    expect(mapCustomAcpMcpServers(reserved)).toEqual([]);
    expect(mapCustomAcpMcpServers([{ ...notion }, ...reserved]).map((s) => s.name)).toEqual(["notion"]);
  });
});

describe("allowAcpMcpServer / filterAcpMcpServers", () => {
  it("keeps stdio computer and agents even when capabilities are empty", () => {
    expect(allowAcpMcpServer(stdioComputer, {})).toBe(true);
    expect(allowAcpMcpServer(stdioAgents, {})).toBe(true);
    expect(filterAcpMcpServers([stdioComputer, stdioAgents], {})).toEqual([stdioComputer, stdioAgents]);
  });

  it("keeps an HTTP custom server only when http is advertised", () => {
    const http = { name: "notion", type: "http", url: notion.url, headers: [] };
    expect(allowAcpMcpServer(http, {})).toBe(false);
    expect(allowAcpMcpServer(http, { http: false, sse: true })).toBe(false);
    expect(allowAcpMcpServer(http, { http: true })).toBe(true);
    expect(filterAcpMcpServers([http], { http: true })).toEqual([http]);
    expect(filterAcpMcpServers([http], {})).toEqual([]);
  });

  it("keeps an SSE custom server only when sse is advertised", () => {
    const sse = { name: "deepwiki", type: "sse", url: deepwiki.url, headers: [] };
    expect(allowAcpMcpServer(sse, {})).toBe(false);
    expect(allowAcpMcpServer(sse, { http: true, sse: false })).toBe(false);
    expect(allowAcpMcpServer(sse, { sse: true })).toBe(true);
    expect(filterAcpMcpServers([sse], { sse: true })).toEqual([sse]);
    expect(filterAcpMcpServers([sse], {})).toEqual([]);
  });

  it("filters a mixed mount list the way session/new will see it", () => {
    const custom = mapCustomAcpMcpServers([
      notion,
      deepwiki,
      { name: "computer", transport: "http", url: "https://evil.example/computer" },
      { name: "off", transport: "http", url: "https://off.example/mcp", enabled: false },
    ]);
    const mounted = [stdioComputer, stdioAgents, ...custom];

    expect(filterAcpMcpServers(mounted, {})).toEqual([stdioComputer, stdioAgents]);
    expect(filterAcpMcpServers(mounted, { http: true }).map((s) => s.name)).toEqual([
      "computer",
      "agents",
      "notion",
    ]);
    expect(filterAcpMcpServers(mounted, { sse: true }).map((s) => s.name)).toEqual([
      "computer",
      "agents",
      "deepwiki",
    ]);
    expect(filterAcpMcpServers(mounted, { http: true, sse: true }).map((s) => s.name)).toEqual([
      "computer",
      "agents",
      "notion",
      "deepwiki",
    ]);
  });
});
