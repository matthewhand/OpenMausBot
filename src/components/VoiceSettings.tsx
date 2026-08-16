// Voice, in App Settings. One key, one voice list, one Try button.
//
// The voice list comes from the harness, which holds the key — the
// renderer never talks to ElevenLabs itself.
import { useEffect, useState } from "react";
import { Check, Loader2, Volume2 } from "lucide-react";

import { api, useStore, type ConfigStatus } from "@/state/store";
import { speaker } from "@/lib/tts";
import { cn } from "@/lib/cn";

const SAMPLE = "Morning. Overnight the tests went green, and I left two notes for you in the thread.";

export function VoiceSettings() {
  const { state, dispatch } = useStore();
  const tts = state.config?.tts;
  const stt = state.config?.stt;
  const platform = window.ogb?.platform || "other";

  const [key, setKey] = useState("");
  const [sttKey, setSttKey] = useState("");
  const [sttBaseUrl, setSttBaseUrl] = useState("");
  const [sttModel, setSttModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<Array<{ id: string; label: string; description?: string }>>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  const configured = Boolean(tts?.configured);
  const sttProvider = stt?.provider || (platform === "darwin" ? "apple-speech" : "none");

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
  }, [configured]);

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

  const saveSTT = (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    return api("/api/config", { method: "PUT", body: JSON.stringify({ stt: patch }) })
      .then((status: ConfigStatus) => {
        dispatch({ type: "configStatus", config: status });
        setSttKey("");
        setSttBaseUrl("");
        setSttModel("");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false));
  };

  if (!tts) return null;

  return (
    <div className="rounded-xl bg-card p-4">
      <div className="text-[15px] font-medium text-ink">Voice</div>
      <div className="mt-0.5 text-[13px] text-ink-secondary">
        Read replies aloud and talk to your bots, using your own ElevenLabs account. Billed per character by
        ElevenLabs.
      </div>

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
            onKeyDown={(e) => e.key === "Enter" && key.trim() && void save({ key: key.trim() })}
            placeholder={configured ? "••••••••  (paste to replace)" : "Paste your ElevenLabs API key"}
            aria-label="ElevenLabs key"
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
              onClick={() => void speaker.speak(SAMPLE)}
              disabled={!tts.ready}
              title={tts.ready ? "Hear this voice" : "Pick a voice first"}
              aria-label="Hear this voice"
              className="flex w-[72px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-raised py-2 text-[13px] text-ink hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Volume2 size={14} /> Try
            </button>
          </div>
        </div>
      )}

      {/* STT Configuration */}
      <div className="mt-6 border-t border-hairline/40 pt-6">
        <div className="text-[15px] font-medium text-ink">Speech-to-Text</div>
        <div className="mt-0.5 text-[13px] text-ink-secondary">
          Choose how call mode recognizes your voice. Apple Speech (macOS only) or OpenAI-compatible Whisper (all platforms).
        </div>

        <div className="mt-4">
          <div className="mb-1.5 text-[13px] text-ink-secondary">Provider</div>
          <select
            value={sttProvider}
            onChange={(e) => void saveSTT({ provider: e.target.value })}
            aria-label="STT Provider"
            className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink focus:border-hairline focus:outline-none"
          >
            {platform === "darwin" && (
              <option value="apple-speech">Apple Speech (macOS only, on-device)</option>
            )}
            <option value="openai-whisper">OpenAI-compatible Whisper (LiteLLM, faster-whisper, OpenAI)</option>
            <option value="none">None (calls disabled)</option>
          </select>
        </div>

        {sttProvider === "openai-whisper" && (
          <>
            <div className="mt-4">
              <div className="mb-1.5 flex items-center gap-2 text-[13px] text-ink-secondary">
                <span className={cn("size-1.5 rounded-full", stt?.ready ? "bg-success" : "bg-raised-hover")} />
                <span>Base URL</span>
                {stt?.ready && <span className="text-[11px] text-success">Configured</span>}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sttBaseUrl}
                  onChange={(e) => setSttBaseUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sttBaseUrl.trim() && void saveSTT({ baseUrl: sttBaseUrl.trim() })}
                  placeholder={stt?.baseUrl || "http://10.0.0.30:8000/v1 (LiteLLM) or http://127.0.0.1:9002/v1"}
                  aria-label="Whisper base URL"
                  autoComplete="off"
                  className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
                />
                <button
                  onClick={() => sttBaseUrl.trim() && void saveSTT({ baseUrl: sttBaseUrl.trim() })}
                  disabled={saving || !sttBaseUrl.trim()}
                  className="flex w-[72px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-raised py-2 text-[13px] text-ink hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <><Check size={13} />Save</>}
                </button>
              </div>
              <div className="mt-1.5 text-[11.5px] text-ink-secondary">
                Any OpenAI /v1/audio/transcriptions endpoint (LiteLLM, faster-whisper, OpenAI)
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 text-[13px] text-ink-secondary">API Key (optional)</div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={sttKey}
                  onChange={(e) => setSttKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sttKey.trim() && void saveSTT({ key: sttKey.trim() })}
                  placeholder="Optional — leave blank for local unauthenticated servers"
                  aria-label="Whisper API key"
                  autoComplete="off"
                  className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
                />
                <button
                  onClick={() => sttKey.trim() && void saveSTT({ key: sttKey.trim() })}
                  disabled={saving || !sttKey.trim()}
                  className="flex w-[72px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-raised py-2 text-[13px] text-ink hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <><Check size={13} />Save</>}
                </button>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 text-[13px] text-ink-secondary">Model</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sttModel}
                  onChange={(e) => setSttModel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sttModel.trim() && void saveSTT({ model: sttModel.trim() })}
                  placeholder={stt?.model || "whisper (LiteLLM) or whisper-1 (OpenAI)"}
                  aria-label="Whisper model"
                  autoComplete="off"
                  className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
                />
                <button
                  onClick={() => sttModel.trim() && void saveSTT({ model: sttModel.trim() })}
                  disabled={saving || !sttModel.trim()}
                  className="flex w-[72px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-raised py-2 text-[13px] text-ink hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <><Check size={13} />Save</>}
                </button>
              </div>
            </div>
          </>
        )}

        {sttProvider === "apple-speech" && platform !== "darwin" && (
          <div className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-[12px] text-warning">
            Apple Speech requires the macOS desktop app. Choose OpenAI-compatible Whisper for Windows/Linux.
          </div>
        )}
      </div>

      {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}
    </div>
  );
}
