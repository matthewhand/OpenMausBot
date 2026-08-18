export type TtsProvider = "elevenlabs" | "openai-compatible";

/** Provider switch must not touch credentials. One shared `key` would either
 *  wipe ElevenLabs on the way to Kokoro or leak that key as Bearer. */
export function ttsProviderPatch(provider: TtsProvider): { provider: TtsProvider } {
  return { provider };
}

export function ttsElevenLabsKeyPatch(key: string): { key: string } {
  return { key: key.trim() };
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
