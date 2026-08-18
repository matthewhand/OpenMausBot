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

/** OpenAI-compatible saves its own optional key. An empty field is omitted so
 *  a leftover ElevenLabs `key` (and a previously saved `openaiKey`) stay put. */
export function ttsOpenaiCredentialsPatch(
  baseUrl: string,
  key: string,
): { baseUrl: string; openaiKey?: string } {
  const patch: { baseUrl: string; openaiKey?: string } = { baseUrl: baseUrl.trim() };
  if (key.trim()) patch.openaiKey = key.trim();
  return patch;
}
