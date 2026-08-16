// Voice, in App Settings. Supports ElevenLabs and OpenAI-compatible providers.
//
// The voice list comes from the harness, which holds the key — the
// renderer never talks to voice providers itself.
import { useEffect, useState } from "react";
import { Check, Loader2, Volume2 } from "lucide-react";

import { api, useStore, type ConfigStatus } from "@/state/store";
import { speaker } from "@/lib/tts";
import { cn } from "@/lib/cn";
import { Card } from "./SettingsPrimitives";

const SAMPLE = "Morning. Overnight the tests went green, and I left two notes for you in the thread.";

export function VoiceSettings() {
  const { state, dispatch } = useStore();
  const tts = state.config?.tts;

  const [provider, setProvider] = useState<"elevenlabs" | "openai">(tts?.provider || "elevenlabs");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(tts?.baseUrl || "http://127.0.0.1:9093/v1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<Array<{ id: string; label: string; description?: string }>>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  const configured = Boolean(tts?.configured);

  // Sync provider from server state
  useEffect(() => {
    if (tts?.provider) setProvider(tts.provider);
    if (tts?.baseUrl) setBaseUrl(tts.baseUrl);
  }, [tts?.provider, tts?.baseUrl]);

  useEffect(() => {
    if (!configured || provider === "openai") {
      setVoices([]);
      return;
    }
    let alive = true;
    setLoadingVoices(true);
    api("/api/tts/voices")
      .then((r: { voices?: typeof voices; error?: string }) => {
        if (!alive) return;
        setVoices(r.voices ?? []);
        if (r.error) setError(r.error);
      })
      .catch(() => alive && setVoices([]))
      .finally(() => alive && setLoadingVoices(false));
    return () => {
      alive = false;
    };
  }, [configured, provider]);

  const save = (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    return api("/api/config", { method: "PUT", body: JSON.stringify({ tts: patch }) })
      .then((status: ConfigStatus) => {
        dispatch({ type: "configStatus", config: status });
        setKey("");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false));
  };

  if (!tts) return null;

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Voice Provider"
        subtitle="Choose between ElevenLabs or a local OpenAI-compatible TTS server"
      >
        <select
          value={provider}
          onChange={(e) => {
            const newProvider = e.target.value as "elevenlabs" | "openai";
            setProvider(newProvider);
            void save({ provider: newProvider });
          }}
          className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink focus:border-hairline focus:outline-none"
        >
          <option value="elevenlabs">ElevenLabs (cloud)</option>
          <option value="openai">OpenAI-compatible (local)</option>
        </select>
        <p className="mt-2 text-[11px] text-ink-secondary">
          {provider === "elevenlabs"
            ? "Uses ElevenLabs cloud API. Requires API key (billed per character)."
            : "Uses local TTS server with OpenAI-compatible API (e.g., Piper, Coqui)."}
        </p>
      </Card>

      {provider === "openai" && (
        <Card title="Base URL" subtitle="OpenAI-compatible TTS endpoint">
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onBlur={() => void save({ baseUrl: baseUrl.trim() })}
              placeholder="http://127.0.0.1:9093/v1"
              className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
            />
            <p className="text-[11px] text-ink-secondary">
              Default: http://127.0.0.1:9093/v1 (compatible with Piper, Coqui, etc.)
            </p>
          </div>
        </Card>
      )}

      <Card
        title={provider === "elevenlabs" ? "ElevenLabs API Key" : "API Key (Optional)"}
        subtitle={
          provider === "elevenlabs"
            ? "Required for ElevenLabs voice synthesis"
            : "Optional for local servers that don't require authentication"
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[13px] text-ink-secondary">
            <span className={cn("size-1.5 rounded-full", configured ? "bg-success" : "bg-raised-hover")} />
            <span>{provider === "elevenlabs" ? "ElevenLabs key" : "API key"}</span>
            {configured && <span className="text-[11px] text-success">Connected</span>}
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && key.trim() && void save({ key: key.trim() })}
              placeholder={
                configured
                  ? "••••••••  (paste to replace)"
                  : provider === "elevenlabs"
                    ? "Paste your ElevenLabs API key"
                    : "Optional API key"
              }
              aria-label="API key"
              autoComplete="off"
              className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
            />
            <button
              onClick={() => key.trim() && void save({ key: key.trim() })}
              disabled={saving || !key.trim()}
              className="flex w-[72px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-raised py-2 text-[13px] text-ink hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <><Check size={13} />Save</>}
            </button>
          </div>
          {!configured && provider === "elevenlabs" && (
            <a
              href="https://elevenlabs.io/app/settings/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[12px] font-medium text-accent hover:underline"
            >
              Get a key from ElevenLabs
            </a>
          )}
        </div>
      </Card>

      {provider === "elevenlabs" && configured && (
        <Card title="Voice" subtitle="Select an ElevenLabs voice">
          <div className="flex gap-2">
            <select
              value={tts.voice}
              onChange={(e) => void save({ voice: e.target.value })}
              aria-label="Voice"
              className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink focus:border-hairline focus:outline-none"
            >
              <option value="">{loadingVoices ? "Loading voices…" : "Pick a voice"}</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                  {v.description ? ` — ${v.description}` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => void speaker.speak(SAMPLE)}
              disabled={!tts.ready}
              title={tts.ready ? "Hear this voice" : "Pick a voice first"}
              aria-label="Hear this voice"
              className="flex w-[72px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-raised py-2 text-[13px] text-ink hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Volume2 size={14} /> Try
            </button>
          </div>
        </Card>
      )}

      {provider === "openai" && (
        <Card title="Voice Name" subtitle="Voice identifier for your TTS server">
          <input
            type="text"
            value={tts.voice}
            onChange={(e) => void save({ voice: e.target.value })}
            placeholder="alloy"
            className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
          />
          <p className="mt-2 text-[11px] text-ink-secondary">
            Common voices: alloy, echo, fable, onyx, nova, shimmer (depends on your TTS server)
          </p>
        </Card>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-[13px] text-red-500">{error}</p>
        </div>
      )}
    </div>
  );
}
