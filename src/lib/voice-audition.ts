import { speaker, type Speaker } from "@/lib/tts";

export const VOICE_SAMPLE_TEXT =
  "Morning. Overnight the tests went green, and I left two notes for you in the thread.";
export const SAMPLE = VOICE_SAMPLE_TEXT;

export interface AuditionVoiceOptions {
  sampleText?: string;
  speaker?: Pick<Speaker, "speak">;
}

/**
 * Audition / preview a voice using the given voice ID and sample text.
 * Passes the voice ID to speaker.speak(SAMPLE, voiceId).
 */
export async function auditionVoice(
  voiceId?: string,
  options?: AuditionVoiceOptions | string,
): Promise<void> {
  const text = typeof options === "string" ? options : (options?.sampleText ?? VOICE_SAMPLE_TEXT);
  const targetSpeaker =
    typeof options === "object" && options?.speaker ? options.speaker : speaker;

  if (voiceId) {
    return targetSpeaker.speak(text, voiceId);
  }
  return targetSpeaker.speak(text);
}
