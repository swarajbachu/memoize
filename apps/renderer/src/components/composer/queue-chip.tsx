import { ArrowUp, X } from "lucide-react";

import type { SessionId } from "@forkzero/wire";

import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import {
  useMessagesStore,
  type QueuedMessage,
} from "../../store/messages.ts";

const previewText = (q: QueuedMessage): string => {
  const t = q.input.text.trim();
  if (t.length === 0) {
    if (q.input.attachments.length > 0) return `(${q.input.attachments.length} file)`;
    return "(empty)";
  }
  return t.replace(/\s+/g, " ");
};

export function QueueChip({
  sessionId,
  item,
}: {
  sessionId: SessionId;
  item: QueuedMessage;
}) {
  const steer = useMessagesStore((s) => s.steerFromQueue);
  const drop = useMessagesStore((s) => s.dropFromQueue);
  const text = previewText(item);
  const attachmentCount = item.input.attachments.length;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs",
        "max-w-full",
      )}
      title={text}
    >
      <span className="truncate text-foreground">{text}</span>
      {attachmentCount > 0 && (
        <span className="shrink-0 rounded bg-background px-1 text-[10px] text-muted-foreground">
          +{attachmentCount} file
        </span>
      )}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => void steer(sessionId, item.id)}
              aria-label="Steer"
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <ArrowUp className="size-3" />
            </button>
          }
        />
        <TooltipPopup>Steer</TooltipPopup>
      </Tooltip>
      <button
        type="button"
        onClick={() => drop(sessionId, item.id)}
        aria-label="Drop"
        className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
