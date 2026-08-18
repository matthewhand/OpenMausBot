import { useEffect, useRef, useState } from "react";
import { ChevronRight, ExternalLink, X } from "lucide-react";
import { formatTime, useStore, type Message } from "@/state/store";
import { MausAvatar } from "./Avatar";
import { ChatMarkdown } from "./ChatMarkdown";
import { commPopupMessages } from "@/lib/comm-popup";
import { cn } from "@/lib/cn";
import { focusable, wrapTab } from "@/lib/focus-trap";
import type { MausColor } from "@/lib/mascot";

/** Clickable "Messaged @X" pill — used in 1:1 and rooms. */
export function CommChip({ message }: { message: Message }) {
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const comm = message.comm;

  useEffect(() => {
    if (!open) return;
    return () => {
      chipRef.current?.focus();
    };
  }, [open]);

  if (!comm || !message.tool) return null;
  return (
    <div className="flex justify-start">
      <button
        ref={chipRef}
        onClick={() => setOpen(true)}
        title={`View the conversation with ${comm.withName}`}
        className="flex items-center gap-2 rounded-full border border-hairline/40 bg-panel px-3 py-1.5 text-[13px] text-ink-secondary hover:bg-raised hover:text-ink"
      >
        <MausAvatar color={comm.withColor} state="happy" size={16} />
        <span className="max-w-[480px] truncate">{message.tool.name}</span>
        <ChevronRight size={13} />
      </button>
      {open && (
        <CommPopup
          groupId={comm.groupId}
          withName={comm.withName}
          withColor={comm.withColor}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function CommPopup({
  groupId,
  withName,
  withColor,
  onClose,
}: {
  groupId: string;
  withName: string;
  withColor: MausColor;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const group = state.groups.find((g) => g.id === groupId);
  const messages = commPopupMessages(group?.messages ?? []);
  const tailRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    tailRef.current?.scrollTo({ top: tailRef.current.scrollHeight });
  }, [messages.length, group?.busyBotId]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = focusable(root);
      const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const inCycle = current != null && items.includes(current);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      if (!inCycle || (e.shiftKey ? current === items[0] : current === items[items.length - 1])) {
        e.preventDefault();
        wrapTab(items, inCycle ? current : null, e.shiftKey)?.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  const send = () => {
    const text = draft.trim();
    if (!text || !group) return;
    dispatch({ type: "sendGroup", groupId: group.id, text });
    setDraft("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="comm-popup-title"
        className="animate-pop-in flex max-h-[min(640px,calc(100dvh-2rem))] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-hairline/50 bg-panel shadow-2xl outline-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-hairline/30 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MausAvatar color={withColor} state="happy" size={22} />
              <h2 id="comm-popup-title" className="truncate text-[16px] font-semibold text-ink">
                {group?.name ?? `Exchange with ${withName}`}
              </h2>
            </div>
            <p className="mt-1 text-[12.5px] text-ink-secondary">
              Bot-to-bot thread. You can read it here or jump into the room.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {group && (
              <button
                onClick={() => {
                  dispatch({ type: "select", id: group.id });
                  onClose();
                }}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink-secondary hover:bg-raised hover:text-ink"
                title="Open the full room"
              >
                <ExternalLink size={13} /> Open room
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close exchange"
              className="rounded-lg p-1.5 text-ink-secondary hover:bg-raised hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div ref={tailRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {!group && (
            <div className="py-10 text-center text-[13px] text-ink-secondary">This exchange is no longer available.</div>
          )}
          {group && messages.length === 0 && (
            <div className="py-10 text-center text-[13px] text-ink-secondary">No messages in this exchange yet.</div>
          )}
          {messages.map((m) => (
            <CommPopupRow key={m.id} message={m} />
          ))}
        </div>

        {group && (
          <form
            className="flex gap-2 border-t border-hairline/30 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Chime in with ${withName}…`}
              className="min-w-0 flex-1 rounded-xl bg-raised/70 px-3 py-2 text-[14px] text-ink placeholder:text-ink-secondary focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="rounded-xl bg-raised px-3 py-2 text-[13px] text-ink hover:bg-raised-hover disabled:opacity-40"
            >
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function CommPopupRow({ message }: { message: Message }) {
  if (message.kind === "activity" && message.tool) {
    return (
      <div className="flex justify-start">
        <div
          className={cn(
            "rounded-full border border-hairline/40 bg-card px-3 py-1 text-[12.5px]",
            message.tool.ok === false ? "text-danger" : "text-ink-secondary",
          )}
        >
          {message.tool.name}
        </div>
      </div>
    );
  }
  const user = message.role === "user";
  return (
    <div className={cn("flex flex-col", user ? "items-end" : "items-start")}>
      {!user && message.from && (
        <div className="mb-1 flex items-center gap-1.5 pl-0.5">
          <MausAvatar color={message.from.color} state="happy" size={14} />
          <span className="text-[11px] font-medium text-ink-secondary">{message.from.name}</span>
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed",
          user ? "whitespace-pre-wrap bg-bubble-user text-ink" : "bg-card text-ink",
        )}
        title={new Date(message.at).toLocaleString()}
      >
        {user ? message.text : <ChatMarkdown text={message.text ?? ""} />}
      </div>
      <span className="mt-0.5 px-1 text-[10.5px] tabular-nums text-ink-secondary/70">{formatTime(message.at)}</span>
    </div>
  );
}
