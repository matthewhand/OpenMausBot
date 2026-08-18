// OpenAI-compatible TTS — supports Kokoro-FastAPI, LiteLLM, and any server
// that implements the OpenAI /v1/audio/speech API. The key is optional
// (local unauthenticated servers like Kokoro need none).

export interface Voice {
  id: string;
  label: string;
  description?: string;
}

export interface Audio {
  bytes: Uint8Array;
  mime: string;
}

export type VerifyResult = { ok: true } | { ok: false; message: string };

export interface SpeechOpts {
  model?: string;
  voice?: string;
}

const DEFAULT_MODEL = "tts-1";
const DEFAULT_VOICE = "alloy";

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function message(status: number, what: string, body: any): string {
  const theirs =
    (typeof body?.error?.message === "string" && body.error.message.trim()) ||
    (typeof body?.detail === "string" && body.detail.trim()) ||
    (typeof body?.message === "string" && body.message.trim()) ||
    "";
  if (status === 401 || status === 403) {
    return "The OpenAI-compatible server rejected that key. Check the key and try again.";
  }
  if (status === 429) return theirs || "The server is rate-limiting this request — wait a moment and try again.";
  return theirs ? `${what} failed: ${theirs}` : `${what} failed (${status})`;
}

function authHeader(key?: string): Record<string, string> {
  return key ? { authorization: `Bearer ${key}` } : {};
}

function speechPayload(input: string, opts?: SpeechOpts) {
  return {
    model: opts?.model?.trim() || DEFAULT_MODEL,
    input,
    voice: opts?.voice?.trim() || DEFAULT_VOICE,
    response_format: "mp3" as const,
  };
}

function rootUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

/** Verify the server is reachable and the key (if provided) works. Same
 * payload as speak so a saved model/voice is what we probe — not a dummy
 * alloy ping unless that is the saved or default voice. */
export async function verifyKey(baseUrl: string, key?: string, opts?: SpeechOpts): Promise<VerifyResult> {
  try {
    const url = `${rootUrl(baseUrl)}/audio/speech`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader(key) },
      body: JSON.stringify(speechPayload("test", opts)),
      signal: AbortSignal.timeout(20_000),
    });
    // 200 = success. 400 = server understood the route but rejected params
    // (reachable). 5xx / anything else is a real failure.
    if (res.ok || res.status === 400) return { ok: true };
    return { ok: false, message: message(res.status, "checking that server", await safeJson(res)) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("aborted")) {
      return { ok: false, message: "Couldn't reach the server — check the URL and your connection." };
    }
    return { ok: false, message: `Couldn't reach the server: ${msg}` };
  }
}

function parseVoiceList(body: any): Voice[] {
  const list = Array.isArray(body) ? body : body?.voices ?? [];
  if (!Array.isArray(list)) return [];
  return list
    .map((v: any): Voice => ({
      id: String(v.voice_id ?? v.id ?? ""),
      label: String(v.name ?? v.label ?? v.id ?? "Voice"),
      description: v.description || v.labels?.description || undefined,
    }))
    .filter((v: Voice) => v.id);
}

async function fetchVoices(url: string, key?: string): Promise<Voice[] | null> {
  try {
    const res = await fetch(url, {
      headers: authHeader(key),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const parsed = parseVoiceList(await safeJson(res));
    return parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

function looksLikeOpenAi(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "api.openai.com" || host.endsWith(".api.openai.com");
  } catch {
    return /api\.openai\.com/i.test(baseUrl);
  }
}

const OPENAI_VOICES: Voice[] = [
  { id: "alloy", label: "Alloy" },
  { id: "echo", label: "Echo" },
  { id: "fable", label: "Fable" },
  { id: "onyx", label: "Onyx" },
  { id: "nova", label: "Nova" },
  { id: "shimmer", label: "Shimmer" },
  { id: "ash", label: "Ash" },
  { id: "coral", label: "Coral" },
  { id: "sage", label: "Sage" },
];

/** Fallback voices for servers that don't expose a voices endpoint. Kokoro
 * names for local/unknown hosts; OpenAI built-ins when the base URL is
 * api.openai.com. Users can also type a custom voice ID. */
function fallbackVoices(baseUrl: string): Voice[] {
  if (looksLikeOpenAi(baseUrl)) return OPENAI_VOICES;
  return [
    { id: "af_heart", label: "Heart (af)" },
    { id: "am_adam", label: "Adam (am)" },
    { id: "am_michael", label: "Michael (am)" },
    { id: "af_bella", label: "Bella (af)" },
    { id: "af_sarah", label: "Sarah (af)" },
    { id: "af_nicole", label: "Nicole (af)" },
    { id: "bf_emma", label: "Emma (bf)" },
    { id: "bf_isabella", label: "Isabella (bf)" },
    { id: "bm_george", label: "George (bm)" },
    { id: "bm_lewis", label: "Lewis (bm)" },
  ];
}

/** Try `/audio/voices` then `/voices`. If both miss, fall back by host. */
export async function listVoices(baseUrl: string, key?: string): Promise<Voice[]> {
  const root = rootUrl(baseUrl);
  return (
    (await fetchVoices(`${root}/audio/voices`, key)) ??
    (await fetchVoices(`${root}/voices`, key)) ??
    fallbackVoices(baseUrl)
  );
}

export async function synthesize(
  text: string,
  voiceId: string,
  baseUrl: string,
  key?: string,
  model?: string,
): Promise<Audio> {
  const url = `${rootUrl(baseUrl)}/audio/speech`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeader(key) },
    body: JSON.stringify(speechPayload(text, { model, voice: voiceId })),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(message(res.status, "speaking", await safeJson(res)));
  const mime = res.headers.get("content-type")?.trim() || "audio/mpeg";
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime };
}
