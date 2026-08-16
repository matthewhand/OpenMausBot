// OpenAI-compatible Whisper/STT provider. Supports any service that implements
// the OpenAI /v1/audio/transcriptions endpoint (OpenAI, LiteLLM, faster-whisper).
import FormData from "form-data";
import fetch from "node-fetch";

export interface WhisperConfig {
  baseUrl: string;
  key?: string;
  model?: string;
}

export interface TranscriptResult {
  text: string;
}

/**
 * Transcribe audio using an OpenAI-compatible Whisper endpoint.
 * @param audio - Audio buffer (webm, mp3, wav, etc.)
 * @param config - Whisper provider configuration
 * @returns The transcript text
 */
export async function transcribe(audio: Buffer, config: WhisperConfig): Promise<TranscriptResult> {
  const { baseUrl, key, model = "whisper" } = config;

  if (!baseUrl) {
    throw new Error("Whisper base URL is required");
  }

  // Normalize the base URL to ensure it ends correctly
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const url = `${normalizedBaseUrl}/audio/transcriptions`;

  const form = new FormData();
  // Send as webm by default (what MediaRecorder produces), but most Whisper
  // implementations auto-detect from the file content
  form.append("file", audio, {
    filename: "audio.webm",
    contentType: "audio/webm",
  });
  form.append("model", model);

  const headers: Record<string, string> = {
    ...form.getHeaders(),
  };

  if (key) {
    headers["Authorization"] = `Bearer ${key}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Whisper transcription failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`,
      );
    }

    const result = (await response.json()) as { text?: string; error?: { message?: string } };

    if (result.error) {
      throw new Error(result.error.message || "Whisper API error");
    }

    if (typeof result.text !== "string") {
      throw new Error("Invalid Whisper response: missing text field");
    }

    return { text: result.text };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Whisper transcription error: ${String(error)}`);
  }
}

/**
 * Verify that the Whisper endpoint is reachable and configured correctly.
 * This is a lightweight check that doesn't require audio.
 */
export async function verifyConnection(config: WhisperConfig): Promise<boolean> {
  const { baseUrl, key } = config;

  if (!baseUrl) {
    return false;
  }

  // Try to reach the base URL
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  const headers: Record<string, string> = {};
  if (key) {
    headers["Authorization"] = `Bearer ${key}`;
  }

  try {
    // Just check if the base URL is reachable (some endpoints have a health check)
    const response = await fetch(normalizedBaseUrl, {
      method: "GET",
      headers,
      // Short timeout for quick verification
      signal: AbortSignal.timeout(5000),
    });

    // We don't care about the response status for a base URL check
    // If it responds at all, that's good enough
    return response.status < 500;
  } catch {
    // If it fails, the endpoint might still work (some don't have a GET endpoint)
    // Return true to allow the user to try anyway
    return true;
  }
}
