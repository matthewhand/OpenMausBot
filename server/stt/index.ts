// Speech-to-text, wired to config. Supports Apple Speech (macOS only, handled
// by the Electron main process) or OpenAI-compatible Whisper (cross-platform).
// This file is only the part that reads config and decides which STT provider
// to use; the actual Whisper API calls live in whisper.ts.
import type { AppConfig } from "../config.ts";
import * as whisper from "./whisper.ts";

export class NoSTTConfigured extends Error {
  readonly reason: "provider" | "baseUrl";

  constructor(reason: "provider" | "baseUrl") {
    super(
      reason === "provider"
        ? "Select a speech-to-text provider in App Settings to enable calls."
        : "Configure the Whisper base URL in App Settings to use OpenAI-compatible STT.",
    );
    this.reason = reason;
  }
}

/**
 * Get the effective STT provider for the given config and platform.
 * Returns the provider to use, or "none" if STT is not available.
 */
export function sttProvider(cfg: AppConfig, platform: string = process.platform): string {
  const configuredProvider = cfg.stt?.provider;

  // Explicit provider selection takes precedence
  if (configuredProvider) {
    if (configuredProvider === "openai-whisper") {
      return cfg.stt?.baseUrl ? "openai-whisper" : "none";
    }
    if (configuredProvider === "apple-speech") {
      return platform === "darwin" ? "apple-speech" : "none";
    }
    return "none";
  }

  // Default: Apple Speech on macOS if nothing is configured
  if (platform === "darwin") {
    return "apple-speech";
  }

  // Default: OpenAI-compatible Whisper if baseUrl is set
  if (cfg.stt?.baseUrl) {
    return "openai-whisper";
  }

  return "none";
}

/**
 * Check if STT is configured and ready for the given platform.
 */
export function sttReady(cfg: AppConfig, platform: string = process.platform): boolean {
  const provider = sttProvider(cfg, platform);
  return provider !== "none";
}

/**
 * What the settings panel needs. Never includes secrets — same write-only
 * rule as other credentials.
 */
export function describeSTT(cfg: AppConfig, platform: string = process.platform) {
  const provider = sttProvider(cfg, platform);
  return {
    provider: cfg.stt?.provider ?? (platform === "darwin" ? "apple-speech" : "none"),
    available: provider !== "none",
    ready: sttReady(cfg, platform),
    baseUrl: cfg.stt?.baseUrl ?? "",
    model: cfg.stt?.model ?? "whisper",
  };
}

/**
 * Transcribe audio using the configured STT provider.
 * Apple Speech is handled by the Electron main process, so this only handles
 * OpenAI-compatible Whisper.
 *
 * @param cfg - App configuration
 * @param audio - Audio buffer
 * @param platform - Current platform (for testing)
 * @returns The transcript text
 */
export async function transcribe(
  cfg: AppConfig,
  audio: Buffer,
  platform: string = process.platform,
): Promise<string> {
  const provider = sttProvider(cfg, platform);

  if (provider === "none") {
    throw new NoSTTConfigured("provider");
  }

  if (provider === "apple-speech") {
    // Apple Speech is handled by the Electron main process via IPC.
    // This should never be called for Apple Speech.
    throw new Error("Apple Speech transcription is handled by the Electron main process, not the harness");
  }

  if (provider === "openai-whisper") {
    const baseUrl = cfg.stt?.baseUrl;
    if (!baseUrl) {
      throw new NoSTTConfigured("baseUrl");
    }

    const result = await whisper.transcribe(audio, {
      baseUrl,
      key: cfg.stt?.key,
      model: cfg.stt?.model || "whisper",
    });

    return result.text;
  }

  throw new Error(`Unknown STT provider: ${provider}`);
}

/**
 * Verify the Whisper connection without transcribing audio.
 */
export async function verifyWhisperConnection(cfg: AppConfig): Promise<boolean> {
  const baseUrl = cfg.stt?.baseUrl;
  if (!baseUrl) return false;

  return whisper.verifyConnection({
    baseUrl,
    key: cfg.stt?.key,
    model: cfg.stt?.model || "whisper",
  });
}

export type { TranscriptResult } from "./whisper.ts";
