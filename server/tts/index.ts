// Voice, wired to config. Three engines live behind this file: ElevenLabs
// (elevenlabs.ts, needs a key), the Mac's built-in voices (system-voices.ts,
// no key), and OpenAI-compatible servers (openai-compatible.ts, needs a
// base URL; key optional). This file is only the part that reads
// ~/.openmausbot/config.json, picks the engine, and decides whether there
// is a voice at all.
import type { AppConfig } from "../config.ts";
import * as elevenlabs from "./elevenlabs.ts";
import * as openaiCompatible from "./openai-compatible.ts";
import * as systemVoices from "./system-voices.ts";

export type VoiceProvider = "elevenlabs" | "system" | "openai-compatible";

export class NoVoiceConfigured extends Error {
  // a plain field rather than a constructor parameter property: the harness
  // runs under `node --experimental-strip-types`, which is strip-ONLY, so a
  // parameter property is rejected at load time even though it typechecks
  readonly reason: "key" | "voice" | "baseUrl";

  constructor(reason: "key" | "voice" | "baseUrl", provider?: string) {
    let msg: string;
    if (reason === "key") {
      msg =
        provider === "openai-compatible"
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

export function voiceProvider(cfg: AppConfig): VoiceProvider {
  if (cfg.tts?.provider === "system") return "system";
  if (cfg.tts?.provider === "openai-compatible") return "openai-compatible";
  return "elevenlabs";
}

/** The system provider needs no credential — it is only ever offered where
 * the platform actually has it, so "configured" means "this engine can
 * speak", not "a key is on file". OpenAI-compatible needs a base URL; the
 * key is optional for local unauthenticated servers like Kokoro. */
export function providerConfigured(cfg: AppConfig): boolean {
  const provider = voiceProvider(cfg);
  if (provider === "system") return systemVoices.systemVoicesAvailable();
  if (provider === "openai-compatible") return Boolean(cfg.tts?.baseUrl);
  return Boolean(cfg.tts?.key);
}

export function voiceConfigured(cfg: AppConfig): boolean {
  const provider = voiceProvider(cfg);
  if (provider === "system") {
    return systemVoices.systemVoicesAvailable() && Boolean(cfg.tts?.voice);
  }
  if (provider === "openai-compatible") {
    // OpenAI-compatible needs baseUrl and voice; key is optional
    return Boolean(cfg.tts?.baseUrl && cfg.tts?.voice);
  }
  return Boolean(cfg.tts?.key && cfg.tts?.voice);
}

/** A per-bot voice is a complete choice too; it should not be blocked just
 * because the app-wide fallback has not been selected yet. */
export function voiceReady(cfg: AppConfig, voiceId?: string): boolean {
  const provider = voiceProvider(cfg);
  if (provider === "system") {
    return systemVoices.systemVoicesAvailable() && Boolean(voiceId || cfg.tts?.voice);
  }
  if (provider === "openai-compatible") {
    return Boolean(cfg.tts?.baseUrl && (voiceId || cfg.tts?.voice));
  }
  return Boolean(cfg.tts?.key && (voiceId || cfg.tts?.voice));
}

/** What the settings panel needs. Never includes the key — same write-only
 * rule as every other credential. */
export function describeVoice(cfg: AppConfig) {
  const provider = voiceProvider(cfg);
  return {
    configured: providerConfigured(cfg),
    ready: voiceConfigured(cfg),
    voice: cfg.tts?.voice ?? "",
    provider,
    baseUrl: cfg.tts?.baseUrl ?? "",
  };
}

export function verifyKey(key: string, provider?: "elevenlabs" | "openai-compatible", baseUrl?: string) {
  if (provider === "openai-compatible") {
    if (!baseUrl) {
      return Promise.resolve({ ok: false, message: "Base URL is required for OpenAI-compatible servers." } as const);
    }
    return openaiCompatible.verifyKey(baseUrl, key || undefined);
  }
  return elevenlabs.verifyKey(key);
}

export async function listVoices(cfg: AppConfig, run?: systemVoices.Runner): Promise<elevenlabs.Voice[]> {
  const provider = voiceProvider(cfg);
  if (provider === "system") return systemVoices.listSystemVoices(run);
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
export function speak(cfg: AppConfig, text: string, voiceId?: string, run?: systemVoices.Runner) {
  const provider = voiceProvider(cfg);

  if (provider === "system") {
    const voice = voiceId || cfg.tts?.voice;
    // An injected runner is the cross-platform test seam for `/usr/bin/say`;
    // production calls omit it and remain strictly Darwin-gated.
    if (!systemVoices.systemVoicesAvailable() && !run) throw new NoVoiceConfigured("key");
    if (!voice) throw new NoVoiceConfigured("voice");
    return systemVoices.synthesizeSystem(text, voice, run);
  }

  if (provider === "openai-compatible") {
    const baseUrl = cfg.tts?.baseUrl;
    if (!baseUrl) throw new NoVoiceConfigured("baseUrl", provider);
    const voice = voiceId || cfg.tts?.voice;
    if (!voice) throw new NoVoiceConfigured("voice", provider);
    return openaiCompatible.synthesize(text, voice, baseUrl, cfg.tts?.key);
  }

  // ElevenLabs: check key first, then voice (matches the original behavior)
  const key = cfg.tts?.key;
  if (!key) throw new NoVoiceConfigured("key", provider);
  const voice = voiceId || cfg.tts?.voice;
  if (!voice) throw new NoVoiceConfigured("voice", provider);
  return elevenlabs.synthesize(text, voice, key);
}

export type { Voice } from "./elevenlabs.ts";
