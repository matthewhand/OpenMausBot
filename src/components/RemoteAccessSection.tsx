// Remote access / LAN settings. Default: localhost-only (secure). Users can
// opt in to LAN exposure with required authentication.
import { useState, useEffect } from "react";
import { Copy, Eye, EyeOff, RefreshCw, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { useStore } from "@/state/store";
import { Card } from "./SettingsPrimitives";
import { cn } from "@/lib/cn";

/** Generate a secure random token for authentication */
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Copy text to clipboard with visual feedback */
function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return { copied, copy };
}

export function RemoteAccessSection() {
  const { state, dispatch } = useStore();
  const network = state.config?.network;
  const { copied, copy } = useCopyToClipboard();

  // Local UI state
  const [enabled, setEnabled] = useState(network?.enabled ?? false);
  const [host, setHost] = useState(network?.host || "127.0.0.1");
  const [corsOrigin, setCorsOrigin] = useState(network?.corsOrigin || "");
  const [newToken, setNewToken] = useState<string>("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // Sync with server state
  useEffect(() => {
    if (network) {
      setEnabled(network.enabled);
      setHost(network.host);
      setCorsOrigin(network.corsOrigin || "");
    }
  }, [network]);

  const hasAuthToken = network?.authConfigured ?? false;
  const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  const canEnable = hasAuthToken || newToken;
  
  // Get LAN IP for display (if available from window context)
  const lanIp = typeof window !== "undefined" && (window as any).ogb?.lanIp;
  const displayUrl = isLoopback 
    ? `http://127.0.0.1:${(window as any).ogb?.port || 8799}`
    : `http://${lanIp || host}:${(window as any).ogb?.port || 8799}`;

  const generateNewToken = () => {
    const token = generateToken();
    setNewToken(token);
    setShowToken(true);
    setError("");
  };

  const saveSettings = async () => {
    setSaving(true);
    setError("");

    // Validate: if enabling LAN, must have a token
    if (enabled && !isLoopback && !hasAuthToken && !newToken) {
      setError("Cannot enable LAN access without an authentication token. Generate one first.");
      setSaving(false);
      return;
    }

    try {
      const patch: any = {
        network: {
          enabled,
          host: host.trim(),
          corsOrigin: corsOrigin.trim() || undefined,
        },
      };

      // Include new token if generated
      if (newToken) {
        patch.network.authToken = newToken;
      }

      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const config = await response.json();
      dispatch({ type: "configStatus", config });

      // Clear the new token after successful save (it's now stored)
      if (newToken) {
        setNewToken("");
        setShowToken(false);
      }

      // Show restart reminder
      alert("Settings saved. Restart OpenMausBot to apply network changes.");
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
      {/* Status Card */}
      <Card
        title="Remote Access Status"
        subtitle={
          enabled && !isLoopback
            ? "🌐 LAN access is enabled"
            : "🔒 Localhost only (secure default)"
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-lg border border-hairline/40 bg-inset p-3">
            <div className="flex items-center gap-2">
              {enabled && !isLoopback ? (
                <Wifi size={16} className="text-green-500" />
              ) : (
                <WifiOff size={16} className="text-ink-secondary" />
              )}
              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-ink">
                  {enabled && !isLoopback ? "Network accessible" : "Local only"}
                </span>
                <span className="text-[11px] text-ink-secondary">
                  {host} {hasAuthToken && "• Auth configured"}
                </span>
              </div>
            </div>
            {enabled && !isLoopback && (
              <button
                onClick={() => copy(displayUrl)}
                className={cn(buttonClass, "border-hairline/40 hover:bg-raised")}
              >
                {copied ? "Copied!" : <><Copy size={14} className="inline mr-1" />Copy URL</>}
              </button>
            )}
          </div>

          {/* Warning when LAN is enabled */}
          {enabled && !isLoopback && (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <div className="text-[12px] text-ink-secondary">
                <strong className="text-ink">Security notice:</strong> Your OpenMausBot web UI is
                accessible on your local network. Ensure your firewall is properly configured and
                only trusted devices can access this network.
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Enable/Disable Toggle */}
      <Card
        title="Enable LAN Access"
        subtitle="Allow access from other devices on your local network"
      >
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={!isLoopback && !canEnable}
              className="w-4 h-4"
            />
            <span className="text-[13px] text-ink">
              Enable remote web UI access
            </span>
          </label>
          {enabled && !isLoopback && !canEnable && (
            <p className="text-[11px] text-red-500">
              ⚠️ Generate an authentication token before enabling LAN access
            </p>
          )}
        </div>
      </Card>

      {/* Host Configuration */}
      <Card
        title="Bind Address"
        subtitle="Network interface to listen on"
      >
        <div className="flex flex-col gap-2">
          <select
            value={host}
            onChange={(e) => setHost(e.target.value)}
            className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink focus:border-hairline focus:outline-none"
          >
            <option value="127.0.0.1">127.0.0.1 (localhost only - secure)</option>
            <option value="0.0.0.0">0.0.0.0 (all network interfaces)</option>
          </select>
          <p className="text-[11px] text-ink-secondary">
            {isLoopback
              ? "Only accessible from this computer (recommended)"
              : "Accessible from your local network (requires authentication)"}
          </p>
        </div>
      </Card>

      {/* Authentication Token */}
      <Card
        title="Authentication Token"
        subtitle={
          hasAuthToken
            ? "Token is configured (never shown again)"
            : "Required for LAN access"
        }
      >
        <div className="flex flex-col gap-3">
          {hasAuthToken && !newToken ? (
            <div className="flex items-center justify-between rounded-lg border border-hairline/40 bg-inset p-3">
              <span className="text-[13px] text-ink">✓ Token configured</span>
              <button
                onClick={generateNewToken}
                className={cn(buttonClass, "border-hairline/40 hover:bg-raised")}
              >
                <RefreshCw size={14} className="inline mr-1" />
                Rotate
              </button>
            </div>
          ) : (
            <>
              {newToken ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type={showToken ? "text" : "password"}
                      value={newToken}
                      readOnly
                      className="flex-1 rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] font-mono text-ink"
                    />
                    <button
                      onClick={() => setShowToken(!showToken)}
                      className={cn(buttonClass, "border-hairline/40 hover:bg-raised")}
                    >
                      {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      onClick={() => copy(newToken)}
                      className={cn(buttonClass, "border-hairline/40 hover:bg-raised")}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-600">
                    ⚠️ Save this token now. It won't be shown again after saving.
                  </p>
                </div>
              ) : (
                <button
                  onClick={generateNewToken}
                  className={cn(
                    buttonClass,
                    "border-blue-500 text-blue-500 hover:bg-blue-500/10"
                  )}
                >
                  Generate Authentication Token
                </button>
              )}
            </>
          )}
          <p className="text-[11px] text-ink-secondary">
            Clients must include this token as <code className="px-1 py-0.5 bg-raised rounded text-[10px]">
              Authorization: Bearer &lt;token&gt;
            </code> in all API requests.
          </p>
        </div>
      </Card>

      {/* CORS Origin (Optional) */}
      <Card
        title="CORS Origin (Optional)"
        subtitle="Allow web clients from a specific origin"
      >
        <input
          type="text"
          value={corsOrigin}
          onChange={(e) => setCorsOrigin(e.target.value)}
          placeholder="https://example.com (leave empty to disable)"
          className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
        />
      </Card>

      {/* Error Display */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-[13px] text-red-500">{error}</p>
        </div>
      )}

      {/* Save Button */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-[11px] text-ink-secondary">
          Changes require an app restart to take effect
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
        title="Security & Threat Model"
        subtitle="Understanding LAN access security"
      >
        <div className="text-[12px] text-ink-secondary space-y-2">
          <p>
            <strong className="text-ink">Local network only:</strong> LAN access is designed for
            trusted local networks (home, office). It's not a replacement for HTTPS/TLS on hostile
            networks.
          </p>
          <p>
            <strong className="text-ink">Token authentication:</strong> The Bearer token is a
            shared secret. Anyone with the token can access your OpenMausBot API. Keep it secure.
          </p>
          <p>
            <strong className="text-ink">Future improvements:</strong> HTTPS/TLS support and more
            advanced authentication mechanisms are planned for future releases.
          </p>
        </div>
      </Card>
    </div>
  );
}
