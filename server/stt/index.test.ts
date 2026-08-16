// Tests for the main STT module
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as stt from "./index.ts";
import type { AppConfig } from "../config.ts";

// Mock the whisper module
vi.mock("./whisper.ts", () => ({
  transcribe: vi.fn(async () => ({ text: "Mocked transcription" })),
  verifyConnection: vi.fn(async () => true),
}));

describe("stt", () => {
  describe("sttProvider", () => {
    it("should return apple-speech on macOS by default", () => {
      const config: AppConfig = {};
      const provider = stt.sttProvider(config, "darwin");
      expect(provider).toBe("apple-speech");
    });

    it("should return none on non-macOS by default", () => {
      const config: AppConfig = {};
      expect(stt.sttProvider(config, "win32")).toBe("none");
      expect(stt.sttProvider(config, "linux")).toBe("none");
    });

    it("should return openai-whisper when configured", () => {
      const config: AppConfig = {
        stt: {
          provider: "openai-whisper",
          baseUrl: "http://localhost:9002/v1",
        },
      };
      const provider = stt.sttProvider(config, "win32");
      expect(provider).toBe("openai-whisper");
    });

    it("should return none if openai-whisper is selected but baseUrl is missing", () => {
      const config: AppConfig = {
        stt: {
          provider: "openai-whisper",
        },
      };
      const provider = stt.sttProvider(config, "win32");
      expect(provider).toBe("none");
    });

    it("should return apple-speech only on macOS when explicitly selected", () => {
      const config: AppConfig = {
        stt: {
          provider: "apple-speech",
        },
      };
      expect(stt.sttProvider(config, "darwin")).toBe("apple-speech");
      expect(stt.sttProvider(config, "win32")).toBe("none");
    });

    it("should return none when provider is explicitly set to none", () => {
      const config: AppConfig = {
        stt: {
          provider: "none",
        },
      };
      expect(stt.sttProvider(config, "darwin")).toBe("none");
      expect(stt.sttProvider(config, "win32")).toBe("none");
    });

    it("should prefer openai-whisper if baseUrl is set without explicit provider", () => {
      const config: AppConfig = {
        stt: {
          baseUrl: "http://localhost:9002/v1",
        },
      };
      expect(stt.sttProvider(config, "win32")).toBe("openai-whisper");
    });
  });

  describe("sttReady", () => {
    it("should return true when STT is configured", () => {
      const config: AppConfig = {
        stt: {
          provider: "openai-whisper",
          baseUrl: "http://localhost:9002/v1",
        },
      };
      expect(stt.sttReady(config, "win32")).toBe(true);
    });

    it("should return false when STT is not configured", () => {
      const config: AppConfig = {};
      expect(stt.sttReady(config, "win32")).toBe(false);
    });

    it("should return true for apple-speech on macOS", () => {
      const config: AppConfig = {};
      expect(stt.sttReady(config, "darwin")).toBe(true);
    });
  });

  describe("describeSTT", () => {
    it("should describe STT status correctly", () => {
      const config: AppConfig = {
        stt: {
          provider: "openai-whisper",
          baseUrl: "http://localhost:9002/v1",
          model: "whisper",
        },
      };
      const desc = stt.describeSTT(config, "win32");
      expect(desc).toEqual({
        provider: "openai-whisper",
        available: true,
        ready: true,
        baseUrl: "http://localhost:9002/v1",
        model: "whisper",
      });
    });

    it("should default to apple-speech on macOS", () => {
      const config: AppConfig = {};
      const desc = stt.describeSTT(config, "darwin");
      expect(desc.provider).toBe("apple-speech");
      expect(desc.available).toBe(true);
    });

    it("should default to none on non-macOS", () => {
      const config: AppConfig = {};
      const desc = stt.describeSTT(config, "win32");
      expect(desc.provider).toBe("none");
      expect(desc.available).toBe(false);
    });

    it("should show not available when openai-whisper has no baseUrl", () => {
      const config: AppConfig = {
        stt: {
          provider: "openai-whisper",
        },
      };
      const desc = stt.describeSTT(config, "win32");
      expect(desc.available).toBe(false);
      expect(desc.ready).toBe(false);
    });
  });

  describe("transcribe", () => {
    it("should throw NoSTTConfigured when no provider is configured", async () => {
      const config: AppConfig = {};
      const audio = Buffer.from("fake audio");

      await expect(stt.transcribe(config, audio, "win32")).rejects.toThrow(
        stt.NoSTTConfigured,
      );
    });

    it("should throw error when trying to use apple-speech via harness", async () => {
      const config: AppConfig = {
        stt: {
          provider: "apple-speech",
        },
      };
      const audio = Buffer.from("fake audio");

      await expect(stt.transcribe(config, audio, "darwin")).rejects.toThrow(
        /Apple Speech transcription is handled by the Electron main process/,
      );
    });

    it("should call whisper.transcribe for openai-whisper provider", async () => {
      const { transcribe: whisperTranscribe } = await import("./whisper.ts");
      const config: AppConfig = {
        stt: {
          provider: "openai-whisper",
          baseUrl: "http://localhost:9002/v1",
          model: "whisper",
        },
      };
      const audio = Buffer.from("fake audio");

      const result = await stt.transcribe(config, audio, "win32");

      expect(result).toBe("Mocked transcription");
      expect(whisperTranscribe).toHaveBeenCalledWith(audio, {
        baseUrl: "http://localhost:9002/v1",
        key: undefined,
        model: "whisper",
      });
    });

    it("should throw NoSTTConfigured when whisper baseUrl is missing", async () => {
      const config: AppConfig = {
        stt: {
          provider: "openai-whisper",
        },
      };
      const audio = Buffer.from("fake audio");

      await expect(stt.transcribe(config, audio, "win32")).rejects.toThrow(
        stt.NoSTTConfigured,
      );
    });
  });

  describe("NoSTTConfigured", () => {
    it("should have correct error message for provider reason", () => {
      const error = new stt.NoSTTConfigured("provider");
      expect(error.message).toContain("Select a speech-to-text provider");
      expect(error.reason).toBe("provider");
    });

    it("should have correct error message for baseUrl reason", () => {
      const error = new stt.NoSTTConfigured("baseUrl");
      expect(error.message).toContain("Configure the Whisper base URL");
      expect(error.reason).toBe("baseUrl");
    });
  });
});
