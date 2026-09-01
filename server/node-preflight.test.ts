import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MIN_NODE_MAJOR, assertSupportedNode, nodeVersionError } from "./node-preflight.ts";

describe("nodeVersionError", () => {
  it("accepts the minimum major and newer", () => {
    expect(nodeVersionError("v24.0.0")).toBeNull();
    expect(nodeVersionError("v24.20.0")).toBeNull();
    expect(nodeVersionError("v25.1.0")).toBeNull();
    expect(nodeVersionError("26.0.0")).toBeNull();
  });

  it("rejects older majors with a readable message", () => {
    const error = nodeVersionError("v22.14.0");
    expect(error).toContain("requires Node >= 24");
    expect(error).toContain("v22.14.0");
  });

  it("rejects versions it cannot parse", () => {
    expect(nodeVersionError("")).not.toBeNull();
    expect(nodeVersionError("garbage")).not.toBeNull();
  });

  it("honors a custom minimum", () => {
    expect(nodeVersionError("v22.14.0", 22)).toBeNull();
    expect(nodeVersionError("v22.14.0", 23)).toContain("requires Node >= 23");
  });

  it("keeps the exported minimum in sync with package.json engines", () => {
    const pkg = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
    );
    expect(pkg.engines.node).toBe(`>=${MIN_NODE_MAJOR}`);
  });

  it("passes on the Node actually running this suite", () => {
    expect(nodeVersionError(process.version)).toBeNull();
  });
});

describe("assertSupportedNode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits 1 with the readable message on Node 22", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    // SAFETY: the mock must not terminate vitest; production exit(1) never returns.
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    assertSupportedNode("v22.14.0");
    expect(exit).toHaveBeenCalledWith(1);
    expect(String(err.mock.calls[0]?.[0])).toContain("requires Node >= 24");
    expect(String(err.mock.calls[0]?.[0])).toContain("v22.14.0");
  });

  it("does not exit on Node 24+", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    // SAFETY: the mock must not terminate vitest; production exit(1) never returns.
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    assertSupportedNode("v24.20.0");
    expect(exit).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });

  it("server boot calls the preflight before listening", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.ts"), "utf8");
    expect(src).toMatch(/import \{ assertSupportedNode \} from "\.\/node-preflight\.ts"/);
    expect(src.indexOf("assertSupportedNode()")).toBeLessThan(src.indexOf("const PORT"));
  });
});
