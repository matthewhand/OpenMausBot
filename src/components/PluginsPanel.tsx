// Custom remote MCP servers panel. Users can add their own HTTP/SSE MCP
// servers with optional auth headers. Composio Connect shows as one optional
// preset when a key is configured, not the primary path.
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Plus, RefreshCw, Settings2, Trash2, X } from "lucide-react";
import { api, useStore, type ConfigStatus } from "@/state/store";
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

export function PluginsPanel() {
  const { dispatch } = useStore();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [composioConfigured, setComposioConfigured] = useState(false);
  const [editing, setEditing] = useState<EditingServer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadServers = useCallback(() => {
    api("/api/config")
      .then((cfg: ConfigStatus) => {
        setServers(cfg.mcpServers ?? []);
        setComposioConfigured(cfg.composio.configured);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const openEditor = (server?: McpServer) => {
    if (server) {
      setEditing({
        name: server.name,
        transport: server.transport,
        url: server.url,
        enabled: server.enabled,
        headers: [],
      });
    } else {
      setEditing({
        name: "",
        transport: "http",
        url: "",
        enabled: true,
        headers: [],
      });
    }
    setError(null);
  };

  const closeEditor = () => {
    setEditing(null);
    setError(null);
  };

  const saveServer = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.url.trim()) {
      setError("Name and URL are required");
      return;
    }
    // Validate name: alphanumeric + dash/underscore only
    if (!/^[\w-]+$/.test(editing.name.trim())) {
      setError("Name must contain only letters, numbers, dash, and underscore");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Build the server object with headers only if they exist
      const headers: Record<string, string> = {};
      for (const h of editing.headers) {
        if (h.key.trim() && h.value.trim()) {
          headers[h.key.trim()] = h.value.trim();
        }
      }

      const updatedServers = [...servers];
      const existingIndex = updatedServers.findIndex((s) => s.name === editing.name);
      const newServer: McpServer = {
        name: editing.name.trim(),
        transport: editing.transport,
        url: editing.url.trim(),
        enabled: editing.enabled,
        hasHeaders: Object.keys(headers).length > 0,
      };

      if (existingIndex >= 0) {
        updatedServers[existingIndex] = newServer;
      } else {
        updatedServers.push(newServer);
      }

      // Save to backend (with headers in the payload, but they won't be echoed back)
      const serverPayload = {
        ...newServer,
        headers: Object.keys(headers).length ? headers : undefined,
      };
      delete (serverPayload as any).hasHeaders;

      const updatedPayload = updatedServers.map((s) => {
        if (s.name === newServer.name) return serverPayload;
        // For other servers, keep their existing state (we don't have their headers)
        const { hasHeaders, ...rest } = s;
        return rest;
      });

      await api("/api/config", {
        method: "PUT",
        body: JSON.stringify({ mcpServers: updatedPayload }),
      });

      loadServers();
      closeEditor();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteServer = async (name: string) => {
    if (!confirm(`Delete MCP server "${name}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      const updated = servers.filter((s) => s.name !== name);
      const payload = updated.map(({ hasHeaders, ...rest }) => rest);
      await api("/api/config", {
        method: "PUT",
        body: JSON.stringify({ mcpServers: payload }),
      });
      loadServers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (name: string) => {
    setSaving(true);
    setError(null);
    try {
      const updated = servers.map((s) => (s.name === name ? { ...s, enabled: !s.enabled } : s));
      const payload = updated.map(({ hasHeaders, ...rest }) => rest);
      await api("/api/config", {
        method: "PUT",
        body: JSON.stringify({ mcpServers: payload }),
      });
      loadServers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40"
      onClick={() => dispatch({ type: "togglePlugins", open: false })}
    >
      <div
        className="animate-pop-in flex max-h-[85%] w-[640px] flex-col rounded-2xl border border-hairline/50 bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-[17px] font-semibold text-ink">Remote MCP Servers</div>
          <div className="flex items-center gap-1">
            <button
              onClick={loadServers}
              className="rounded-md p-1 text-ink-secondary hover:bg-raised hover:text-ink"
              title="Refresh"
            >
              <RefreshCw size={15} />
            </button>
            <button
              onClick={() => dispatch({ type: "togglePlugins", open: false })}
              className="rounded-md p-1 text-ink-secondary hover:bg-raised hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="mt-1 text-[13px] text-ink-secondary">
          Connect your own remote MCP servers (HTTP or SSE). Works with Claude.
        </div>

        {error && <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</div>}

        {!editing && (
          <>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-[14px] font-medium text-ink">Your Servers</div>
              <button
                onClick={() => openEditor()}
                className="flex items-center gap-1.5 rounded-lg bg-raised px-3 py-1.5 text-[13px] text-ink hover:bg-raised-hover"
              >
                <Plus size={14} />
                Add Server
              </button>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-hairline/40">
              {servers.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <div className="text-[14px] text-ink-secondary">No MCP servers configured yet</div>
                  <div className="text-[12px] text-ink-secondary">
                    Add your own HTTP or SSE MCP servers to give your bots access to custom tools.
                  </div>
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
                        {server.enabled && <span className="size-1.5 rounded-full bg-success" />}
                        {!server.enabled && <span className="text-[11px] text-ink-secondary">(disabled)</span>}
                      </div>
                      <div className="truncate text-[12px] text-ink-secondary">
                        {server.transport.toUpperCase()} · {server.url}
                        {server.hasHeaders && " · has headers"}
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
                      onClick={() => toggleEnabled(server.name)}
                      className="w-[72px] rounded-lg bg-raised py-1.5 text-[12px] text-ink hover:bg-raised-hover disabled:opacity-50"
                    >
                      {server.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      disabled={saving}
                      onClick={() => deleteServer(server.name)}
                      className="rounded-md p-1.5 text-ink-secondary hover:bg-danger hover:text-white disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {composioConfigured && (
              <div className="mt-4 rounded-lg border border-hairline/40 bg-card p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-medium text-ink">Composio Connect</div>
                    <div className="text-[11px] text-ink-secondary">
                      Connected apps (Slack, GitHub, Gmail, etc.) via Composio
                    </div>
                  </div>
                  <a
                    href="https://composio.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-lg bg-raised px-3 py-1.5 text-[12px] text-ink hover:bg-raised-hover"
                  >
                    Manage
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )}

            <div className="mt-3 text-[11px] text-ink-secondary">
              Need an MCP server? Check out{" "}
              <a
                href="https://github.com/modelcontextprotocol/servers"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-ink"
              >
                MCP servers directory
              </a>
              .
            </div>
          </>
        )}

        {editing && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="text-[14px] font-medium text-ink">
              {servers.find((s) => s.name === editing.name) ? "Edit" : "Add"} MCP Server
            </div>

            <div>
              <label className="block text-[12px] text-ink-secondary">
                Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="my-mcp-server"
                disabled={servers.some((s) => s.name === editing.name)}
                className="mt-1 w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none disabled:opacity-50"
              />
              <div className="mt-1 text-[11px] text-ink-secondary">
                Lowercase letters, numbers, dash, and underscore only. Used as the MCP server identifier.
              </div>
            </div>

            <div>
              <label className="block text-[12px] text-ink-secondary">
                Transport <span className="text-danger">*</span>
              </label>
              <select
                value={editing.transport}
                onChange={(e) => setEditing({ ...editing, transport: e.target.value as "http" | "sse" })}
                className="mt-1 w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink focus:border-hairline focus:outline-none"
              >
                <option value="http">HTTP (streamable HTTP)</option>
                <option value="sse">SSE (Server-Sent Events)</option>
              </select>
            </div>

            <div>
              <label className="block text-[12px] text-ink-secondary">
                URL <span className="text-danger">*</span>
              </label>
              <input
                type="url"
                value={editing.url}
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                placeholder="https://api.example.com/mcp"
                className="mt-1 w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[12px] text-ink-secondary">Headers (optional)</label>
              <div className="mt-1 space-y-2">
                {editing.headers.map((header, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={header.key}
                      onChange={(e) => {
                        const updated = [...editing.headers];
                        updated[i] = { ...updated[i], key: e.target.value };
                        setEditing({ ...editing, headers: updated });
                      }}
                      placeholder="Authorization"
                      className="flex-1 rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[12px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
                    />
                    <input
                      type="password"
                      value={header.value}
                      onChange={(e) => {
                        const updated = [...editing.headers];
                        updated[i] = { ...updated[i], value: e.target.value };
                        setEditing({ ...editing, headers: updated });
                      }}
                      placeholder="Bearer token..."
                      className="flex-1 rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[12px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        const updated = editing.headers.filter((_, idx) => idx !== i);
                        setEditing({ ...editing, headers: updated });
                      }}
                      className="rounded-md p-2 text-ink-secondary hover:bg-raised hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setEditing({ ...editing, headers: [...editing.headers, { key: "", value: "" }] })}
                  className="flex items-center gap-1 rounded-lg bg-raised px-3 py-1.5 text-[12px] text-ink hover:bg-raised-hover"
                >
                  <Plus size={12} />
                  Add Header
                </button>
              </div>
              <div className="mt-1 text-[11px] text-ink-secondary">
                Headers are stored securely and never echoed back. Use for API keys, auth tokens, etc.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={editing.enabled}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                className="size-4 rounded border-hairline/40"
              />
              <label htmlFor="enabled" className="text-[12px] text-ink">
                Enabled
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={closeEditor}
                disabled={saving}
                className="rounded-lg bg-raised px-4 py-2 text-[13px] text-ink hover:bg-raised-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveServer}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-[13px] text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
