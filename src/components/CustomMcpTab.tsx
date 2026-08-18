import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { api, type ConfigStatus } from "@/state/store";
import { cn } from "@/lib/cn";

interface McpServer {
  name: string;
  transport: "http" | "sse";
  url: string;
  enabled: boolean;
  hasHeaders: boolean;
}

interface EditingServer extends Omit<McpServer, "hasHeaders"> {
  headers: Array<{ key: string; value: string }>;
}

/** Only include `headers` when the operator typed at least one complete pair.
 * Editing a `hasHeaders` row starts with a blank pair so Save omits `headers`
 * and mergeMcpServers keeps the stored secret. An explicit filled pair replaces. */
export function customMcpSavePayload(editing: EditingServer): {
  name: string;
  transport: "http" | "sse";
  url: string;
  enabled: boolean;
  headers?: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  for (const header of editing.headers) {
    if (header.key.trim() && header.value.trim()) headers[header.key.trim()] = header.value.trim();
  }
  return {
    name: editing.name.trim(),
    transport: editing.transport,
    url: editing.url.trim(),
    enabled: editing.enabled,
    ...(Object.keys(headers).length ? { headers } : {}),
  };
}

export function CustomMcpTab() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [editing, setEditing] = useState<EditingServer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadServers = useCallback(() => {
    api("/api/config")
      .then((cfg: ConfigStatus) => {
        setServers(cfg.mcpServers ?? []);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const openEditor = (server?: McpServer) => {
    setError(null);
    setEditing(
      server
        ? {
            name: server.name,
            transport: server.transport,
            url: server.url,
            enabled: server.enabled,
            headers: server.hasHeaders ? [{ key: "", value: "" }] : [],
          }
        : { name: "", transport: "http", url: "", enabled: true, headers: [] },
    );
  };

  const saveServer = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.url.trim()) {
      setError("Name and URL are required");
      return;
    }
    if (!/^[\w-]+$/.test(editing.name.trim())) {
      setError("Name must contain only letters, numbers, dash, and underscore");
      return;
    }
    // Must match server/config.ts RESERVED_MCP_NAMES. That module imports
    // node:fs, so this tab cannot import it without pulling fs into the UI
    // bundle. Reject here so the operator sees why before a 400 from parse.
    if (["agents", "computer", "composio", "dweb", "ogb"].includes(editing.name.trim())) {
      setError(`"${editing.name.trim()}" is reserved for a built-in mount`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const next = customMcpSavePayload(editing);
      const payload = [
        ...servers.filter((s) => s.name !== next.name).map(({ hasHeaders: _h, ...rest }) => rest),
        next,
      ];
      await api("/api/config", { method: "PUT", body: JSON.stringify({ mcpServers: payload }) });
      loadServers();
      setEditing(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const persist = async (next: McpServer[]) => {
    setSaving(true);
    setError(null);
    try {
      const payload = next.map(({ hasHeaders: _h, ...rest }) => rest);
      await api("/api/config", { method: "PUT", body: JSON.stringify({ mcpServers: payload }) });
      loadServers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-7 pt-2 sm:px-8">
      <p className="mb-3 text-[13px] text-ink-secondary">
        Add your own HTTP or SSE MCP servers. Claude and ACP engines (Grok, Kimi, …) pick them up on
        the next turn. Headers are write-only.
      </p>
      {error && <div className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</div>}

      {!editing && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[12px] font-medium text-ink-secondary">Your servers</div>
            <button
              onClick={() => openEditor()}
              className="flex items-center gap-1.5 rounded-lg bg-raised px-3 py-1.5 text-[13px] text-ink hover:bg-raised-hover"
            >
              <Plus size={14} />
              Add server
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-hairline/40">
            {servers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div className="text-[14px] text-ink-secondary">No MCP servers configured yet</div>
                <a
                  href="https://github.com/modelcontextprotocol/servers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[12px] text-ink-secondary underline hover:text-ink"
                >
                  MCP servers directory <ExternalLink size={11} />
                </a>
              </div>
            ) : (
              servers.map((server, i) => (
                <div
                  key={server.name}
                  className={cn("flex items-center gap-3 bg-card px-4 py-3", i > 0 && "border-t border-hairline/40")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[14px] font-medium text-ink">
                      {server.name}
                      {server.enabled ? (
                        <span className="size-1.5 rounded-full bg-success" />
                      ) : (
                        <span className="text-[11px] text-ink-secondary">(disabled)</span>
                      )}
                    </div>
                    <div className="truncate text-[12px] text-ink-secondary">
                      {server.transport.toUpperCase()} · {server.url}
                      {server.hasHeaders ? " · has headers" : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => openEditor(server)}
                    className="rounded-md p-1.5 text-ink-secondary hover:bg-raised hover:text-ink"
                    title="Edit"
                  >
                    <Settings2 size={15} />
                  </button>
                  <button
                    disabled={saving}
                    onClick={() =>
                      persist(servers.map((s) => (s.name === server.name ? { ...s, enabled: !s.enabled } : s)))
                    }
                    className="w-[72px] rounded-lg bg-raised py-1.5 text-[12px] text-ink hover:bg-raised-hover disabled:opacity-50"
                  >
                    {server.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => persist(servers.filter((s) => s.name !== server.name))}
                    className="rounded-md p-1.5 text-ink-secondary hover:bg-danger hover:text-white disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {editing && (
        <div className="flex flex-col gap-3">
          <div className="text-[14px] font-medium text-ink">
            {servers.some((s) => s.name === editing.name) ? "Edit" : "Add"} MCP server
          </div>
          <label className="block text-[12px] text-ink-secondary">
            Name
            <input
              type="text"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="my-mcp-server"
              disabled={servers.some((s) => s.name === editing.name)}
              className="mt-1 w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink focus:outline-none disabled:opacity-50"
            />
          </label>
          <label className="block text-[12px] text-ink-secondary">
            Transport
            <select
              value={editing.transport}
              onChange={(e) => setEditing({ ...editing, transport: e.target.value as "http" | "sse" })}
              className="mt-1 w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink focus:outline-none"
            >
              <option value="http">HTTP (streamable HTTP)</option>
              <option value="sse">SSE (Server-Sent Events)</option>
            </select>
          </label>
          <label className="block text-[12px] text-ink-secondary">
            URL
            <input
              type="url"
              value={editing.url}
              onChange={(e) => setEditing({ ...editing, url: e.target.value })}
              placeholder="https://api.example.com/mcp"
              className="mt-1 w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink focus:outline-none"
            />
          </label>
          <div>
            <div className="text-[12px] text-ink-secondary">Headers (optional)</div>
            <div className="mt-1 space-y-2">
              {editing.headers.map((header, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={header.key}
                    onChange={(e) => {
                      const headers = [...editing.headers];
                      headers[i] = { ...headers[i], key: e.target.value };
                      setEditing({ ...editing, headers });
                    }}
                    placeholder="Authorization"
                    className="flex-1 rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[12px] text-ink focus:outline-none"
                  />
                  <input
                    type="password"
                    value={header.value}
                    onChange={(e) => {
                      const headers = [...editing.headers];
                      headers[i] = { ...headers[i], value: e.target.value };
                      setEditing({ ...editing, headers });
                    }}
                    placeholder="Bearer token…"
                    className="flex-1 rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[12px] text-ink focus:outline-none"
                  />
                </div>
              ))}
              <button
                onClick={() => setEditing({ ...editing, headers: [...editing.headers, { key: "", value: "" }] })}
                className="flex items-center gap-1 rounded-lg bg-raised px-3 py-1.5 text-[12px] text-ink hover:bg-raised-hover"
              >
                <Plus size={12} />
                Add header
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-ink">
            <input
              type="checkbox"
              checked={editing.enabled}
              onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              className="size-4 rounded border-hairline/40"
            />
            Enabled
          </label>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(null)}
              disabled={saving}
              className="rounded-lg bg-raised px-4 py-2 text-[13px] text-ink hover:bg-raised-hover disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => void saveServer()}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-[13px] text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
