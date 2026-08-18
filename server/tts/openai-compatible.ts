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

/** Verify the server is reachable and the key (if provided) works. We check
 * against a cheap speech request rather than a models or voices endpoint that
 * may not exist on all OpenAI-compatible servers. */
export async function verifyKey(baseUrl: string, key?: string): Promise<VerifyResult> {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/audio/speech`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader(key) },
      body: JSON.stringify({ model: "tts-1", input: "test", voice: "alloy" }),
      signal: AbortSignal.timeout(20_000),
    });
    // 200 = success, 400 = server understood but rejected params (still valid), others are real failures
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

/** Try to list voices from the server. Many OpenAI-compatible servers don't
 * expose a voices endpoint, so we return a fallback list of common Kokoro
 * voices when the endpoint is missing or fails. */
export async function listVoices(baseUrl: string, key?: string): Promise<Voice[]> {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/voices`;
    const res = await fetch(url, {
      headers: authHeader(key),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return fallbackVoices();
    const body = await safeJson(res);
    // Try both OpenAI shape ({ voices: [...] }) and direct array shape
    const list = Array.isArray(body) ? body : body?.voices ?? [];
    if (!Array.isArray(list) || list.length === 0) return fallbackVoices();
    return list
      .map((v: any): Voice => ({
        id: String(v.voice_id ?? v.id ?? ""),
        label: String(v.name ?? v.label ?? v.id ?? "Voice"),
        description: v.description || v.labels?.description || undefined,
      }))
      .filter((v: Voice) => v.id);
  } catch {
    return fallbackVoices();
  }
}

/** Fallback voices for servers that don't expose a /voices endpoint. Based on
 * common Kokoro-FastAPI voices, but generic enough for any OpenAI-compatible
 * server. Users can also type a custom voice ID. */
function fallbackVoices(): Voice[] {
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

export async function synthesize(
  text: string,
  voiceId: string,
  baseUrl: string,
  key?: string,
): Promise<Audio> {
  const url = `${baseUrl.replace(/\/$/, "")}/audio/speech`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeader(key) },
    body: JSON.stringify({ model: "tts-1", input: text, voice: voiceId }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(message(res.status, "speaking", await safeJson(res)));
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: "audio/mpeg" };
}
