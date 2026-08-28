// App settings, as a real modal with sections rather than one long panel.
// Per-bot settings (persona, model, computer) stay in SettingsPanel — this
// is the stuff shared by every bot: who you are, your keys, and the
// machine your bots can borrow.
import { useEffect, useRef, useState } from "react";
import { Coins, KeyRound, Monitor, Network, Search, Smartphone, Terminal, User, Volume2, X } from "lucide-react";
import { api, useStore, type AppSettingsSection, type ConfigStatus } from "@/state/store";
import { analyticsEnabled, setAnalyticsEnabled } from "@/lib/analytics";
import { showToolCallsEnabled, skillRecorderEnabled } from "@/lib/feature-flags";
import { ApiKeyRow, VpsConnection } from "./ApiKeys";
import { useUpdaterState } from "@/lib/updater";
import { EnginesSettings } from "./EnginesSettings";
import { LocalComputerSection } from "./LocalComputerSection";
import { CompanionSection } from "./CompanionSection";
import { Card, CommandLine } from "./SettingsPrimitives";
import { UsageSection } from "./UsageSection";
import { SkinPicker } from "./SkinPicker";
import { RoomTurnTimeoutSettings } from "./RoomTurnTimeoutSettings";
import { TranscriptionSettings } from "./TranscriptionSettings";
import { VoiceSettings } from "./VoiceSettings";
import { clearLanAuthToken, readLanAuthToken, saveLanAuthToken } from "@/lib/lan-auth";
import { cn } from "@/lib/cn";

const SECTIONS: Array<{
  id: AppSettingsSection;
  label: string;
  icon: typeof User;
  keywords: string[];
}> = [
  { id: "general", label: "General", icon: User, keywords: ["profile", "name", "email", "skin", "theme", "appearance", "analytics", "updates", "tools", "tool calls"] },
  { id: "lan", label: "LAN Access", icon: Network, keywords: ["lan", "auth", "token", "network", "bind"] },
  { id: "connections", label: "Connections", icon: KeyRound, keywords: ["keys", "api", "composio", "box", "xai", "vps"] },
  { id: "engines", label: "Engines", icon: Terminal, keywords: ["models", "claude", "grok", "providers", "cli"] },
  { id: "companion", label: "Phone", icon: Smartphone, keywords: ["companion", "phone", "pair", "mobile"] },
  { id: "computer", label: "Local VM", icon: Monitor, keywords: ["vm", "virtual", "desktop"] },
  { id: "voice", label: "Voice", icon: Volume2, keywords: ["tts", "elevenlabs", "kokoro", "speech"] },
  { id: "usage", label: "Usage", icon: Coins, keywords: ["tokens", "cost", "billing"] },
];

function sectionMatches(section: (typeof SECTIONS)[number], query: string): boolean {
  if (!query) return true;
  return [section.label, ...section.keywords].some((part) => part.toLowerCase().includes(query));
}

/** Name + email, persisted to /api/config {profile} on blur. */
function ProfileFields() {
  const { state, dispatch } = useStore();
  const [name, setName] = useState(state.config?.profile?.name ?? "");
  const [email, setEmail] = useState(state.config?.profile?.email ?? "");
  useEffect(() => {
    setName(state.config?.profile?.name ?? "");
    setEmail(state.config?.profile?.email ?? "");
  }, [state.config?.profile?.name, state.config?.profile?.email]);

  const save = () => {
    void api("/api/config", {
      method: "PUT",
      body: JSON.stringify({ profile: { name: name.trim(), email: email.trim().toLowerCase() } }),
    })
      .then((config) => dispatch({ type: "configStatus", config }))
      .catch(() => {});
  };

  const inputClass =
    "w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none";
  return (
    <div className="flex flex-col gap-3">
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} placeholder="Your name" className={inputClass} />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onBlur={save}
        placeholder="you@example.com"
        className={inputClass}
      />
    </div>
  );
}

function UpdatesRow() {
  const s = useUpdaterState();
  if (!window.ogb?.updater) return null;
  const updater = window.ogb.updater;
  const label =
    s?.status === "checking"
      ? "Checking…"
      : s?.status === "available"
        ? `${s.version} available`
        : s?.status === "downloading"
          ? `Downloading ${Math.round(s.percent ?? 0)}%`
          : s?.status === "downloaded"
            ? `${s.version} ready — restart to apply`
            : s?.status === "error"
              ? `Check failed: ${s.message ?? "unknown error"}`
              : "You're on the latest version we know of.";
  return (
    <Card title="Updates" subtitle={label}>
      <button
        onClick={() => {
          if (s?.status === "available") return void updater.download();
          if (s?.status === "downloaded") return void updater.install();
          void updater.check();
        }}
        disabled={s?.status === "checking" || s?.status === "downloading"}
        className="rounded-lg border border-hairline/40 px-3 py-1.5 text-[13px] text-ink hover:bg-control disabled:opacity-40"
      >
        {s?.status === "available"
          ? "Download"
          : s?.status === "downloaded"
            ? "Restart and install"
            : "Check for updates"}
      </button>
    </Card>
  );
}

function InlineInterAgentChatRow() {
  const { state, dispatch } = useStore();
  return (
    <Card
      title="Inline Inter-Agent Chat"
      subtitle="Display bot-to-bot exchanges solely as inline chips in the transcript, hiding automated pair channels from the sidebar."
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-ink">Hide bot-to-bot channels from sidebar</span>
        <button
          type="button"
          role="switch"
          aria-checked={state.inlineInterAgentChat}
          onClick={() => dispatch({ type: "setInlineInterAgentChat", enabled: !state.inlineInterAgentChat })}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
            state.inlineInterAgentChat ? "bg-accent" : "bg-raised hover:bg-raised-hover",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
              state.inlineInterAgentChat ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>
    </Card>
  );
}

/** Usage analytics, on by default and switchable here. Naming what is sent
 * matters more than the switch: people who cannot see the scope assume the
 * worst, and the worst — conversation text — is exactly what this never
 * sends (autocapture is off; see lib/analytics.ts). */
function AnalyticsRow() {
  const [on, setOn] = useState(analyticsEnabled);
  return (
    <Card
      title="Usage analytics"
      subtitle="Anonymous product events — app opened, which features get used. Never conversations, prompts, file contents, or bot output. Your email is only attached if you shared it during setup."
    >
      <button
        role="switch"
        aria-checked={on}
        aria-label="Send usage analytics"
        onClick={() => {
          const next = !on;
          setAnalyticsEnabled(next);
          setOn(next);
        }}
        className={cnSwitch(on)}
      >
        <span className={cnKnob(on)} />
      </button>
    </Card>
  );
}

function ToolCallsRow() {
  const { state, dispatch } = useStore();
  const enabled = showToolCallsEnabled(state.config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const config: ConfigStatus = await api("/api/config", {
        method: "PATCH",
        body: JSON.stringify({ features: { showToolCalls: !enabled } }),
      });
      dispatch({ type: "configStatus", config });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the tool-call setting.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Tool calls"
      subtitle="Show each tool a bot runs in the transcript. Off by default — the mascot already shows that work is happening."
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-ink">Show tool calls</div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">
            Named chips for Bash, search, and other tools. Errors and bot-to-bot messages still appear.
          </div>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Show tool calls in chat"
          disabled={saving}
          onClick={() => void toggle()}
          className={`${cnSwitch(enabled)} disabled:cursor-wait disabled:opacity-50`}
        >
          <span className={cnKnob(enabled)} />
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p> : null}
    </Card>
  );
}

function ExperimentalFeaturesRow() {
  const { state, dispatch } = useStore();
  const enabled = skillRecorderEnabled(state.config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const config: ConfigStatus = await api("/api/config", {
        method: "PATCH",
        body: JSON.stringify({ features: { skillRecorder: !enabled } }),
      });
      dispatch({ type: "configStatus", config });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the experimental feature setting.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Experimental features"
      subtitle="Early features may change while we test them. They stay off unless you enable them."
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-ink">Teach a skill</div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">
            Show the workflow recorder in the sidebar.
          </div>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Show Teach a skill"
          disabled={saving}
          onClick={() => void toggle()}
          className={`${cnSwitch(enabled)} disabled:cursor-wait disabled:opacity-50`}
        >
          <span className={cnKnob(enabled)} />
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p> : null}
    </Card>
  );
}

const cnSwitch = (on: boolean) =>
  `relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-control"}`;
const cnKnob = (on: boolean) =>
  `absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all ${on ? "left-[21px]" : "left-[3px]"}`;

/** Writes a redacted diagnostics file to a location the user picks. The
 * report holds versions, configured-or-not booleans and the server.log tail —
 * never credential values (the desktop shell does not read secret fields). */
function DiagnosticsRow() {
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const exportDiagnostics = async () => {
    if (!window.ogb?.exportDiagnostics || exporting) return;
    setExporting(true);
    setResult(null);
    try {
      const path = await window.ogb.exportDiagnostics();
      if (path) setResult({ kind: "success", message: `Saved to ${path}` });
    } catch (e) {
      setResult({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card
      title="Diagnostics"
      subtitle="Versions, configuration on/off state and a redacted server log tail. Review the file before sharing it."
    >
      <div className="flex min-w-0 flex-col items-end gap-2">
        <button
          onClick={() => void exportDiagnostics()}
          disabled={exporting}
          aria-label="Export diagnostics to a text file"
          className="rounded-lg border border-hairline/40 px-3 py-1.5 text-[13px] text-ink hover:bg-control disabled:opacity-40"
        >
          {exporting ? "Exporting…" : "Export Diagnostics…"}
        </button>
        {result ? (
          <span
            role={result.kind === "error" ? "alert" : "status"}
            className={`max-w-64 break-all text-right text-[12px] ${result.kind === "error" ? "text-danger" : "text-success"}`}
          >
            {result.message}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function LanAuthRow() {
  const [token, setToken] = useState(() => readLanAuthToken());
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saved, setSaved] = useState(false);

  const save = () => {
    saveLanAuthToken(val);
    setToken(readLanAuthToken());
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const clear = () => {
    clearLanAuthToken();
    setToken("");
    setEditing(false);
  };

  return (
    <Card
      title="LAN Access Token"
      subtitle="Bearer token stored in this browser for connecting to OpenMausBot servers running with OMB_AUTH_TOKEN."
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <input
            type="password"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Paste access token…"
            autoComplete="off"
            className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg bg-raised px-3 py-1.5 text-[12px] text-ink hover:bg-raised-hover"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded-lg bg-accent px-3 py-1.5 text-[12px] text-white hover:opacity-90"
            >
              Save Token
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="text-[13px] text-ink-secondary">
            {token ? (
              <span className="flex items-center gap-1.5 text-success">
                <span className="size-1.5 rounded-full bg-success" /> Stored in browser (••••••••)
              </span>
            ) : (
              "No token stored on this browser"
            )}
            {saved && <span className="ml-2 text-[11px] text-success">Saved</span>}
          </div>
          <div className="flex gap-2">
            {token && (
              <button
                onClick={clear}
                className="rounded-lg border border-hairline/40 px-3 py-1.5 text-[12px] text-danger hover:bg-raised"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => {
                setVal(token);
                setEditing(true);
              }}
              className="rounded-lg border border-hairline/40 px-3 py-1.5 text-[12px] text-ink hover:bg-raised"
            >
              {token ? "Change" : "Set Token"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function LanAccessSection() {
  const [token] = useState(() => readLanAuthToken());
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8800";
  const shareableUrl = token ? `${origin}/?access_token=${encodeURIComponent(token)}` : origin;

  return (
    <div className="flex flex-col gap-4">
      <LanAuthRow />

      <Card
        title="Direct Connection Link"
        subtitle="Share this URL to instantly connect to OpenMausBot from your phone, tablet, or another computer on the local network with authentication pre-filled."
      >
        <CommandLine command={shareableUrl} />
      </Card>

      <Card
        title="LAN Subnet Bypass (Zero-Auth Subnets)"
        subtitle="To allow entire subnets to access OpenMausBot without entering a token, start the server with OMB_LAN_BYPASS_CIDR."
      >
        <div className="flex flex-col gap-2">
          <div className="text-[12.5px] text-ink-secondary">
            Example: Bypass authentication for all devices on the <code className="rounded bg-inset px-1 py-0.5 font-mono text-[11.5px] text-ink">10.0.0.0/24</code> subnet:
          </div>
          <CommandLine command='$env:OMB_LAN_BYPASS_CIDR="10.0.0.0/24"' />
        </div>
      </Card>

      <Card
        title="Headless Server Startup"
        subtitle="Command to run OpenMausBot bound to all local network interfaces (0.0.0.0:8800) with LAN authentication:"
      >
        <CommandLine command='$env:OMB_HOST="0.0.0.0"; $env:OMB_PORT="8800"; $env:OMB_AUTH_TOKEN=(Get-Content .omb-lan-token).Trim(); node server/index.ts' />
      </Card>
    </div>
  );
}

export function SettingsModal() {
  const { state, dispatch } = useStore();
  const section = state.appSettingsSection;
  const dialogRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visibleSections = SECTIONS.filter((entry) => sectionMatches(entry, q));

  useEffect(() => {
    const visible = SECTIONS.filter((entry) => sectionMatches(entry, q));
    if (visible.some((entry) => entry.id === section)) return;
    const first = visible[0];
    if (first) dispatch({ type: "toggleAppSettings", open: true, section: first.id });
  }, [dispatch, q, section]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch({ type: "toggleAppSettings", open: false });
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [dispatch]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && dispatch({ type: "toggleAppSettings", open: false })}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
        tabIndex={-1}
        className="flex h-[560px] w-full max-w-[860px] overflow-hidden rounded-2xl border border-hairline/50 bg-panel shadow-2xl outline-none"
      >
        {/* section nav */}
        <nav className="flex w-[190px] shrink-0 flex-col gap-0.5 border-r border-hairline/40 p-3">
          <div id="app-settings-title" className="px-2 pb-2 pt-1 text-[15px] font-semibold text-ink">
            Settings
          </div>
          <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-control/70 px-2.5 py-1.5">
            <Search size={14} className="shrink-0 text-ink-secondary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                e.stopPropagation();
                if (query) setQuery("");
                else dispatch({ type: "toggleAppSettings", open: false });
              }}
              placeholder="Search"
              aria-label="Search settings"
              className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
            />
          </div>
          {visibleSections.length === 0 && (
            <div className="px-2.5 py-4 text-[12.5px] leading-relaxed text-ink-secondary">
              Nothing matches “{query.trim()}”
            </div>
          )}
          {visibleSections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => dispatch({ type: "toggleAppSettings", open: true, section: id })}
              aria-current={section === id ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px]",
                section === id ? "bg-control text-ink" : "text-ink-secondary hover:bg-control/50 hover:text-ink",
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-[15px] font-semibold text-ink">
              {SECTIONS.find((s) => s.id === section)?.label}
            </span>
            <button
              onClick={() => dispatch({ type: "toggleAppSettings", open: false })}
              aria-label="Close settings"
              className="rounded-md p-1 text-ink-secondary hover:bg-control hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5">
            {section === "general" && (
              <>
                <Card title="Profile" subtitle="Shown in the sidebar. Saved as you go.">
                  <ProfileFields />
                </Card>
                <InlineInterAgentChatRow />
                <Card title="Skin" subtitle="Applies instantly and is remembered on this machine.">
                  <SkinPicker />
                </Card>
                <Card title="Channel turns" subtitle="Set one maximum duration for every bot turn in a channel.">
                  <RoomTurnTimeoutSettings />
                </Card>
                <ToolCallsRow />
                <ExperimentalFeaturesRow />
                <UpdatesRow />
                <DiagnosticsRow />
                <AnalyticsRow />
              </>
            )}

            {section === "lan" && <LanAccessSection />}

            {section === "connections" && (
              <Card
                title="Connections"
                subtitle="Connected apps work automatically in the installed app. Other optional service keys stay on this computer."
              >
                <div className="flex flex-col gap-4">
                  {state.config?.composio.mode === "managed" ? (
                    <div className="rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-[13px] text-success">
                      Connected apps service is ready
                    </div>
                  ) : null}
                  <TranscriptionSettings />
                  <ApiKeyRow section="box" />
                  <VpsConnection />
                  <ApiKeyRow section="opencodeGo" />
                  <details className="rounded-lg border border-hairline/40 bg-inset px-3 py-2">
                    <summary className="cursor-pointer text-[13px] text-ink-secondary">Self-host connected apps</summary>
                    <div className="mt-3">
                      <ApiKeyRow section="composio" />
                    </div>
                  </details>
                </div>
              </Card>
            )}

            {section === "engines" && (
              <Card title="Engine CLIs" subtitle="Which binary each engine runs. Saved as you go.">
                <EnginesSettings />
              </Card>
            )}

            {section === "companion" && <CompanionSection profileEmail={state.config?.profile?.email} />}

            {section === "voice" && <VoiceSettings />}

            {section === "computer" && <LocalComputerSection />}

            {section === "usage" && <UsageSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
