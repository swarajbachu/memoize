import {
  BubbleChatIcon,
  CheckListIcon,
  Maximize02Icon,
  Tick01Icon,
} from "@hugeicons-pro/core-bulk-rounded";
import { HugeiconsIcon } from "@hugeicons/react";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { useUiStore } from "~/store/ui";

import { useAddAnnotation } from "../annotation/use-add-annotation.ts";

interface PendingPick {
  readonly selector: string;
  readonly label: string;
  readonly text?: string;
  readonly x: number;
  readonly y: number;
}

/** Build a best-effort unique CSS selector for `el` within `root`. */
const selectorWithin = (root: HTMLElement, el: HTMLElement): string => {
  if (el === root) return "body";
  const parts: string[] = [];
  let node: HTMLElement | null = el;
  while (node !== null && node !== root && node.nodeType === 1) {
    if (node.id !== "") {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    let tag = node.tagName.toLowerCase();
    const parent: HTMLElement | null = node.parentElement;
    if (parent !== null) {
      const tagName = node.tagName;
      const same = Array.from(parent.children).filter(
        (c) => c.tagName === tagName,
      );
      if (same.length > 1) tag += `:nth-of-type(${same.indexOf(node) + 1})`;
    }
    parts.unshift(tag);
    node = node.parentElement;
  }
  return parts.length > 0 ? parts.join(" > ") : "body";
};

/** Human label: tag + a slice of the element's visible text. */
const labelFor = (el: HTMLElement): string => {
  const text = (el.innerText || el.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
  const tag = el.tagName.toLowerCase();
  return text.length > 0 ? `${tag} "${text}"` : tag;
};

/**
 * Wraps rendered content (a plan, rendered via the app's own MarkdownBody so it
 * matches the chat's look and flows to full height) and makes it annotatable.
 * Toggling Annotate turns the content into a click/select target: clicking an
 * element or selecting text pins a comment that drops into the same composer
 * tray as code annotations and travels to the agent on the next turn.
 *
 * In-DOM (no iframe) on purpose — plans are app-rendered markdown, so real React
 * event handling + the app's theme beat a sandboxed white box. The iframe
 * `HtmlArtifact` stays for genuine agent-authored HTML, where isolation matters.
 */
export function AnnotatableArtifact({
  sourceRef,
  title = "Plan",
  rawSource,
  children,
}: {
  readonly sourceRef: string;
  readonly title?: string;
  /** Raw markdown body — enables the Expand-to-full-pane control when set. */
  readonly rawSource?: string;
  readonly children: ReactNode;
}) {
  const openFileInTab = useUiStore((s) => s.openFileInTab);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [annotate, setAnnotate] = useState(false);
  const [pending, setPending] = useState<PendingPick | null>(null);
  const [comment, setComment] = useState("");
  const addAnnotation = useAddAnnotation();

  useEffect(() => {
    if (pending !== null) textareaRef.current?.focus();
  }, [pending]);

  useEffect(() => {
    if (!annotate) setPending(null);
  }, [annotate]);

  const pickFromEvent = (
    target: HTMLElement,
    clientX: number,
    clientY: number,
    text?: string,
  ) => {
    const root = containerRef.current;
    if (root === null || !root.contains(target)) return;
    setComment("");
    setPending({
      selector: selectorWithin(root, target),
      label: labelFor(target),
      ...(text !== undefined ? { text } : {}),
      x: clientX,
      y: clientY,
    });
  };

  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!annotate) return;
    // A drag-select ends in a click too; let the text path own that case.
    if (String(window.getSelection() ?? "").trim().length > 0) return;
    e.preventDefault();
    e.stopPropagation();
    pickFromEvent(e.target as HTMLElement, e.clientX, e.clientY);
  };

  const onMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!annotate) return;
    const sel = window.getSelection();
    const text = sel !== null ? sel.toString().replace(/\s+/g, " ").trim() : "";
    if (text.length === 0) return;
    const anchor = sel?.anchorNode ?? null;
    const el =
      anchor !== null && anchor.nodeType === 3
        ? anchor.parentElement
        : (anchor as HTMLElement | null);
    if (el === null) return;
    pickFromEvent(el, e.clientX, e.clientY, text.slice(0, 200));
  };

  const confirm = () => {
    if (pending === null) return;
    const trimmed = comment.trim();
    if (trimmed.length === 0) {
      setPending(null);
      return;
    }
    addAnnotation({
      _tag: "element",
      sourceRef,
      selector: pending.selector,
      label: pending.label,
      ...(pending.text !== undefined ? { text: pending.text } : {}),
      comment: trimmed,
    });
    setPending(null);
    setComment("");
  };

  const popupStyle =
    pending === null
      ? undefined
      : ({
          top: Math.min(pending.y + 8, window.innerHeight - 180),
          left: Math.min(Math.max(8, pending.x), window.innerWidth - 312),
          width: 300,
        } as const);

  return (
    <div className="my-1 overflow-hidden rounded-lg border border-border/50 bg-card/40">
      {annotate ? (
        <style>{`.mz-annotating, .mz-annotating *{cursor:crosshair!important}.mz-annotating *:hover{outline:2px solid #84cc16;outline-offset:2px;border-radius:3px}`}</style>
      ) : null}
      <div className="flex items-center gap-2 border-b border-border/40 bg-muted/15 px-3 py-1.5">
        <HugeiconsIcon
          icon={CheckListIcon}
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-muted-foreground">
          {title}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {rawSource !== undefined ? (
            <button
              type="button"
              onClick={() =>
                openFileInTab({
                  kind: "artifact",
                  format: "markdown",
                  source: rawSource,
                  title,
                  sourceRef,
                })
              }
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
              aria-label="Open full size"
            >
              <HugeiconsIcon icon={Maximize02Icon} className="size-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setAnnotate((v) => !v)}
            aria-pressed={annotate}
            className={cn(
              "flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium",
              annotate
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "text-muted-foreground hover:bg-background hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={BubbleChatIcon} className="size-3.5" />
            Annotate
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onClickCapture={onClickCapture}
        onMouseUp={onMouseUp}
        className={cn("px-3 py-2", annotate && "mz-annotating")}
      >
        {children}
      </div>

      {annotate ? (
        <div className="border-t border-border/40 bg-muted/10 px-3 py-1 text-[11px] text-muted-foreground">
          Click any element or select text above to leave a comment for the
          agent.
        </div>
      ) : null}

      {pending !== null && popupStyle !== undefined ? (
        <div
          className="fixed z-50"
          style={popupStyle}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="w-full rounded-lg border border-border/70 bg-popover p-2 shadow-lg">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={BubbleChatIcon} className="size-3.5" />
              <span className="min-w-0 truncate font-medium text-foreground">
                {pending.text !== undefined
                  ? `"${pending.text.slice(0, 32)}"`
                  : pending.label}
              </span>
            </div>
            <textarea
              ref={textareaRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setPending(null);
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  confirm();
                }
              }}
              rows={2}
              placeholder="Add a comment…"
              className="max-h-32 min-h-14 w-full resize-y rounded-md bg-background/80 px-2 py-1.5 text-xs leading-relaxed text-foreground outline-none ring-0 placeholder:text-muted-foreground/70 focus:bg-background"
            />
            <div className="mt-1.5 flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label="Cancel annotation"
              >
                <X className="size-3.5" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={comment.trim().length === 0}
                className="flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                aria-label="Add annotation"
              >
                <HugeiconsIcon icon={Tick01Icon} className="size-3.5" />
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
