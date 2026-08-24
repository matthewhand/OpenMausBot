// Voice, in App Settings. One key, one voice list, one Try button.
//
// The voice list comes from the harness, which holds the key — the
// renderer never talks to ElevenLabs itself.
import { useEffect, useState } from "react";
import { Check, Loader2, Volume2 } from "lucide-react";

import { api, useStore, type ConfigStatus } from "@/state/store";
import { speaker, SAMPLE } from "@/lib/tts";
import { cn } from "@/lib/cn";

export function VoiceSettings() {
  const { state, dispatch } = useStore();
  const tts = state.config?.tts;

  const [provider, setProvider] = useState<"elevenlabs" | "openai-compatible">(
    (tts?.provider as "elevenlabs" | "openai-compatible") ?? "elevenlabs",
  );
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(tts?.baseUrl ?? "");
  const [model, setModel] = useState(tts?.model ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<Array<{ id: string; label: string; description?: string }>>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [auditioningVoiceId, setAuditioningVoiceId] = useState<string | null>(null);

  const configured = Boolean(tts?.configured);

  useEffect(() => {
    return speaker.subscribe((s) => {
      if (s.status === "idle") {
        setAuditioningVoiceId(null);
      }
      if (s.error) {
        setError(s.error);
      }
    });
  }, []);

  const handleAudition = async (voiceId?: string) => {
    const target = voiceId || tts?.voice;
    if (!target) return;
    setAuditioningVoiceId(target);
    setError(null);
    try {
      await speaker.speak(SAMPLE, target);
      if (speaker.state.error) {
        setError(speaker.state.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuditioningVoiceId(null);
    }
  };

  // Update local provider state when config changes
  useEffect(() => {
    if (tts?.provider) {
      setProvider(tts.provider as "elevenlabs" | "openai-compatible");
    }
    if (tts?.baseUrl !== undefined) setBaseUrl(tts.baseUrl);
    if (tts?.model !== undefined) setModel(tts.model);
  }, [tts?.provider, tts?.baseUrl, tts?.model]);

  useEffect(() => {
    if (!configured) {
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
  }, [configured, tts?.baseUrl, tts?.model, tts?.provider]);

  const save = (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    return api("/api/config", { method: "PUT", body: JSON.stringify({ tts: patch }) })
      .then((status: ConfigStatus) => {
        dispatch({ type: "configStatus", config: status });
        setKey("");
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2500);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false));
  };

  if (!tts) return null;

  const saveProvider = (newProvider: "elevenlabs" | "openai-compatible") => {
    setProvider(newProvider);
    setError(null);
    void save(newProvider === "openai-compatible" ? { provider: newProvider, key: "" } : { provider: newProvider });
  };

  const saveCredentials = () => {
    if (provider === "openai-compatible") {
      const trimmedUrl = (baseUrl || tts.baseUrl || "").trim();
      if (!trimmedUrl) {
        setError("Base URL is required for OpenAI-compatible servers.");
        return;
      }
      const patch: Record<string, unknown> = {
        baseUrl: trimmedUrl,
        model: model.trim() || undefined,
      };
      if (key.trim()) {
        patch.key = key.trim();
      }
      void save(patch);
    } else {
      if (!key.trim()) {
        setError("ElevenLabs key is required.");
        return;
      }
      void save({ key: key.trim() });
    }
  };

  return (
    <div className="rounded-xl bg-card p-4">
      <div className="text-[15px] font-medium text-ink">Voice</div>
      <div className="mt-0.5 text-[13px] text-ink-secondary">
        Read replies aloud and talk to your bots. Choose your TTS provider below.
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-[13px] text-ink-secondary">Provider</div>
        <select
          value={provider}
          onChange={(e) => saveProvider(e.target.value as "elevenlabs" | "openai-compatible")}
          aria-label="TTS Provider"
          className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink focus:border-hairline focus:outline-none"
        >
          <option value="elevenlabs">ElevenLabs</option>
          <option value="openai-compatible">OpenAI-compatible</option>
        </select>
      </div>

      {provider === "elevenlabs" && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center gap-2 text-[13px] text-ink-secondary">
            <span className={cn("size-1.5 rounded-full", configured ? "bg-success" : "bg-raised-hover")} />
            <span>ElevenLabs key</span>
            {configured && <span className="text-[11px] text-success">Connected</span>}
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && key.trim() && saveCredentials()}
              placeholder={configured ? "••••••••  (paste to replace)" : "Paste your ElevenLabs API key"}
              aria-label="ElevenLabs key"
              autoComplete="off"
              className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
            />
            <button
              onClick={saveCredentials}
              disabled={saving || !key.trim()}
              className="flex w-[72px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-raised py-2 text-[13px] text-ink hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <><Check size={13} />Save</>}
            </button>
          </div>
          {!configured && (
            <a
              href="https://elevenlabs.io/app/settings/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block text-[12px] font-medium text-accent hover:underline"
            >
              Get a key from ElevenLabs
            </a>
          )}
        </div>
      )}

      {provider === "openai-compatible" && (
        <div className="space-y-4">
          <div className="mt-4">
            <div className="mb-1.5 flex items-center gap-2 text-[13px] text-ink-secondary">
              <span className={cn("size-1.5 rounded-full", configured ? "bg-success" : "bg-raised-hover")} />
              <span>Base URL</span>
              {configured && <span className="text-[11px] text-success">Connected</span>}
            </div>
            <input
              type="text"
              value={baseUrl || tts.baseUrl || ""}
              onChange={(e) => setBaseUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveCredentials()}
              placeholder="http://127.0.0.1:8000/v1"
              aria-label="Base URL"
              autoComplete="off"
              className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
            />
            <div className="mt-1.5 text-[12px] text-ink-secondary">
              OpenAI-compatible speech API endpoint URL.
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[13px] text-ink-secondary">Model (optional)</div>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveCredentials()}
              placeholder="tts-1"
              aria-label="Model"
              autoComplete="off"
              className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1.5 text-[13px] text-ink-secondary">API Key (optional)</div>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveCredentials()}
              placeholder={configured ? "••••••••  (optional for local servers)" : "Optional for local servers"}
              aria-label="API Key"
              autoComplete="off"
              className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[12px] text-success">
              {saved ? "Voice settings saved" : ""}
            </span>
            <button
              onClick={saveCredentials}
              disabled={saving || !baseUrl.trim()}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-raised px-4 py-2 text-[13px] text-ink hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <><Check size={13} />Save server settings</>}
            </button>
          </div>
        </div>
      )}

      {configured && (
        <div className="mt-4">
          <div className="mb-1.5 text-[13px] text-ink-secondary">Voice</div>
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
              onClick={() => void handleAudition()}
              disabled={!tts.ready || auditioningVoiceId !== null}
              title={tts.ready ? "Hear this voice" : "Pick a voice first"}
              aria-label="Hear this voice"
              className="flex w-[72px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-raised py-2 text-[13px] text-ink hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {auditioningVoiceId ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />} Try
            </button>
          </div>
        </div>
      )}

      {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}
    </div>
  );
}
