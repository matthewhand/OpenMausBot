import { describe, expect, it } from "vitest";

import {
  instanceConfigs,
  parseConfigPatch,
  parseStoredConfig,
  withInstanceCli,
  type AppConfig,
} from "./config.ts";

describe("configuration boundaries", () => {
  it("keeps supported stored settings and drops unrelated top-level data", () => {
    expect(
      parseStoredConfig({
        profile: { name: "Ada", email: "ada@example.com" },
        instances: { claude: { driver: "claudeAgent", config: { cli: "/opt/claude" } } },
        unrelated: { secret: "not part of the config contract" },
      }),
    ).toEqual({
      profile: { name: "Ada", email: "ada@example.com" },
      instances: { claude: { driver: "claudeAgent", config: { cli: "/opt/claude" } } },
    });
  });

  it("rejects malformed stored instances and API patches", () => {
    expect(() => parseStoredConfig({ instances: { claude: { driver: 42 } } })).toThrow("instances.claude.driver");
    expect(() => parseConfigPatch({ opencodeGo: { apiKey: 42 } })).toThrow("opencodeGo.apiKey");
    expect(() => parseConfigPatch({ profile: [] })).toThrow("profile");
  });
});

describe("default fleet", () => {
  it("ships Qwen and Hermes as custom-only engines", () => {
    const map = instanceConfigs({});
    expect(map.qwen).toEqual({ driver: "qwenAgent", environment: {} });
    expect(map.hermes).toEqual({ driver: "hermesAgent", environment: {} });
  });

  it("adds missing custom-only engines onto an existing product fleet", () => {
    const map = instanceConfigs({ instances: { claude: { driver: "claudeAgent" } } });
    expect(map.claude.driver).toBe("claudeAgent");
    expect(map.qwen?.driver).toBe("qwenAgent");
    expect(map.hermes?.driver).toBe("hermesAgent");
  });

  it("does not expand a one-off shadow fleet", () => {
    const map = instanceConfigs({ instances: { ghost: { driver: "not-a-real-driver" } } });
    expect(Object.keys(map)).toEqual(["ghost"]);
  });
});

describe("Instance CLI override", () => {
  it("sets, replaces, and clears config.cli on a default-fleet instance", () => {
    const cfg: AppConfig = {};
    const set = withInstanceCli(cfg, "claude", "/opt/claude-2.1/bin/claude");
    expect(set.ok).toBe(true);
    expect(set.config.instances!.claude.config).toEqual({ cli: "/opt/claude-2.1/bin/claude" });

    const replaced = withInstanceCli(set.config, "claude", "~/bin/claude");
    expect(replaced.config.instances!.claude.config).toEqual({ cli: "~/bin/claude" });

    const cleared = withInstanceCli(replaced.config, "claude", "");
    expect(cleared.config.instances!.claude.config).toBeUndefined();
  });

  it("preserves sibling config keys when clearing only cli", () => {
    const cfg: AppConfig = {
      instances: { claude: { driver: "claudeAgent", config: { cli: "/x/claude", permissionMode: "bypassPermissions" } } },
    };
    const cleared = withInstanceCli(cfg, "claude", "");
    expect(cleared.config.instances!.claude.config).toEqual({ permissionMode: "bypassPermissions" });
  });

  it("leaves the original config untouched and rejects unknown instances", () => {
    const cfg: AppConfig = { instances: { codex: { driver: "codex" } } };
    const result = withInstanceCli(cfg, "codex", "/new/codex");
    expect(result.config.instances!.codex.config).toEqual({ cli: "/new/codex" });
    expect(cfg.instances!.codex.config).toBeUndefined();

    expect(withInstanceCli(cfg, "nope", "/x").ok).toBe(false);
  });

  it("never persists the credential env instanceConfigs injects", () => {
    // instanceConfigs() copies xai/box/opencodeGo keys into every entry's
    // environment for the live fleet; withInstanceCli must strip them back
    // out, or saving a CLI override would copy secrets into the instances
    // section of config.json.
    const cfg: AppConfig = {
      xai: { key: "SECRET-XAI" },
      box: { token: "SECRET-BOX" },
    };
    const set = withInstanceCli(cfg, "claude", "/opt/claude");
    expect(set.ok).toBe(true);
    for (const entry of Object.values(set.config.instances!)) {
      expect(entry.environment ?? {}).toEqual({});
    }
    // user-authored env survives
    const custom = { instances: { claude: { driver: "claudeAgent", environment: { MY_FLAG: "1" } } } };
    const kept = withInstanceCli(custom, "claude", "/x");
    expect(kept.config.instances!.claude.environment).toEqual({ MY_FLAG: "1" });
  });
});

describe("TTS provider configuration", () => {
  it("accepts an OpenAI-compatible provider and baseUrl", () => {
    expect(
      parseStoredConfig({
        tts: { provider: "openai-compatible", baseUrl: "http://127.0.0.1:9093/v1", voice: "af_heart" },
      }),
    ).toEqual({
      tts: { provider: "openai-compatible", baseUrl: "http://127.0.0.1:9093/v1", voice: "af_heart" },
    });
  });

  it("keeps a legacy ElevenLabs config without a provider field", () => {
    expect(parseStoredConfig({ tts: { key: "el-key", voice: "v-1" } })).toEqual({
      tts: { key: "el-key", voice: "v-1" },
    });
  });

  it("rejects an unknown TTS provider", () => {
    expect(() => parseConfigPatch({ tts: { provider: "cartesia" } })).toThrow(/provider/);
  });

  it("keeps the ElevenLabs key next to a separate optional openaiKey", () => {
    expect(
      parseStoredConfig({
        tts: {
          provider: "openai-compatible",
          key: "el-key",
          openaiKey: "sk-local",
          baseUrl: "http://127.0.0.1:9093/v1",
        },
      }),
    ).toEqual({
      tts: {
        provider: "openai-compatible",
        key: "el-key",
        openaiKey: "sk-local",
        baseUrl: "http://127.0.0.1:9093/v1",
      },
    });
  });

  it("accepts openaiVoice next to the ElevenLabs voice id", () => {
    expect(
      parseStoredConfig({
        tts: {
          provider: "openai-compatible",
          baseUrl: "http://127.0.0.1:9093/v1",
          voice: "v-1",
          openaiVoice: "af_heart",
        },
      }),
    ).toEqual({
      tts: {
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:9093/v1",
        voice: "v-1",
        openaiVoice: "af_heart",
      },
    });
  });

  it("accepts openaiModel", () => {
    expect(
      parseStoredConfig({
        tts: {
          provider: "openai-compatible",
          baseUrl: "http://127.0.0.1:8880/v1",
          openaiModel: "kokoro",
        },
      }),
    ).toEqual({
      tts: {
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:8880/v1",
        openaiModel: "kokoro",
      },
    });
    expect(parseConfigPatch({ tts: { openaiModel: "tts-1" } })).toEqual({ tts: { openaiModel: "tts-1" } });
  });

  it("accepts a provider-only patch so a switch cannot wipe credentials or voices", () => {
    const patch = parseConfigPatch({ tts: { provider: "openai-compatible" } });
    expect(patch).toEqual({ tts: { provider: "openai-compatible" } });
    expect(patch.tts).not.toHaveProperty("voice");
    expect(patch.tts).not.toHaveProperty("openaiVoice");
    expect(patch.tts).not.toHaveProperty("key");
    expect(patch.tts).not.toHaveProperty("openaiKey");
  });
});

describe("OpenCode Go configuration", () => {
  it("injects the key only into OpenCode Go instances", () => {
    const cfg: AppConfig = {
      opencodeGo: { apiKey: "secret-value" },
      instances: {
        opencode: { driver: "opencodeGo" },
        grok: { driver: "grokAgent" },
      },
    };

    const instances = instanceConfigs(cfg);
    expect(instances.opencode.environment).toEqual({ OPENCODE_API_KEY: "secret-value" });
    expect(instances.grok.environment).toEqual({});
  });
});
