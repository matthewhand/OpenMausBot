import { describe, expect, it } from "vitest";

import {
  parseRecentModelPicks,
  rankEngineRail,
  recentInstanceIds,
  recentModelIdsFor,
  rememberModelPick,
  seedRecentModelPicks,
} from "./model-picker-recency";

describe("rememberModelPick", () => {
  it("moves a new pick to the front without duplicating", () => {
    const first = rememberModelPick([], "grok", "grok-4.6");
    const second = rememberModelPick(first, "antigravity", "gemini-3.7-flash-medium");
    const again = rememberModelPick(second, "grok", "grok-4.6");
    expect(again.map((pick) => `${pick.instanceId}:${pick.model}`)).toEqual([
      "grok:grok-4.6",
      "antigravity:gemini-3.7-flash-medium",
    ]);
  });
});

describe("seedRecentModelPicks", () => {
  it("keeps stored recents ahead of workspace selections", () => {
    const seeded = seedRecentModelPicks(
      [{ instanceId: "grok", model: "grok-4.6" }],
      [
        { instanceId: "antigravity", model: "gemini-3.7-flash-medium" },
        { instanceId: "grok", model: "grok-4.6" },
      ],
    );
    expect(seeded).toEqual([
      { instanceId: "grok", model: "grok-4.6" },
      { instanceId: "antigravity", model: "gemini-3.7-flash-medium" },
    ]);
  });
});

describe("rankEngineRail", () => {
  const engines = [
    { instanceId: "claude", ready: false },
    { instanceId: "grok", ready: true },
    { instanceId: "kimi", ready: false },
    { instanceId: "antigravity", ready: true },
    { instanceId: "codex", ready: true },
  ];

  it("puts recent engines first, then other ready engines", () => {
    expect(
      rankEngineRail(engines, ["antigravity", "kimi"], (engine) => engine.ready).map(
        (engine) => engine.instanceId,
      ),
    ).toEqual(["antigravity", "kimi", "grok", "codex", "claude"]);
  });

  it("ignores recent ids that are not on the rail", () => {
    expect(
      rankEngineRail(engines, ["missing", "grok"], (engine) => engine.ready).map(
        (engine) => engine.instanceId,
      ),
    ).toEqual(["grok", "antigravity", "codex", "claude", "kimi"]);
  });
});

describe("recent helpers", () => {
  it("dedupes engines in recency order", () => {
    const picks = [
      { instanceId: "grok", model: "grok-4.6" },
      { instanceId: "grok", model: "grok-4.5" },
      { instanceId: "antigravity", model: "flash" },
    ];
    expect(recentInstanceIds(picks)).toEqual(["grok", "antigravity"]);
    expect(recentModelIdsFor(picks, "grok")).toEqual(["grok-4.6", "grok-4.5"]);
  });

  it("drops malformed localStorage payloads", () => {
    expect(parseRecentModelPicks("{")).toEqual([]);
    expect(parseRecentModelPicks('[{"instanceId":"grok"}]')).toEqual([]);
    expect(parseRecentModelPicks('[{"instanceId":"grok","model":"grok-4.6"}]')).toEqual([
      { instanceId: "grok", model: "grok-4.6" },
    ]);
  });
});
