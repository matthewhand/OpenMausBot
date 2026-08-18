import { describe, expect, it } from "vitest";

import {
  ttsActiveVoice,
  ttsElevenLabsKeyPatch,
  ttsOpenaiCredentialsPatch,
  ttsOpenaiModelPatch,
  ttsProviderPatch,
  ttsVoicePatch,
} from "./tts-provider";

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
    expect(ttsOpenaiCredentialsPatch("http://127.0.0.1:9093/v1", "")).not.toHaveProperty("openaiKey");
  });

  it("sends openaiKey: \"\" when clearKey is set", () => {
    expect(ttsOpenaiCredentialsPatch("http://127.0.0.1:8880/v1", "", { clearKey: true })).toEqual({
      baseUrl: "http://127.0.0.1:8880/v1",
      openaiKey: "",
    });
  });
});

describe("ttsOpenaiModelPatch", () => {
  it("trims the model id", () => {
    expect(ttsOpenaiModelPatch(" kokoro ")).toEqual({ openaiModel: "kokoro" });
  });
});

describe("ttsElevenLabsKeyPatch", () => {
  it("trims the ElevenLabs key only", () => {
    expect(ttsElevenLabsKeyPatch("  el-key  ")).toEqual({ key: "el-key" });
  });
});

describe("ttsVoicePatch", () => {
  it("saves ElevenLabs as voice only — never openaiVoice", () => {
    expect(ttsVoicePatch("elevenlabs", " v-1 ")).toEqual({ voice: "v-1" });
    expect(ttsVoicePatch("elevenlabs", "v-1")).not.toHaveProperty("openaiVoice");
  });

  it("saves OpenAI-compatible as openaiVoice only — never the ElevenLabs field", () => {
    expect(ttsVoicePatch("openai-compatible", " af_heart ")).toEqual({ openaiVoice: "af_heart" });
    expect(ttsVoicePatch("openai-compatible", "af_heart")).not.toHaveProperty("voice");
  });
});

describe("ttsActiveVoice", () => {
  it("reads the field for the selected provider and ignores the other", () => {
    const both = { voice: "v-1", openaiVoice: "af_heart" };
    expect(ttsActiveVoice("elevenlabs", both)).toBe("v-1");
    expect(ttsActiveVoice("openai-compatible", both)).toBe("af_heart");
    expect(ttsActiveVoice("openai-compatible", { voice: "v-1" })).toBe("");
    expect(ttsActiveVoice("elevenlabs", { openaiVoice: "af_heart" })).toBe("");
  });
});
