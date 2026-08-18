import { describe, expect, it } from "vitest";
import { frameSrc } from "./frame-src";

describe("frameSrc", () => {
  it("returns null for empty payloads", () => {
    expect(frameSrc(null)).toBeNull();
    expect(frameSrc(undefined)).toBeNull();
    expect(frameSrc("")).toBeNull();
  });

  it("passes through an existing data URL", () => {
    expect(frameSrc("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });

  it("prefixes raw base64 with the given mime", () => {
    expect(frameSrc("abc123", "image/jpeg")).toBe("data:image/jpeg;base64,abc123");
  });
});
