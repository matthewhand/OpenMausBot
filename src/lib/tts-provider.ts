export type TtsProvider = "elevenlabs" | "system" | "openai-compatible";

/** Provider switch must not touch credentials. One shared `key` would either
 *  wipe ElevenLabs on the way to Kokoro or leak that key as Bearer. */
export function ttsProviderPatch(provider: TtsProvider): { provider: TtsProvider } {
  return { provider };
}

export function ttsElevenLabsKeyPatch(key: string): { key: string } {
  return { key: key.trim() };
}

/** Voice ids are per provider. Switching to Kokoro must not send an
 * ElevenLabs id, and the reverse must not send `openaiVoice` as `voice`. */
export function ttsVoicePatch(
  provider: TtsProvider,
  voiceId: string,
): { voice: string } | { openaiVoice: string } {
  const id = voiceId.trim();
  return provider === "openai-compatible" ? { openaiVoice: id } : { voice: id };
}

export function ttsActiveVoice(
  provider: TtsProvider,
  tts?: { voice?: string; openaiVoice?: string } | null,
): string {
  if (provider === "openai-compatible") return tts?.openaiVoice ?? "";
  return tts?.voice ?? "";
}

/** Per-bot override for the active provider. Empty = inherit app default.
 *  An ElevenLabs leftover on `bot.voice` is not used for Kokoro. */
export function botVoiceId(
  provider: TtsProvider | string | undefined,
  bot?: { voice?: string; openaiVoice?: string } | null,
): string | undefined {
  const id = provider === "openai-compatible" ? bot?.openaiVoice : bot?.voice;
  return id?.trim() || undefined;
}

export function botVoicePatch(
  provider: TtsProvider,
  voiceId: string,
): { voice: string } | { openaiVoice: string } {
  return provider === "openai-compatible" ? { openaiVoice: voiceId } : { voice: voiceId };
}

/** OpenAI-compatible saves its own optional key. An empty field is omitted so
 *  a leftover ElevenLabs `key` (and a previously saved `openaiKey`) stay put.
 *  Pass `clearKey` to persist `openaiKey: ""` and drop the saved key. */
export function ttsOpenaiCredentialsPatch(
  baseUrl: string,
  key: string,
  opts?: { clearKey?: boolean },
): { baseUrl: string; openaiKey?: string } {
  const patch: { baseUrl: string; openaiKey?: string } = { baseUrl: baseUrl.trim() };
  if (opts?.clearKey) patch.openaiKey = "";
  else if (key.trim()) patch.openaiKey = key.trim();
  return patch;
}

export function ttsOpenaiModelPatch(model: string): { openaiModel: string } {
  return { openaiModel: model.trim() };
}
