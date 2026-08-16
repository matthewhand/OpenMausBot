// Tools / MCP (Model Context Protocol) settings. Configure custom remote
// tool servers without requiring Composio.
import { useState, useEffect } from "react";
import { Plus, Trash2, Power, PowerOff, AlertTriangle } from "lucide-react";
import { useStore } from "@/state/store";
import { Card } from "./SettingsPrimitives";
import { cn } from "@/lib/cn";

interface MCPServer {
  id: string;
  name: string;
  url: string;
  transport: "http" | "stdio" | "sse";
  enabled: boolean;
  headers?: Record<string, string>;
}

export function ToolsSection() {
  const { state, dispatch } = useStore();
  const mcpServers = state.config?.mcpServers || [];

  const [servers, setServers] = useState<MCPServer[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // Sync with server state
  useEffect(() => {
    const fullServers: MCPServer[] = (mcpServers as any[]).map(s => ({
      id: s.id,
      name: s.name,
      url: s.url,
      transport: s.transport,
      enabled: s.enabled,
      headers: s.hasHeaders ? {} : undefined, // headers are redacted in status
    }));
    setServers(fullServers);
  }, [mcpServers]);

  const generateId = () => `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const addServer = () => {
    const newServer: MCPServer = {
      id: generateId(),
      name: "New MCP Server",
      url: "http://localhost:3000",
      transport: "http",
      enabled: false,
    };
    setServers([...servers, newServer]);
    setEditingId(newServer.id);
  };

  const updateServer = (id: string, updates: Partial<MCPServer>) => {
    setServers(servers.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteServer = (id: string) => {
    setServers(servers.filter(s => s.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const toggleServer = (id: string) => {
    updateServer(id, { enabled: !servers.find(s => s.id === id)?.enabled });
  };

  const saveSettings = async () => {
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mcpServers: servers.map(s => ({
            id: s.id,
            name: s.name,
            url: s.url,
            transport: s.transport,
            enabled: s.enabled,
            headers: s.headers,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const config = await response.json();
      dispatch({ type: "configStatus", config });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const buttonClass = cn(
    "rounded-lg border px-3 py-1.5 text-[13px] transition-colors",
    "disabled:opacity-40 disabled:cursor-not-allowed"
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Info Card */}
      <Card
        title="Custom Tool Servers (MCP)"
        subtitle="Connect to Model Context Protocol servers for additional tools"
      >
        <div className="text-[12px] text-ink-secondary space-y-2">
          <p>
            MCP (Model Context Protocol) allows you to connect external tool servers that provide
            additional capabilities to your bots. No Composio account required.
          </p>
          <p>
            <strong className="text-ink">Supported transports:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>HTTP:</strong> Standard HTTP/REST API servers</li>
            <li><strong>SSE:</strong> Server-Sent Events for streaming tools</li>
            <li><strong>stdio:</strong> Local command-line tools (advanced)</li>
          </ul>
        </div>
      </Card>

      {/* Server List */}
      {servers.length === 0 ? (
        <Card title="No MCP Servers" subtitle="Add your first custom tool server">
          <button
            onClick={addServer}
            className={cn(buttonClass, "border-blue-500 text-blue-500 hover:bg-blue-500/10")}
          >
            <Plus size={14} className="inline mr-1" />
            Add MCP Server
          </button>
        </Card>
      ) : (
        <>
          {servers.map((server) => (
            <div key={server.id} className="rounded-xl bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {server.enabled ? (
                    <Power size={14} className="text-green-500" />
                  ) : (
                    <PowerOff size={14} className="text-ink-secondary" />
                  )}
                  <span className="text-[15px] font-medium text-ink">{server.name}</span>
                </div>
              </div>
              <div className="text-[13px] text-ink-secondary mb-3">
                {server.transport.toUpperCase()} · {server.url}
              </div>
              <div className="flex flex-col gap-3">
                {editingId === server.id ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <label className="text-[12px] text-ink-secondary">Name</label>
                      <input
                        type="text"
                        value={server.name}
                        onChange={(e) => updateServer(server.id, { name: e.target.value })}
                        className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[12px] text-ink-secondary">URL</label>
                      <input
                        type="text"
                        value={server.url}
                        onChange={(e) => updateServer(server.id, { url: e.target.value })}
                        placeholder="http://localhost:3000"
                        className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[12px] text-ink-secondary">Transport</label>
                      <select
                        value={server.transport}
                        onChange={(e) =>
                          updateServer(server.id, { transport: e.target.value as "http" | "stdio" | "sse" })
                        }
                        className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink"
                      >
                        <option value="http">HTTP</option>
                        <option value="sse">SSE (Server-Sent Events)</option>
                        <option value="stdio">stdio (Command-line)</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={server.enabled}
                          onChange={() => toggleServer(server.id)}
                          className="w-4 h-4"
                        />
                        <span className="text-[13px] text-ink">Enabled</span>
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-[13px] text-ink">
                        {server.enabled ? "Active" : "Disabled"}
                      </span>
                      {server.headers && Object.keys(server.headers).length > 0 && (
                        <span className="text-[11px] text-ink-secondary">
                          Custom headers configured
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleServer(server.id)}
                        className={cn(buttonClass, "border-hairline/40 hover:bg-raised")}
                      >
                        {server.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => setEditingId(server.id)}
                        className={cn(buttonClass, "border-hairline/40 hover:bg-raised")}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteServer(server.id)}
                        className={cn(buttonClass, "border-red-500/40 text-red-500 hover:bg-red-500/10")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {editingId === server.id && (
                  <div className="flex gap-2 pt-2 border-t border-hairline/40">
                    <button
                      onClick={() => setEditingId(null)}
                      className={cn(buttonClass, "border-hairline/40 hover:bg-raised")}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => deleteServer(server.id)}
                      className={cn(buttonClass, "border-red-500/40 text-red-500 hover:bg-red-500/10")}
                    >
                      <Trash2 size={14} className="inline mr-1" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Add Button */}
          <button
            onClick={addServer}
            className={cn(
              buttonClass,
              "border-hairline/40 hover:bg-raised w-full py-2"
            )}
          >
            <Plus size={14} className="inline mr-1" />
            Add Another Server
          </button>
        </>
      )}

      {/* Warning about MCP Security */}
      {servers.some(s => s.enabled) && (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
          <div className="text-[12px] text-ink-secondary">
            <strong className="text-ink">Security notice:</strong> Only connect to MCP servers you trust.
            These servers can provide tools that your bots will execute with your permissions.
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-[13px] text-red-500">{error}</p>
        </div>
      )}

      {/* Save Button */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-[11px] text-ink-secondary">
          Changes take effect immediately (no restart required)
        </p>
        <button
          onClick={saveSettings}
          disabled={saving}
          className={cn(
            buttonClass,
            "border-blue-500 bg-blue-500 text-white hover:bg-blue-600 disabled:bg-blue-500/50"
          )}
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {/* Documentation */}
      <Card
        title="About MCP Protocol"
        subtitle="Learn more about Model Context Protocol"
      >
        <div className="text-[12px] text-ink-secondary space-y-2">
          <p>
            MCP is an open protocol for connecting AI assistants to external tools and data sources.
            It enables your bots to access databases, APIs, file systems, and other services through
            standardized tool interfaces.
          </p>
          <p>
            <strong className="text-ink">Examples:</strong> File system access, database queries,
            API integrations, custom business logic, data transformations, and more.
          </p>
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-accent hover:underline font-medium"
          >
            Learn more about MCP →
          </a>
        </div>
      </Card>
    </div>
  );
}
