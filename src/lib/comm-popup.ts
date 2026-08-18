import type { Message } from "@/state/store";

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
