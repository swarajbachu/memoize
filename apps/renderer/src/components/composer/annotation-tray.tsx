import {
  ArrowDown01Icon,
  BubbleChatIcon,
  Cancel01Icon,
} from "@hugeicons-pro/core-bulk-rounded";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import type { CodeAnnotation, SessionId } from "@memoize/wire";

import { cn } from "~/lib/utils";

import { useAnnotationsStore } from "../../store/annotations.ts";
import { AnnotationFileChip } from "../file-chip.tsx";

const EMPTY: ReadonlyArray<CodeAnnotation> = [];

/**
 * Stacked code annotations docked above the composer, mirroring the reference
 * screenshots: a collapsible "N Annotations" header with a clear-all action,
 * expanding to one removable row per pinned comment. They drain into the
 * outgoing `ComposerInput` on submit (see the composer's `submit` handler).
 * Renders nothing until the focused session has at least one annotation.
 */
export function AnnotationTray({ sessionId }: { sessionId: SessionId }) {
  const annotations = useAnnotationsStore(
    (s) => s.bySession[sessionId] ?? EMPTY,
  );
  const remove = useAnnotationsStore((s) => s.remove);
  const clear = useAnnotationsStore((s) => s.clear);
  const [expanded, setExpanded] = useState(true);

  if (annotations.length === 0) return null;

  const count = annotations.length;

  return (
    <div className="mb-1.5 overflow-hidden rounded-lg border border-border/60 bg-card">
      <div className="flex w-full items-center gap-2 bg-primary/10 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <HugeiconsIcon
            icon={BubbleChatIcon}
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="text-sm font-medium">
            {count} {count === 1 ? "Annotation" : "Annotations"}
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
              expanded ? "rotate-180" : "",
            )}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={() => clear(sessionId)}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
          aria-label="Clear all annotations"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </button>
      </div>
      {expanded ? (
        <ul className="max-h-56 space-y-0.5 overflow-y-auto px-2 py-1.5">
          {annotations.map((a, i) => (
            <li
              key={a.id}
              className="group/annotation flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-background/60"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-medium tabular-nums text-foreground">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-sm text-foreground">
                {a.comment}
              </span>
              <AnnotationFileChip annotation={a} className="max-w-[42%]" />
              <button
                type="button"
                onClick={() => remove(sessionId, a.id)}
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover/annotation:opacity-100"
                aria-label="Remove annotation"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
