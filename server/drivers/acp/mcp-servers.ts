// ACP custom MCP attach: map user HTTP/SSE servers onto the session/new
// wire shape, then drop transports the agent did not advertise.
//
// stdio is the baseline every ACP agent supports. mcpCapabilities.http/.sse
// only add EXTRA transports — an injected stdio proxy (computer, agents)
// always attaches. Reserved names are omitted so a user server cannot
// overwrite a built-in mount.
import { RESERVED_MCP_NAMES } from "../../config.ts";
import type { SendTurnInput } from "../../contracts.ts";

export type AcpMcpCapabilities = {
  http?: boolean;
  sse?: boolean;
};

export type CustomMcpServerInput = NonNullable<NonNullable<SendTurnInput["integrations"]>["mcpServers"]>[number];

/** ACP {name,value}[] header list. Empty when the server has no headers. */
export function acpMcpHeaders(headers?: Record<string, string>): Array<{ name: string; value: string }> {
  return Object.entries(headers ?? {}).map(([name, value]) => ({ name, value }));
}

/** Map enabled, non-reserved custom HTTP/SSE servers to the ACP wire shape. */
export function mapCustomAcpMcpServers(servers: readonly CustomMcpServerInput[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const server of servers) {
    if (server.enabled === false) continue;
    if (RESERVED_MCP_NAMES.has(server.name)) continue;
    out.push({
      name: server.name,
      type: server.transport,
      url: server.url,
      headers: acpMcpHeaders(server.headers),
    });
  }
  return out;
}

/** stdio (`command` string) always attaches; http/sse only when advertised. */
export function allowAcpMcpServer(server: Record<string, unknown>, mcpCaps: AcpMcpCapabilities): boolean {
  if (typeof server.command === "string") return true;
  if (server.type === "http") return mcpCaps.http === true;
  if (server.type === "sse") return mcpCaps.sse === true;
  return false;
}

export function filterAcpMcpServers(
  servers: Array<Record<string, unknown>>,
  mcpCaps: AcpMcpCapabilities,
): Array<Record<string, unknown>> {
  return servers.filter((server) => allowAcpMcpServer(server, mcpCaps));
}
