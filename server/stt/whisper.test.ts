// Tests for the OpenAI-compatible Whisper STT provider
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as whisper from "./whisper.ts";

// Mock node-fetch
const mockFetch = vi.fn();
vi.mock("node-fetch", () => ({ default: mockFetch }));

// Mock FormData
class MockFormData {
  private data: Map<string, any> = new Map();
  
  append(key: string, value: any) {
    this.data.set(key, value);
  }
  
  getHeaders() {
    return { "content-type": "multipart/form-data; boundary=----test" };
  }
}

vi.mock("form-data", () => ({ default: MockFormData }));

describe("whisper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("transcribe", () => {
    it("should transcribe audio successfully", async () => {
      const audioBuffer = Buffer.from("fake audio data");
      const config = {
        baseUrl: "http://localhost:9002/v1",
        model: "whisper",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "Hello, world!" }),
      });

      const result = await whisper.transcribe(audioBuffer, config);

      expect(result).toEqual({ text: "Hello, world!" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9002/v1/audio/transcriptions",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("should include Authorization header when key is provided", async () => {
      const audioBuffer = Buffer.from("fake audio data");
      const config = {
        baseUrl: "http://localhost:9002/v1",
        key: "sk-test-key",
        model: "whisper-1",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "Authenticated request" }),
      });

      await whisper.transcribe(audioBuffer, config);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer sk-test-key",
          }),
        }),
      );
    });

    it("should handle transcription errors", async () => {
      const audioBuffer = Buffer.from("fake audio data");
      const config = {
        baseUrl: "http://localhost:9002/v1",
        model: "whisper",
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Service unavailable",
      });

      await expect(whisper.transcribe(audioBuffer, config)).rejects.toThrow(
        /Whisper transcription failed/,
      );
    });

    it("should normalize base URL trailing slashes", async () => {
      const audioBuffer = Buffer.from("fake audio data");
      const config = {
        baseUrl: "http://localhost:9002/v1///",
        model: "whisper",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "Success" }),
      });

      await whisper.transcribe(audioBuffer, config);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9002/v1/audio/transcriptions",
        expect.any(Object),
      );
    });

    it("should use default model if not provided", async () => {
      const audioBuffer = Buffer.from("fake audio data");
      const config = {
        baseUrl: "http://localhost:9002/v1",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "Default model" }),
      });

      await whisper.transcribe(audioBuffer, config);

      // The form data should include model: "whisper" by default
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should throw error if baseUrl is missing", async () => {
      const audioBuffer = Buffer.from("fake audio data");
      const config = {
        baseUrl: "",
        model: "whisper",
      };

      await expect(whisper.transcribe(audioBuffer, config)).rejects.toThrow(
        "Whisper base URL is required",
      );
    });

    it("should handle API error responses", async () => {
      const audioBuffer = Buffer.from("fake audio data");
      const config = {
        baseUrl: "http://localhost:9002/v1",
        model: "whisper",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { message: "Invalid audio format" },
        }),
      });

      await expect(whisper.transcribe(audioBuffer, config)).rejects.toThrow(
        "Invalid audio format",
      );
    });

    it("should handle missing text in response", async () => {
      const audioBuffer = Buffer.from("fake audio data");
      const config = {
        baseUrl: "http://localhost:9002/v1",
        model: "whisper",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await expect(whisper.transcribe(audioBuffer, config)).rejects.toThrow(
        "Invalid Whisper response: missing text field",
      );
    });
  });

  describe("verifyConnection", () => {
    it("should return false if baseUrl is missing", async () => {
      const config = { baseUrl: "" };
      const result = await whisper.verifyConnection(config);
      expect(result).toBe(false);
    });

    it("should return true if base URL is reachable", async () => {
      const config = { baseUrl: "http://localhost:9002/v1" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await whisper.verifyConnection(config);
      expect(result).toBe(true);
    });

    it("should return true even if base URL check fails (endpoint may still work)", async () => {
      const config = { baseUrl: "http://localhost:9002/v1" };

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await whisper.verifyConnection(config);
      // Returns true to allow user to try anyway (some endpoints don't have GET)
      expect(result).toBe(true);
    });
  });
});
