import {
  ArrowDown01Icon,
  BubbleChatIcon,
} from "@hugeicons-pro/core-bulk-rounded";
import { HugeiconsIcon } from "@hugeicons/react";
import { X } from "lucide-react";
import { useState } from "react";

import type { CodeAnnotation, SessionId } from "@memoize/wire";

import { cn } from "~/lib/utils";

import { useAnnotationsStore } from "../../store/annotations.ts";
import { FileIcon } from "../file-icon.tsx";

const EMPTY: ReadonlyArray<CodeAnnotation> = [];

const basename = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
};

const rangeLabel = (a: CodeAnnotation): string =>
  a.startLine === a.endLine ? `${a.startLine}` : `${a.startLine}-${a.endLine}`;

function AnnotationFileBadge({ annotation }: { annotation: CodeAnnotation }) {
  const name = basename(annotation.relPath);
  const range = rangeLabel(annotation);
  return (
    <span
      className="inline-flex max-w-[42%] shrink-0 items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground"
      title={`${annotation.relPath}:${range}`}
    >
      <FileIcon
        name={name}
        kind="file"
        className="inline-flex size-3.5 shrink-0 items-center justify-center"
      />
      <span className="min-w-0 truncate font-mono">{name}</span>
      <span className="shrink-0 font-mono tabular-nums">:{range}</span>
    </span>
  );
}

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
    <div className="mb-1.5 overflow-hidden rounded-xl border border-border/50 bg-card/60">
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
          <X className="size-3.5" strokeWidth={1.8} />
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
              <AnnotationFileBadge annotation={a} />
              <button
                type="button"
                onClick={() => remove(sessionId, a.id)}
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover/annotation:opacity-100"
                aria-label="Remove annotation"
              >
                <X className="size-3.5" strokeWidth={1.8} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
