import { describe, expect, it } from "vitest";

import { ttsElevenLabsKeyPatch, ttsOpenaiCredentialsPatch, ttsProviderPatch } from "./tts-provider";

describe("ttsProviderPatch", () => {
  it("sends only the provider — never a blank key that would wipe ElevenLabs", () => {
    expect(ttsProviderPatch("openai-compatible")).toEqual({ provider: "openai-compatible" });
    expect(ttsProviderPatch("elevenlabs")).toEqual({ provider: "elevenlabs" });
    expect(ttsProviderPatch("openai-compatible")).not.toHaveProperty("key");
    expect(ttsProviderPatch("openai-compatible")).not.toHaveProperty("openaiKey");
  });
});

describe("ttsOpenaiCredentialsPatch", () => {
  it("saves baseUrl and an optional openaiKey, never an empty key field", () => {
    expect(ttsOpenaiCredentialsPatch(" http://127.0.0.1:9093/v1 ", " sk-local ")).toEqual({
      baseUrl: "http://127.0.0.1:9093/v1",
      openaiKey: "sk-local",
    });
    expect(ttsOpenaiCredentialsPatch("http://127.0.0.1:9093/v1", "   ")).toEqual({
      baseUrl: "http://127.0.0.1:9093/v1",
    });
    expect(ttsOpenaiCredentialsPatch("http://127.0.0.1:9093/v1", "")).not.toHaveProperty("key");
  });
});

describe("ttsElevenLabsKeyPatch", () => {
  it("trims the ElevenLabs key only", () => {
    expect(ttsElevenLabsKeyPatch("  el-key  ")).toEqual({ key: "el-key" });
  });
});
