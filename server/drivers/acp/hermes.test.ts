import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { removeTempDir } from "../../testing/cleanup.ts";
import { HERMES_CONFIG_MODEL_ID, hermesAcpModelId, hermesConfiguredModel, hermesHome } from "./hermes.ts";

describe("hermesConfiguredModel", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await removeTempDir(d);
  });

  const home = (env: string, cfg?: string) => {
    const root = mkdtempSync(join(tmpdir(), "omb-hermes-"));
    dirs.push(root);
    const h = join(root, ".hermes");
    mkdirSync(h, { recursive: true });
    writeFileSync(join(h, ".env"), env);
    if (cfg !== undefined) writeFileSync(join(h, "config.yaml"), cfg);
    return { HERMES_HOME: h };
  };

  it("offers the configured model when a hosted key is set", () => {
    const env = home("OPENROUTER_API_KEY=sk-or-v1-test\n", "model:\n  default: anthropic/claude-opus-4.6\n");
    expect(hermesConfiguredModel(env)).toEqual({
      id: HERMES_CONFIG_MODEL_ID,
      label: "anthropic/claude-opus-4.6 (Hermes config)",
      // ModelPicker shows a custom-only agent ONLY its custom-flagged options.
      custom: true,
    });
  });

  it("treats a commented-out key as not configured", () => {
    // The shipped .env carries `# OPENROUTER_API_KEY=`; reading that as
    // configured would offer a model that cannot authenticate.
    const env = home("# OPENROUTER_API_KEY=\n", "model:\n  default: anthropic/claude-opus-4.6\n");
    expect(hermesConfiguredModel(env)).toBeNull();
  });

  it.each([
    "OPENROUTER_API_KEY=\n",
    'OPENROUTER_API_KEY=""\n',
    "OPENROUTER_API_KEY='' # intentionally blank\n",
    "OPENROUTER_API_KEY=   # configured later\n",
  ])("does not treat a blank key as configured: %j", (line) => {
    expect(hermesConfiguredModel(home(line))).toBeNull();
  });

  it("returns null when there is no .env at all, leaving local-only setups unchanged", () => {
    const root = mkdtempSync(join(tmpdir(), "omb-hermes-bare-"));
    dirs.push(root);
    expect(hermesConfiguredModel({ HERMES_HOME: join(root, ".hermes") })).toBeNull();
  });

  it("still offers the model when config.yaml is unreadable, with a generic label", () => {
    const env = home("OPENROUTER_API_KEY=sk-or-v1-test\n");
    mkdirSync(join(env.HERMES_HOME, "config.yaml"));
    expect(hermesConfiguredModel(env)).toEqual({
      id: HERMES_CONFIG_MODEL_ID,
      label: "Hermes default (config)",
      custom: true,
    });
  });

  it("offers the configured model when Portal OAuth landed in auth.json", () => {
    const env = home("# OPENROUTER_API_KEY=\n", "model:\n  default: nous/hermes-agent\n");
    writeFileSync(join(env.HERMES_HOME, "auth.json"), '{"nous":{"access_token":"tok"}}\n');
    expect(hermesConfiguredModel(env)).toEqual({
      id: HERMES_CONFIG_MODEL_ID,
      label: "nous/hermes-agent (Hermes config)",
      custom: true,
    });
  });

  it("does not treat an empty auth.json as configured", () => {
    const env = home("# OPENROUTER_API_KEY=\n");
    writeFileSync(join(env.HERMES_HOME, "auth.json"), "{}\n");
    expect(hermesConfiguredModel(env)).toBeNull();
  });

  it("does not map to an ACP model id, so no session/set_model is sent for it", () => {
    // This is what makes Hermes fall through to its own configured provider.
    expect(hermesAcpModelId(HERMES_CONFIG_MODEL_ID)).toBeNull();
  });
});

describe("hermesHome", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await removeTempDir(d);
  });

  it("honors HERMES_HOME over the Windows native layout", () => {
    const root = mkdtempSync(join(tmpdir(), "omb-hermes-home-"));
    dirs.push(root);
    const explicit = join(root, "explicit");
    mkdirSync(explicit, { recursive: true });
    expect(
      hermesHome({
        HERMES_HOME: explicit,
        HOME: root,
        LOCALAPPDATA: join(root, "AppData", "Local"),
      }),
    ).toBe(explicit);
  });

  it("uses %LOCALAPPDATA%\\hermes when that is the native install inside HOME", () => {
    const root = mkdtempSync(join(tmpdir(), "omb-hermes-win-"));
    dirs.push(root);
    const localApp = join(root, "AppData", "Local");
    const native = join(localApp, "hermes");
    mkdirSync(native, { recursive: true });
    writeFileSync(join(native, "config.yaml"), "model:\n  default: x\n");
    expect(hermesHome({ HOME: root, USERPROFILE: root, LOCALAPPDATA: localApp })).toBe(native);
  });

  it("does not adopt a LOCALAPPDATA hermes that sits outside this HOME", () => {
    const root = mkdtempSync(join(tmpdir(), "omb-hermes-scratch-"));
    const foreignRoot = mkdtempSync(join(tmpdir(), "omb-hermes-foreign-"));
    dirs.push(root, foreignRoot);
    const foreign = join(foreignRoot, "hermes");
    mkdirSync(foreign, { recursive: true });
    writeFileSync(join(foreign, "config.yaml"), "model:\n  default: x\n");
    writeFileSync(join(foreign, ".env"), "OPENROUTER_API_KEY=sk-or-real\n");
    expect(hermesHome({ HOME: root, USERPROFILE: root, LOCALAPPDATA: foreignRoot })).toBe(join(root, ".hermes"));
    expect(hermesConfiguredModel({ HOME: root, USERPROFILE: root, LOCALAPPDATA: foreignRoot })).toBeNull();
  });
});

describe("hermesAcpModelId", () => {
  it("forwards Hermes' own provider-scoped ids untouched", () => {
    // These are what `session/new` advertises. Returning null for them is what
    // confined the picker to locally injected hosts.
    expect(hermesAcpModelId("openrouter:qwen/qwen3.8-max")).toBe("openrouter:qwen/qwen3.8-max");
    expect(hermesAcpModelId("openrouter:deepseek/deepseek-v4-flash")).toBe(
      "openrouter:deepseek/deepseek-v4-flash",
    );
  });

  it("still maps local inject ids to Hermes' custom:<host>:<model> form", () => {
    expect(hermesAcpModelId("ollama::llama3")).toBe("custom:ollama:llama3");
  });

  it("returns null for the config sentinel, so Hermes keeps its own default", () => {
    expect(hermesAcpModelId(HERMES_CONFIG_MODEL_ID)).toBeNull();
  });

  it("returns null for a bare word that names no provider", () => {
    expect(hermesAcpModelId("gpt-5")).toBeNull();
  });
});
