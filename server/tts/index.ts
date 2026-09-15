// Voice, wired to config. Four engines live behind this file: ElevenLabs
// (elevenlabs.ts, needs a key), the Mac's built-in voices
// (system-voices.ts, no key), a local Chatterbox server
// (chatterbox.ts, an address instead of a key), and any OpenAI-compatible
// server (openai-compatible.ts, e.g. Kokoro-FastAPI or LiteLLM — an
// address, an optional key, and a model id). This file is only the part
// that reads ~/.openmausbot/config.json, picks the engine, and decides
// whether there is a voice at all.
import type { AppConfig } from "../config.ts";
import * as chatterbox from "./chatterbox.ts";
import * as elevenlabs from "./elevenlabs.ts";
import * as openaiCompatible from "./openai-compatible.ts";
import * as systemVoices from "./system-voices.ts";

export type VoiceProvider = "elevenlabs" | "system" | "chatterbox" | "openai-compatible";

export class NoVoiceConfigured extends Error {
  // a plain field rather than a constructor parameter property: the harness
  // runs under `node --experimental-strip-types`, which is strip-ONLY, so a
  // parameter property is rejected at load time even though it typechecks
  readonly reason: "key" | "voice";

  constructor(reason: "key" | "voice", hint?: string) {
    super(
      hint ??
        (reason === "key"
          ? "Add an ElevenLabs key in Settings on the computer to turn on voice."
          : "Pick a voice in the agent profile."),
    );
    this.reason = reason;
  }
}

export function voiceProvider(cfg: AppConfig): VoiceProvider {
  const selected = cfg.tts?.provider;
  return selected === "system" || selected === "chatterbox" || selected === "openai-compatible"
    ? selected
    : "elevenlabs";
}

/** Server-address engines (Chatterbox and generic OpenAI-compatible) share
 * one readiness shape: an address is required, a key never is. */
function serverAddress(cfg: AppConfig): string {
  return cfg.tts?.baseUrl?.trim() ?? "";
}

/** The system provider needs no credential — it is only ever offered where
 * the platform actually has it, so "configured" means "this engine can
 * speak", not "a key is on file". */
export function providerConfigured(cfg: AppConfig): boolean {
  const provider = voiceProvider(cfg);
  if (provider === "system") return systemVoices.systemVoicesAvailable();
  if (provider === "chatterbox" || provider === "openai-compatible") return Boolean(serverAddress(cfg));
  return Boolean(cfg.tts?.key);
}

export function voiceConfigured(cfg: AppConfig): boolean {
  const provider = voiceProvider(cfg);
  if (provider === "system") {
    return systemVoices.systemVoicesAvailable() && Boolean(cfg.tts?.voice);
  }
  if (provider === "chatterbox" || provider === "openai-compatible") {
    return Boolean(serverAddress(cfg) && cfg.tts?.voice);
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
  if (provider === "chatterbox" || provider === "openai-compatible") {
    return Boolean(serverAddress(cfg) && (voiceId || cfg.tts?.voice));
  }
  return Boolean(cfg.tts?.key && (voiceId || cfg.tts?.voice));
}

/** What the settings panel needs. Never includes the key — same write-only
 * rule as every other credential. baseUrl and model are server settings,
 * not credentials, so they come back in full. */
export function describeVoice(cfg: AppConfig) {
  const provider = voiceProvider(cfg);
  const serverProvider = provider === "chatterbox" || provider === "openai-compatible";
  return {
    configured: providerConfigured(cfg),
    ready: voiceConfigured(cfg),
    voice: cfg.tts?.voice ?? "",
    provider,
    baseUrl: serverProvider ? (cfg.tts?.baseUrl ?? "") : "",
    model: serverProvider ? (cfg.tts?.model ?? "") : "",
  };
}

export function verifyKey(key: string) {
  return elevenlabs.verifyKey(key);
}

/** Verify a server-address engine before saving: a cheap speech probe
 * against endpoints that may not expose a models/voices route. */
export function verifyServer(baseUrl: string, key?: string, model?: string) {
  return openaiCompatible.verifyKey(baseUrl, key, model || "tts-1");
}

export async function listVoices(cfg: AppConfig, run?: systemVoices.Runner): Promise<elevenlabs.Voice[]> {
  const provider = voiceProvider(cfg);
  if (provider === "system") return systemVoices.listSystemVoices(run);
  if (provider === "chatterbox") {
    const baseUrl = serverAddress(cfg);
    return baseUrl ? chatterbox.listChatterboxVoices(baseUrl) : [];
  }
  if (provider === "openai-compatible") {
    const baseUrl = serverAddress(cfg);
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
  if (provider === "chatterbox") {
    const baseUrl = serverAddress(cfg);
    if (!baseUrl) {
      throw new NoVoiceConfigured(
        "key",
        "Add the address of your Chatterbox server in Settings on the computer to turn on voice.",
      );
    }
    const voice = voiceId || cfg.tts?.voice;
    if (!voice) throw new NoVoiceConfigured("voice");
    return chatterbox.synthesizeChatterbox(text, voice, baseUrl, cfg.tts?.model);
  }
  if (provider === "openai-compatible") {
    const baseUrl = serverAddress(cfg);
    if (!baseUrl) {
      throw new NoVoiceConfigured(
        "key",
        "Add the address of your OpenAI-compatible server in Settings on the computer to turn on voice.",
      );
    }
    const voice = voiceId || cfg.tts?.voice;
    if (!voice) throw new NoVoiceConfigured("voice");
    return openaiCompatible.synthesize(text, voice, baseUrl, cfg.tts?.key, cfg.tts?.model || "tts-1");
  }
  const key = cfg.tts?.key;
  if (!key) throw new NoVoiceConfigured("key");
  const voice = voiceId || cfg.tts?.voice;
  if (!voice) throw new NoVoiceConfigured("voice");
  return elevenlabs.synthesize(text, voice, key);
}

export type { Voice } from "./elevenlabs.ts";
