import { describe, expect, it } from "vitest";
import type { Group } from "./store";

describe("Inline Inter-Agent Chat setting", () => {
  const dummyGroups: Group[] = [
    {
      id: "group-1",
      threadId: "thread-1",
      name: "Engineering Team",
      memberIds: ["bot-1", "bot-2"],
      defaultResponder: { kind: "mentions" },
      bulletin: "",
      unread: false,
      createdAt: 1000,
      dm: false,
      messages: [],
    },
    {
      id: "group-dm-1",
      threadId: "thread-dm-1",
      name: "Coder ⇄ Architect",
      memberIds: ["bot-1", "bot-2"],
      defaultResponder: { kind: "mentions" },
      bulletin: "",
      unread: false,
      createdAt: 2000,
      dm: true,
      messages: [],
    },
  ];

  it("shows both user rooms and bot-to-bot DM channels when inline mode is disabled", () => {
    const inlineInterAgentChat = false;
    const q = "";
    const visible = dummyGroups.filter((g) => {
      if (inlineInterAgentChat && g.dm) return false;
      return !q || g.name.toLowerCase().includes(q);
    });
    expect(visible.map((g) => g.id)).toEqual(["group-1", "group-dm-1"]);
  });

  it("filters out bot-to-bot DM channels from sidebar when inline mode is enabled", () => {
    const inlineInterAgentChat = true;
    const q = "";
    const visible = dummyGroups.filter((g) => {
      if (inlineInterAgentChat && g.dm) return false;
      return !q || g.name.toLowerCase().includes(q);
    });
    expect(visible.map((g) => g.id)).toEqual(["group-1"]);
  });

  it("still allows searching within user rooms when inline mode is enabled", () => {
    const inlineInterAgentChat = true;
    const q = "engineering";
    const visible = dummyGroups.filter((g) => {
      if (inlineInterAgentChat && g.dm) return false;
      return !q || g.name.toLowerCase().includes(q);
    });
    expect(visible.map((g) => g.id)).toEqual(["group-1"]);
  });
});
