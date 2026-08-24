// Voice, wired to config. Routes to either ElevenLabs or an OpenAI-compatible
// provider based on config.provider. Defaults to ElevenLabs for backward
// compatibility with existing configs that have no provider field.
import type { AppConfig } from "../config.ts";
import * as elevenlabs from "./elevenlabs.ts";
import * as openaiCompatible from "./openai-compatible.ts";

export class NoVoiceConfigured extends Error {
  // a plain field rather than a constructor parameter property: the harness
  // runs under `node --experimental-strip-types`, which is strip-ONLY, so a
  // parameter property is rejected at load time even though it typechecks
  readonly reason: "key" | "voice" | "baseUrl";

  constructor(reason: "key" | "voice" | "baseUrl", provider?: string) {
    let msg: string;
    if (reason === "key") {
      msg = provider === "openai-compatible"
        ? "Add an API key in App Settings if your server requires one, or leave it empty for local servers."
        : "Add an ElevenLabs key in Settings on the computer to turn on voice.";
    } else if (reason === "baseUrl") {
      msg = "Add a base URL in App Settings for your OpenAI-compatible server.";
    } else {
      msg = "Pick a voice in the agent profile.";
    }
    super(msg);
    this.reason = reason;
  }
}

function getProvider(cfg: AppConfig): "elevenlabs" | "openai-compatible" {
  // Default to elevenlabs for backward compatibility with existing configs
  return cfg.tts?.provider ?? "elevenlabs";
}

export function voiceConfigured(cfg: AppConfig): boolean {
  const provider = getProvider(cfg);
  if (provider === "openai-compatible") {
    // OpenAI-compatible needs baseUrl and voice; key is optional
    return Boolean(cfg.tts?.baseUrl && cfg.tts?.voice);
  }
  // ElevenLabs needs key and voice
  return Boolean(cfg.tts?.key && cfg.tts?.voice);
}

/** A per-bot voice is a complete choice too; it should not be blocked just
 * because the app-wide fallback has not been selected yet. */
export function voiceReady(cfg: AppConfig, voiceId?: string): boolean {
  const provider = getProvider(cfg);
  if (provider === "openai-compatible") {
    return Boolean(cfg.tts?.baseUrl && (voiceId || cfg.tts?.voice));
  }
  return Boolean(cfg.tts?.key && (voiceId || cfg.tts?.voice));
}

/** What the settings panel needs. Never includes the key — same write-only
 * rule as every other credential. */
export function describeVoice(cfg: AppConfig) {
  const provider = getProvider(cfg);
  return {
    provider,
    configured: provider === "openai-compatible" ? Boolean(cfg.tts?.baseUrl) : Boolean(cfg.tts?.key),
    ready: voiceConfigured(cfg),
    voice: cfg.tts?.voice ?? "",
    baseUrl: cfg.tts?.baseUrl ?? "",
    model: cfg.tts?.model ?? "",
  };
}

export function verifyKey(key: string, provider: "elevenlabs" | "openai-compatible", baseUrl?: string, model?: string) {
  if (provider === "openai-compatible") {
    if (!baseUrl) {
      return Promise.resolve({ ok: false, message: "Base URL is required for OpenAI-compatible servers." } as const);
    }
    return openaiCompatible.verifyKey(baseUrl, key || undefined, model || undefined);
  }
  return elevenlabs.verifyKey(key);
}

export async function listVoices(cfg: AppConfig): Promise<elevenlabs.Voice[]> {
  const provider = getProvider(cfg);
  if (provider === "openai-compatible") {
    const baseUrl = cfg.tts?.baseUrl;
    if (!baseUrl) return [];
    return openaiCompatible.listVoices(baseUrl, cfg.tts?.key);
  }
  const key = cfg.tts?.key;
  if (!key) return [];
  return elevenlabs.listVoices(key);
}

/** Synthesize one utterance. Throws NoVoiceConfigured when there is nothing
 * to speak with, which the route turns into a 409 the client can explain. */
export function speak(cfg: AppConfig, text: string, voiceId?: string) {
  const provider = getProvider(cfg);

  if (provider === "openai-compatible") {
    const baseUrl = cfg.tts?.baseUrl;
    if (!baseUrl) throw new NoVoiceConfigured("baseUrl", provider);
    const voice = voiceId || cfg.tts?.voice;
    if (!voice) throw new NoVoiceConfigured("voice", provider);
    return openaiCompatible.synthesize(text, voice, baseUrl, cfg.tts?.key, cfg.tts?.model);
  }

  // ElevenLabs: check key first, then voice (matches the original behavior)
  const key = cfg.tts?.key;
  if (!key) throw new NoVoiceConfigured("key", provider);
  const voice = voiceId || cfg.tts?.voice;
  if (!voice) throw new NoVoiceConfigured("voice", provider);
  return elevenlabs.synthesize(text, voice, key);
}

export type { Voice } from "./elevenlabs.ts";
