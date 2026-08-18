// The voice, driven against a stub rather than the live service — same
// rule as the box and computer-proxy contract tests: what we send, and how
// a refusal is reported, are the things that break.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AppConfig } from "../config.ts";

let server: Server;
/** every request the stub saw, so tests can assert on what we sent */
const seen: Array<{ method: string; url: string; headers: Record<string, string>; body: string }> = [];
/** flipped by tests that want ElevenLabs to refuse */
let refuse: { status: number; body: unknown } | null = null;

const MP3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x11, 0x22, 0x33, 0x44]);

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers as Record<string, string>,
        body,
      });
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      if (refuse) return send(refuse.status, refuse.body);
      const path = (req.url ?? "").split("?")[0];
      // A RESTRICTED key — the common real-world case. It can read voices
      // and speak, but has no user_read. Verifying against /user would
      // reject it, which is exactly the bug this stub exists to catch.
      if (path === "/v1/user") return send(401, { detail: { status: "missing_permissions" } });
      if (path === "/v1/voices") {
        return send(200, {
          voices: [{ voice_id: "v-1", name: "Rachel", labels: { accent: "american", description: "calm" } }],
        });
      }
      if (path === "/voices") {
        // OpenAI-compatible voices endpoint
        return send(200, [
          { id: "af_heart", name: "Heart", description: "Warm female voice" },
          { id: "am_adam", name: "Adam", description: "Clear male voice" },
        ]);
      }
      if (path.startsWith("/v1/text-to-speech/")) {
        res.writeHead(200, { "content-type": "audio/mpeg" });
        return res.end(MP3);
      }
      if (path === "/audio/speech" || path === "/v1/audio/speech") {
        // OpenAI-compatible speech endpoint
        res.writeHead(200, { "content-type": "audio/mpeg" });
        return res.end(MP3);
      }
      send(404, { detail: "no such stub route" });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  process.env.OMB_ELEVENLABS_API = `http://127.0.0.1:${port}/v1`;
  process.env.OMB_OPENAI_TTS_BASE = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

/** The module reads its base URL at import time, so tests import after the
 * stub is listening. */
const voice = () => import("./index.ts");

const cfg = (tts: AppConfig["tts"]): AppConfig => ({ tts });

describe("configuration", () => {
  it("needs both a key and a voice before it can speak (ElevenLabs)", async () => {
    const { voiceConfigured, voiceReady } = await voice();
    expect(voiceConfigured({})).toBe(false);
    expect(voiceConfigured(cfg({ key: "k" }))).toBe(false);
    expect(voiceConfigured(cfg({ voice: "v-1" }))).toBe(false);
    expect(voiceConfigured(cfg({ key: "k", voice: "v-1" }))).toBe(true);
    expect(voiceReady(cfg({ key: "k" }), "v-per-bot")).toBe(true);
    expect(voiceReady({}, "v-per-bot")).toBe(false);
  });

  it("needs baseUrl and voice for OpenAI-compatible (key optional)", async () => {
    const { voiceConfigured, voiceReady } = await voice();
    const openaiCfg = (tts: AppConfig["tts"]): AppConfig => ({ tts: { provider: "openai-compatible", ...tts } });
    expect(voiceConfigured(openaiCfg({}))).toBe(false);
    expect(voiceConfigured(openaiCfg({ baseUrl: "http://localhost" }))).toBe(false);
    expect(voiceConfigured(openaiCfg({ voice: "v-1" }))).toBe(false);
    expect(voiceConfigured(openaiCfg({ baseUrl: "http://localhost", voice: "v-1" }))).toBe(true);
    // key is optional for local servers
    expect(voiceReady(openaiCfg({ baseUrl: "http://localhost" }), "v-per-bot")).toBe(true);
  });

  it("defaults to elevenlabs when provider is not set", async () => {
    const { describeVoice } = await voice();
    const described = describeVoice(cfg({ key: "sk-secret", voice: "v-1" }));
    expect(described.provider).toBe("elevenlabs");
  });

  it("never reports the key itself", async () => {
    const { describeVoice } = await voice();
    const described = describeVoice(cfg({ key: "sk-secret", voice: "v-1" }));
    expect(described.configured).toBe(true);
    expect(described.ready).toBe(true);
    expect(described.voice).toBe("v-1");
    expect(JSON.stringify(described)).not.toContain("sk-secret");
  });

  it("reports baseUrl for OpenAI-compatible (not a secret)", async () => {
    const { describeVoice } = await voice();
    const described = describeVoice(cfg({ provider: "openai-compatible", baseUrl: "http://localhost", voice: "v-1" }));
    expect(described.baseUrl).toBe("http://localhost");
    expect(described.configured).toBe(true);
  });

  it("distinguishes 'no key' from 'no voice picked' for ElevenLabs", async () => {
    // the two need different instructions, so they are different errors
    const { speak, NoVoiceConfigured } = await voice();
    expect(() => speak({}, "hi")).toThrow(NoVoiceConfigured);
    expect(() => speak({}, "hi")).toThrow(
      "Add an ElevenLabs key in Settings on the computer to turn on voice.",
    );
    expect(() => speak(cfg({ key: "k" }), "hi")).toThrow(
      "Pick a voice in the agent profile.",
    );
  });

  it("distinguishes 'no baseUrl' from 'no voice' for OpenAI-compatible", async () => {
    const { speak } = await voice();
    const openaiCfg = (tts: AppConfig["tts"]): AppConfig => ({ tts: { provider: "openai-compatible", ...tts } });
    expect(() => speak(openaiCfg({}), "hi")).toThrow(/base url/i);
    expect(() => speak(openaiCfg({ baseUrl: "http://localhost" }), "hi")).toThrow(/voice/i);
  });

  it("lists no voices without a key for ElevenLabs, rather than calling out", async () => {
    seen.length = 0;
    const { listVoices } = await voice();
    expect(await listVoices({})).toEqual([]);
    expect(seen).toHaveLength(0);
  });
});

describe("ElevenLabs", () => {
  const ready = { key: "el-key", voice: "v-1" };

  it("accepts a restricted key that can read voices and speak", async () => {
    // ElevenLabs keys carry per-endpoint scopes. A key limited to speech
    // has no user_read, so verifying against /user rejects a key that
    // works perfectly — the stub 401s /user to hold that line.
    refuse = null;
    seen.length = 0;
    const { verifyKey } = await voice();
    expect(await verifyKey("el-key", "elevenlabs")).toEqual({ ok: true });
    expect(seen.map((r) => r.url.split("?")[0])).not.toContain("/v1/user");
  });

  it("says what to do when the key is genuinely refused", async () => {
    refuse = { status: 401, body: { detail: "invalid api key" } };
    const { verifyKey } = await voice();
    const result = await verifyKey("nope", "elevenlabs");
    refuse = null;
    expect(result.ok).toBe(false);
    // names scopes, because "get a fresh key" is the wrong advice when the
    // key is real but restricted
    if (!result.ok) expect(result.message).toMatch(/permission|restricted/i);
  });

  it("lists voices with their labels", async () => {
    const { listVoices } = await voice();
    expect(await listVoices(cfg(ready))).toEqual([
      { id: "v-1", label: "Rachel", description: "american · calm" },
    ]);
  });

  it("asks for mp3 and sends the key as a header, never in the URL", async () => {
    seen.length = 0;
    const { speak } = await voice();
    const audio = await speak(cfg(ready), "hello there");
    expect(audio.mime).toBe("audio/mpeg");
    expect(Buffer.from(audio.bytes)).toEqual(MP3);

    const call = seen.at(-1)!;
    expect(call.method).toBe("POST");
    expect(call.url).toContain("/v1/text-to-speech/v-1");
    expect(call.url).toContain("output_format=mp3");
    expect(call.headers["xi-api-key"]).toBe("el-key");
    expect(call.url).not.toContain("el-key");
    expect(JSON.parse(call.body)).toMatchObject({ text: "hello there", model_id: "eleven_flash_v2_5" });
  });

  it("lets a caller override the voice per bot", async () => {
    seen.length = 0;
    const { speak } = await voice();
    await speak(cfg(ready), "hello", "v-other");
    expect(seen.at(-1)!.url).toContain("/v1/text-to-speech/v-other");
  });

  it("surfaces the service's own refusal rather than a bare status", async () => {
    refuse = { status: 429, body: { detail: "You have exceeded your quota." } };
    const { speak } = await voice();
    const message = await speak(cfg(ready), "hi").catch((e: Error) => e.message);
    refuse = null;
    expect(message).toContain("exceeded your quota");
  });
});

describe("OpenAI-compatible", () => {
  const port = () => (server.address() as { port: number }).port;
  const baseUrl = () => `http://127.0.0.1:${port()}`;
  const openaiCfg = (tts: AppConfig["tts"]): AppConfig => ({
    tts: { provider: "openai-compatible", baseUrl: baseUrl(), ...tts },
  });

  it("verifies a server without a key (local unauthenticated)", async () => {
    refuse = null;
    seen.length = 0;
    const { verifyKey } = await voice();
    expect(await verifyKey("", "openai-compatible", baseUrl())).toEqual({ ok: true });
  });

  it("verifies a server with a key", async () => {
    refuse = null;
    seen.length = 0;
    const { verifyKey } = await voice();
    expect(await verifyKey("sk-test", "openai-compatible", baseUrl())).toEqual({ ok: true });
    const call = seen.at(-1)!;
    expect(call.headers.authorization).toBe("Bearer sk-test");
  });

  it("lists voices from the server", async () => {
    const { listVoices } = await voice();
    const voices = await listVoices(openaiCfg({ voice: "af_heart" }));
    expect(voices).toContainEqual({ id: "af_heart", label: "Heart", description: "Warm female voice" });
    expect(voices).toContainEqual({ id: "am_adam", label: "Adam", description: "Clear male voice" });
  });

  it("synthesizes speech with the OpenAI endpoint", async () => {
    seen.length = 0;
    const { speak } = await voice();
    const audio = await speak(openaiCfg({ voice: "af_heart" }), "hello there");
    expect(audio.mime).toBe("audio/mpeg");
    expect(Buffer.from(audio.bytes)).toEqual(MP3);

    const call = seen.at(-1)!;
    expect(call.method).toBe("POST");
    expect(call.url).toContain("/audio/speech");
    expect(JSON.parse(call.body)).toMatchObject({ model: "tts-1", input: "hello there", voice: "af_heart" });
  });

  it("sends Authorization header when key is provided", async () => {
    seen.length = 0;
    const { speak } = await voice();
    await speak(openaiCfg({ key: "sk-test", voice: "af_heart" }), "hello");
    const call = seen.at(-1)!;
    expect(call.headers.authorization).toBe("Bearer sk-test");
  });

  it("omits Authorization header when key is absent", async () => {
    seen.length = 0;
    const { speak } = await voice();
    await speak(openaiCfg({ voice: "af_heart" }), "hello");
    const call = seen.at(-1)!;
    expect(call.headers.authorization).toBeUndefined();
  });
});
