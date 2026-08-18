import { describe, expect, it } from "vitest";

import { commPopupMessages, isCommChipMessage } from "./comm-popup";
import type { Message } from "@/state/store";

const msg = (partial: Partial<Message> & Pick<Message, "kind">): Message => ({
  id: partial.id ?? "m",
  at: partial.at ?? 1,
  kind: partial.kind,
  role: partial.role ?? "bot",
  text: partial.text,
  tool: partial.tool,
  from: partial.from,
  comm: partial.comm,
});

describe("commPopupMessages", () => {
  it("keeps mirrored texts and activity notes, drops empty and screen rows", () => {
    const kept = commPopupMessages([
      msg({ kind: "text", text: "please review the PR", from: { botId: "a", name: "Ada", color: "green" } }),
      msg({ kind: "activity", tool: { name: "Delegated turn finished", ok: true } }),
      msg({ kind: "text", text: "   " }),
      msg({ kind: "screen", png: "abcd" }),
      msg({ kind: "text", text: "looks good", from: { botId: "b", name: "Ben", color: "orange" } }),
    ]);
    expect(kept.map((m) => m.kind + (m.text ?? m.tool?.name))).toEqual([
      "textplease review the PR",
      "activityDelegated turn finished",
      "textlooks good",
    ]);
  });

  it("drops permission cards, connector rows, and nameless activity", () => {
    const kept = commPopupMessages([
      msg({ kind: "options", card: { requestId: "r1", tool: "Write" } as Message["card"] }),
      msg({
        kind: "connector",
        connector: {
          slug: "github",
          label: "GitHub",
          description: "Connect GitHub",
          status: "required",
          resumeKey: "rk",
        },
      }),
      msg({ kind: "activity" }),
      msg({ kind: "activity", tool: { name: "", ok: true } }),
      msg({ kind: "activity", tool: { name: "failed turn", ok: false } }),
    ]);
    expect(kept.map((m) => m.tool?.name)).toEqual(["failed turn"]);
  });

  it("returns an empty list for an empty thread", () => {
    expect(commPopupMessages([])).toEqual([]);
  });
});

describe("isCommChipMessage", () => {
  const comm = { groupId: "g", withBotId: "b", withName: "Ben", withColor: "orange" as const };

  // GroupView used to render <CommChip> on activity+comm even without a
  // tool; the chip returned null and left an empty cluster row.
  it("is not a popup chip when a comm activity has no tool", () => {
    expect(isCommChipMessage(msg({ kind: "activity", comm }))).toBe(false);
    expect(isCommChipMessage(msg({ kind: "activity", comm, tool: { name: "Messaged @Ben" } }))).toBe(true);
    expect(isCommChipMessage(msg({ kind: "activity", tool: { name: "Read" } }))).toBe(false);
  });
});
