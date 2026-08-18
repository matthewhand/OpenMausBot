import { describe, expect, it } from "vitest";

import { initialState, reducer, type Bot, type Message } from "./store";

describe("LAN unauthorized hydration", () => {
  it("records 401 as unauthorized, not a down server", () => {
    const next = reducer(initialState, { type: "unauthorized" });
    expect(next.unauthorized).toBe(true);
    expect(next.connected).toBe(false);
  });

  it("clears unauthorized on a successful hydrate", () => {
    const denied = reducer(initialState, { type: "unauthorized" });
    const next = reducer(denied, { type: "hydrate", bots: [], groups: [] });
    expect(next.unauthorized).toBe(false);
  });
});

describe("cross-client bot creation", () => {
  it("adds an announced bot before its greeting frames arrive", () => {
    const announced = {
      id: "phone-bot",
      threadId: "phone-thread",
      name: "Scout",
      title: "",
      description: "",
      notifications: true,
      color: "green",
      unread: false,
      modelSelection: { instanceId: "codex", model: "default" },
    } satisfies Omit<Bot, "messages">;

    const added = reducer(initialState, { type: "botPatched", bot: announced });

    expect(added.bots).toEqual([{ ...announced, messages: [] }]);

    const greeting = {
      id: "greeting",
      role: "bot",
      kind: "text",
      text: "Hey — I'm Scout. Nice to meet you.",
      at: 2,
    } satisfies Message;
    const greeted = reducer(added, {
      type: "messageAdded",
      threadId: announced.threadId,
      message: greeting,
    });

    expect(greeted.bots[0]?.messages).toEqual([greeting]);
  });
});
