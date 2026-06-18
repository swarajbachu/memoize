import {
  ArrowDown01Icon,
  CheckListIcon,
  Tick02Icon,
} from "@hugeicons-pro/core-bulk-rounded";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";

import type { Message, SessionId } from "@memoize/wire";

import { Beacon } from "~/components/ui/loaders";
import { cn } from "~/lib/utils";

import { useMessagesStore } from "../../store/messages.ts";

type TodoStatus = "pending" | "in_progress" | "completed";

interface Todo {
  readonly text: string;
  readonly status: TodoStatus;
}

const EMPTY_MESSAGES: ReadonlyArray<Message> = [];

const asString = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const asStatus = (v: unknown): TodoStatus => {
  if (v === "completed" || v === "in_progress") return v;
  return "pending";
};

/** Normalize a raw `[{ content, activeForm, status }]` array into our shape. */
const toTodos = (raw: unknown): Todo[] => {
  if (!Array.isArray(raw)) return [];
  const out: Todo[] = [];
  for (const t of raw) {
    if (t === null || typeof t !== "object") continue;
    const r = t as Record<string, unknown>;
    const text = asString(r.content) ?? asString(r.activeForm) ?? "";
    if (text.length === 0) continue;
    out.push({ text, status: asStatus(r.status) });
  }
  return out;
};

/**
 * Parse a `TodoWrite` tool *input* (`{ todos: [...] }`). This is the shape the
 * Claude driver emits directly on the tool_use event.
 */
const parseTodosFromInput = (input: unknown): Todo[] => {
  if (input === null || typeof input !== "object") return [];
  return toTodos((input as Record<string, unknown>).todos);
};

/**
 * Parse a `TodoWrite` tool *result* `output`. Grok (via ACP) only carries a
 * title on the tool_use input — the actual list arrives on the tool_result as
 * `{ type: "Todo", TodosUpdated: { todos: [{ content, priority, status }] } }`.
 * We detect that self-identifying shape so we don't mistake an unrelated
 * tool result for a plan.
 */
const parseTodosFromOutput = (output: unknown): Todo[] => {
  if (output === null || typeof output !== "object") return [];
  const o = output as Record<string, unknown>;
  const updated = o.TodosUpdated;
  if (updated !== null && typeof updated === "object") {
    const todos = toTodos((updated as Record<string, unknown>).todos);
    if (todos.length > 0) return todos;
  }
  if (o.type === "Todo") return toTodos(o.todos);
  return [];
};

/**
 * "Project Plan" panel docked above the composer. Surfaces the agent's latest
 * `TodoWrite` list (all drivers normalize the tool name to `TodoWrite`) as a
 * glanceable, collapsible progress view: header with an `X of Y Done` count and
 * a spinner while the turn runs, expanding to a timeline of items with per-item
 * status icons. Renders nothing until a session has produced a TodoWrite list,
 * and persists after the turn ends.
 */
export function ProjectPlanTray({ sessionId }: { sessionId: SessionId }) {
  // Select the stable message-array reference and derive the latest plan with
  // useMemo — selecting a freshly-built array would re-render on every store tick.
  const messages = useMessagesStore(
    (s) => s.messagesBySession[sessionId] ?? EMPTY_MESSAGES,
  );
  const running = useMessagesStore(
    (s) => s.runningBySession[sessionId] === true,
  );

  // Collapsed by default; keyed per session so the expand state doesn't bleed
  // across session switches (see `key` at the call site).
  const [expanded, setExpanded] = useState(false);

  const todos = useMemo(() => {
    // Walk newest→oldest and take the first TodoWrite signal we find, from
    // either source: Claude puts the list on the tool_use input; Grok (ACP)
    // puts it on the tool_result output. Whichever is latest wins.
    for (let i = messages.length - 1; i >= 0; i--) {
      const c = messages[i]!.content;
      if (c._tag === "tool_use" && c.tool === "TodoWrite") {
        const parsed = parseTodosFromInput(c.input);
        if (parsed.length > 0) return parsed;
      } else if (c._tag === "tool_result") {
        const parsed = parseTodosFromOutput(c.output);
        if (parsed.length > 0) return parsed;
      }
    }
    return [];
  }, [messages]);

  if (todos.length === 0) return null;

  const done = todos.filter((t) => t.status === "completed").length;
  const total = todos.length;
  const allDone = done === total;

  return (
    <div className="mb-1.5 overflow-hidden rounded-xl border border-border/50 bg-card/60">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
          "bg-primary/10 hover:bg-primary/15",
        )}
      >
        <HugeiconsIcon
          icon={CheckListIcon}
          strokeWidth={2}
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-sm font-medium">Project Plan</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {done} of {total} Done
        </span>
        {running && !allDone ? (
          <Beacon dotSize={2} cellPadding={1} color="currentColor" className="shrink-0 text-muted-foreground" />
        ) : null}
        <HugeiconsIcon icon={ArrowDown01Icon} className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform",
                          expanded ? "rotate-180" : "",
                        )} aria-hidden="true" />
      </button>
      {expanded ? (
        <ul className="max-h-64 space-y-0.5 overflow-y-auto px-3 py-2">
          {todos.map((t, i) => (
            <li key={i} className="relative flex items-start gap-2.5 pb-1.5">
              {/* Dashed timeline connector running between item icons. */}
              {i < todos.length - 1 ? (
                <span
                  className="absolute left-[6.5px] top-4 bottom-0 border-l border-dashed border-border/60"
                  aria-hidden="true"
                />
              ) : null}
              <span className="relative z-10 mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
                <TodoStatusIcon status={t.status} running={running} />
              </span>
              <span
                className={cn(
                  "text-sm leading-snug",
                  t.status === "completed"
                    ? "text-muted-foreground"
                    : "text-foreground",
                )}
              >
                {t.text}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TodoStatusIcon({
  status,
  running,
}: {
  status: TodoStatus;
  running: boolean;
}) {
  if (status === "completed") {
    return (
      <HugeiconsIcon
        icon={Tick02Icon}
        strokeWidth={2.5}
        className="size-3.5 text-primary"
        aria-label="Completed"
      />
    );
  }
  if (status === "in_progress") {
    // Only animate while the turn is actually running. Once the agent stops
    // (or finishes) the item's status stays "in_progress" in the data, so a
    // spinning loader would imply work is still happening when it isn't — and
    // makes the whole composer read as "busy". Show a static filled ring
    // instead to mark "current step, not running".
    if (running)
      return <Beacon dotSize={2} cellPadding={1} color="currentColor" className="text-primary" />;
    return (
      <span
        className="flex size-3.5 items-center justify-center rounded-full border-2 border-primary"
        aria-label="In progress (paused)"
      >
        <span className="size-1 rounded-full bg-primary" />
      </span>
    );
  }
  return (
    <span
      className="size-3 rounded-full border border-dashed border-muted-foreground/50"
      aria-label="Pending"
    />
  );
}
