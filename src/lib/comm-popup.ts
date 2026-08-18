import type { Message } from "@/state/store";

/** Popup chip only when comm metadata and a tool label both exist.
 * Mounting on `comm` alone leaves an empty GroupView row: CommChip
 * returns null, but the cluster wrapper still renders. */
export function isCommChipMessage(
  m: Pick<Message, "comm" | "tool">,
): m is { comm: NonNullable<Message["comm"]>; tool: NonNullable<Message["tool"]> } {
  return Boolean(m.comm && m.tool);
}

/** Messages worth showing in the bot⇄bot exchange popup: the mirrored
 * texts plus terminal activity notes. Permission cards and screens stay
 * on the full room. */
export function commPopupMessages(messages: Message[]): Message[] {
  return messages.filter(
    (m) =>
      (m.kind === "text" && Boolean(m.text?.trim())) ||
      (m.kind === "activity" && Boolean(m.tool?.name)),
  );
}
