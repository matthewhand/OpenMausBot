import { Check, ChevronRight, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, type Message } from "@/state/store";

/** A tool run: spinner while live, check/cross once settled. Click opens
 * the Inspector on that tool's runtime event (or the raw protocol line). */
export function ActivityChip({ message, threadId }: { message: Message; threadId: string }) {
  const { dispatch } = useStore();
  const tool = message.tool;
  if (!tool) return null;
  const failed = tool.ok === false;
  return (
    <div className="flex justify-start">
      <button
        type="button"
        onClick={() =>
          dispatch({
            type: "focusInspector",
            threadId,
            itemId: tool.itemId,
            toolName: tool.name,
            at: message.at,
          })
        }
        title={`Inspect ${tool.name}`}
        className={cn(
          "flex items-center gap-2 rounded-full border border-hairline/40 bg-panel px-3 py-1.5 text-[13px] hover:bg-raised hover:text-ink",
          failed ? "text-danger" : "text-ink-secondary",
        )}
      >
        {tool.ok === undefined ? (
          <Loader2 size={13} className="animate-spin" />
        ) : failed ? (
          <X size={13} />
        ) : (
          <Check size={13} className="text-success" />
        )}
        <span className="max-w-[480px] truncate font-mono">{tool.name}</span>
        <ChevronRight size={13} />
      </button>
    </div>
  );
}
