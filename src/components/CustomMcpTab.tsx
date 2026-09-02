import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { api, type ConfigStatus } from "@/state/store";
import { cn } from "@/lib/cn";

export interface McpServer {
  name: string;
  transport: "http" | "sse";
  url: string;
  enabled: boolean;
  hasHeaders: boolean;
}

export interface EditingServer extends Omit<McpServer, "hasHeaders"> {
  headers: Array<{ key: string; value: string }>;
}

export interface McpVerifyResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export const RESERVED_MCP_NAMES = new Set(["agents", "computer", "composio", "dweb", "ogb"]);

export function buildVerifyPayload(
  server: { transport: "http" | "sse"; url: string; name?: string; headers?: Record<string, string> },
  options?: { headersList?: Array<{ key: string; value: string }>; clearingHeaders?: boolean },
) {
  const url = server.url.trim();
  const name = server.name?.trim() || undefined;
  const transport = server.transport;

  if (options) {
    const headers: Record<string, string> = {};
    for (const h of options.headersList ?? []) {
      if (h.key.trim() && h.value.trim()) headers[h.key.trim()] = h.value.trim();
    }
    const hasHeaders = Object.keys(headers).length > 0;
    return {
      transport,
      url,
      ...(name ? { name } : {}),
      ...(hasHeaders ? { headers } : options.clearingHeaders ? { headers: {} } : {}),
    };
  }

  return {
    ...(name ? { name } : {}),
    transport,
    url,
    ...(server.headers ? { headers: server.headers } : {}),
  };
}

export function CustomMcpTab() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [editing, setEditing] = useState<EditingServer | null>(null);
  const [editingOriginalName, setEditingOriginalName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [clearingHeaders, setClearingHeaders] = useState(false);
  const [testingServer, setTestingServer] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, McpVerifyResult>>({});

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
    setSuccess(null);
    setClearingHeaders(false);
    setEditingOriginalName(server?.name ?? null);
    setTestResults((prev) => {
      const next = { ...prev };
      delete next.__editing__;
      return next;
    });
    setEditing(
      server
        ? {
            name: server.name,
            transport: server.transport,
            url: server.url,
            enabled: server.enabled,
            headers: [],
          }
        : { name: "", transport: "http", url: "", enabled: true, headers: [] },
    );
  };

  const testConnection = async (server: McpServer) => {
    setTestingServer(server.name);
    try {
      const payload = buildVerifyPayload({
        name: server.name,
        transport: server.transport,
        url: server.url,
      });
      const res: McpVerifyResult = await api("/api/mcp/verify", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setTestResults((prev) => ({ ...prev, [server.name]: res }));
    } catch (e: unknown) {
      setTestResults((prev) => ({
        ...prev,
        [server.name]: { ok: false, error: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      setTestingServer(null);
    }
  };

  const testEditingConnection = async () => {
    if (!editing) return;
    const url = editing.url.trim();
    if (!url) {
      setError("URL is required to test connection");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setError("URL must start with http:// or https://");
      return;
    }

    setTestingServer("__editing__");
    setError(null);
    try {
      const payload = buildVerifyPayload(
        {
          transport: editing.transport,
          url,
          name: editing.name.trim() || undefined,
        },
        {
          headersList: editing.headers,
          clearingHeaders,
        },
      );
      const res: McpVerifyResult = await api("/api/mcp/verify", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setTestResults((prev) => ({ ...prev, __editing__: res }));
    } catch (e: unknown) {
      setTestResults((prev) => ({
        ...prev,
        __editing__: { ok: false, error: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      setTestingServer(null);
    }
  };

  const saveServer = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    const url = editing.url.trim();

    if (!name || !url) {
      setError("Name and URL are required");
      return;
    }
    if (!/^[\w-]+$/.test(name)) {
      setError("Name must contain only letters, numbers, dash, and underscore");
      return;
    }
    if (editingOriginalName === null && servers.some((s) => s.name === name)) {
      setError(`A server named "${name}" already exists`);
      return;
    }
    if (RESERVED_MCP_NAMES.has(name)) {
      setError(`"${name}" is a reserved server name`);
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setError("URL must start with http:// or https://");
      return;
    }

    for (const h of editing.headers) {
      const k = h.key.trim();
      const v = h.value.trim();
      if ((k && !v) || (!k && v)) {
        setError("All headers must have both a key and a value");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      for (const h of editing.headers) {
        if (h.key.trim() && h.value.trim()) headers[h.key.trim()] = h.value.trim();
      }
      const hasNewHeaders = Object.keys(headers).length > 0;
      const next = {
        name,
        transport: editing.transport,
        url,
        enabled: editing.enabled,
        ...(hasNewHeaders ? { headers } : clearingHeaders ? { headers: {} } : {}),
      };
      const payload = [
        ...servers.filter((s) => s.name !== next.name).map(({ hasHeaders: _h, ...rest }) => rest),
        next,
      ];
      await api("/api/config", { method: "PUT", body: JSON.stringify({ mcpServers: payload }) });
      loadServers();
      setEditing(null);
      setEditingOriginalName(null);
      setSuccess(`Server "${name}" saved successfully`);
      window.setTimeout(() => setSuccess(null), 3000);
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

  const deleteServer = (server: McpServer) => {
    if (!window.confirm(`Delete custom MCP server "${server.name}"?`)) return;
    void persist(servers.filter((s) => s.name !== server.name));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-7 pt-2 sm:px-8">
      <p className="mb-3 text-[13px] text-ink-secondary">
        Add your own HTTP or SSE MCP servers. Claude and ACP engines (Grok, Kimi, …) pick them up on
        the next turn. Headers are write-only.
      </p>
      {error && <div className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</div>}
      {success && <div className="mb-3 rounded-lg bg-success/10 px-3 py-2 text-[12px] text-success">{success}</div>}

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
                    {testResults[server.name] && (
                      <div
                        className={cn(
                          "mt-0.5 text-[11px]",
                          testResults[server.name].ok ? "text-success" : "text-danger",
                        )}
                      >
                        {testResults[server.name].ok
                          ? `✓ Connected (${testResults[server.name].latencyMs ?? 0}ms)`
                          : `✗ ${testResults[server.name].error || "Connection failed"}`}
                      </div>
                    )}
                  </div>
                  <button
                    disabled={testingServer === server.name}
                    onClick={() => void testConnection(server)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-ink-secondary hover:bg-raised hover:text-ink disabled:opacity-50"
                    title="Test connection"
                  >
                    {testingServer === server.name ? <Loader2 size={13} className="animate-spin" /> : null}
                    Test
                  </button>
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
                    onClick={() => deleteServer(server)}
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
            {editingOriginalName !== null ? "Edit" : "Add"} MCP server
          </div>
          <label className="block text-[12px] text-ink-secondary">
            Name
            <input
              type="text"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="my-mcp-server"
              disabled={editingOriginalName !== null}
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
            <div className="mb-1 text-[12px] text-ink-secondary">Headers (optional)</div>
            {editingOriginalName !== null &&
              servers.find((s) => s.name === editingOriginalName)?.hasHeaders &&
              !clearingHeaders && (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-inset px-3 py-1.5 text-[12px] text-ink-secondary">
                  <span>✓ Secret headers are saved on this server.</span>
                  <button
                    type="button"
                    onClick={() => setClearingHeaders(true)}
                    className="font-medium text-danger hover:underline"
                  >
                    Clear headers
                  </button>
                </div>
              )}
            {clearingHeaders && (
              <div className="mb-2 flex items-center justify-between rounded-lg bg-danger/10 px-3 py-1.5 text-[12px] text-danger">
                <span>Headers will be cleared on save.</span>
                <button
                  type="button"
                  onClick={() => setClearingHeaders(false)}
                  className="font-medium text-ink hover:underline"
                >
                  Keep stored headers
                </button>
              </div>
            )}
            <div className="space-y-2">
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
          {testResults.__editing__ && (
            <div
              className={cn(
                "rounded-lg px-3 py-2 text-[12px]",
                testResults.__editing__.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
              )}
            >
              {testResults.__editing__.ok
                ? `✓ Connection successful (${testResults.__editing__.latencyMs ?? 0}ms)`
                : `✗ ${testResults.__editing__.error || "Connection failed"}`}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => void testEditingConnection()}
              disabled={saving || testingServer === "__editing__" || !editing.url.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-raised px-3 py-2 text-[13px] text-ink hover:bg-raised-hover disabled:opacity-50"
            >
              {testingServer === "__editing__" ? <Loader2 size={14} className="animate-spin" /> : null}
              Test connection
            </button>
            <div className="flex gap-2">
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
        </div>
      )}
    </div>
  );
}
