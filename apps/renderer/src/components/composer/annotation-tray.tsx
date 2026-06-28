import {
  ArrowDown01Icon,
  BubbleChatIcon,
} from "@hugeicons-pro/core-bulk-rounded";
import { HugeiconsIcon } from "@hugeicons/react";
import { X } from "lucide-react";
import { useState } from "react";

import {
  isElementAnnotation,
  type Annotation,
  type FolderId,
  type SessionId,
  type WorktreeId,
} from "@memoize/wire";

import { cn } from "~/lib/utils";

import { useAnnotationsStore } from "../../store/annotations.ts";
import { useRevealAnnotation } from "../annotation/annotation-navigation.ts";

const EMPTY: ReadonlyArray<Annotation> = [];

const basename = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
};

/** Short, single-line source label for an annotation row. */
const shortLabel = (a: Annotation): string => {
  if (isElementAnnotation(a)) {
    if (a.text !== undefined && a.text.length > 0) return `“${a.text}”`;
    return a.label;
  }
  const range =
    a.startLine === a.endLine ? `${a.startLine}` : `${a.startLine}-${a.endLine}`;
  return `${basename(a.relPath)}:${range}`;
};

/**
 * Compact stacked annotations docked in the composer tray box. One row per
 * comment: the note on the left, its source target on the right, edit/remove on
 * hover. Collapsible; the whole list drains into the next submit (or the plan
 * Approve / Cancel).
 */
export function AnnotationTray({
  sessionId,
  folderId,
  worktreeId,
}: {
  sessionId: SessionId;
  folderId: FolderId | null;
  worktreeId: WorktreeId | null;
}) {
  const annotations = useAnnotationsStore(
    (s) => s.bySession[sessionId] ?? EMPTY,
  );
  const remove = useAnnotationsStore((s) => s.remove);
  const updateComment = useAnnotationsStore((s) => s.updateComment);
  const clear = useAnnotationsStore((s) => s.clear);
  const [expanded, setExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const revealAnnotation = useRevealAnnotation({ folderId, worktreeId });

  if (annotations.length === 0) return null;

  return (
    <div className="border-b border-border/40 bg-card/20">
      <div className="flex w-full items-center gap-1.5 px-2 py-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-5 flex-1 items-center gap-1.5 text-left"
        >
          <HugeiconsIcon
            icon={BubbleChatIcon}
            className="size-3 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="text-[11px] font-medium text-foreground">
            Annotations
          </span>
          <span className="rounded bg-muted/60 px-1 text-[9px] font-medium tabular-nums text-muted-foreground">
            {annotations.length}
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              "ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded ? "rotate-180" : "",
            )}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={() => clear(sessionId)}
          className="shrink-0 rounded px-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
      </div>
      {expanded ? (
        <ul className="max-h-36 overflow-y-auto px-1 pb-1">
          {annotations.map((a) => (
            <li
              key={a.id}
              className="group/a flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-muted/40"
            >
              {editingId === a.id ? (
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={() => {
                    updateComment(sessionId, a.id, editText);
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingId(null);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      updateComment(sessionId, a.id, editText);
                      setEditingId(null);
                    }
                  }}
                  className="min-w-0 flex-1 rounded bg-background/80 px-1.5 py-0.5 text-xs text-foreground outline-none ring-1 ring-border/50"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(a.id);
                    setEditText(a.comment);
                  }}
                  className="min-w-0 flex-1 truncate text-left text-xs leading-5 text-foreground"
                  title="Edit comment"
                >
                  {a.comment}
                </button>
              )}
              <button
                type="button"
                onClick={() => revealAnnotation(a)}
                className="max-w-[42%] shrink-0 truncate text-right font-mono text-[10px] text-muted-foreground/80 hover:text-foreground"
                title={shortLabel(a)}
              >
                {shortLabel(a)}
              </button>
              <button
                type="button"
                onClick={() => remove(sessionId, a.id)}
                className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-foreground group-hover/a:opacity-100"
                aria-label="Remove annotation"
              >
                <X className="size-3" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
