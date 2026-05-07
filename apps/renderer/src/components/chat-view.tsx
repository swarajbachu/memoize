import { MessageSquare } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type { AgentItemId, Message, SessionId } from "@forkzero/wire";

import { useMessagesStore } from "../store/messages.ts";
import { useSessionsStore } from "../store/sessions.ts";
import { MessageRow, type ToolResultRecord } from "./message-row.tsx";
import { SubagentRow } from "./subagent-row.tsx";

const NEAR_BOTTOM_PX = 80;

type RenderGroup =
  | { readonly kind: "single"; readonly message: Message }
  | {
      readonly kind: "subagent";
      readonly parent: Message;
      readonly parentItemId: AgentItemId;
      readonly agentName: string;
      readonly prompt: string;
      readonly modelRequested: string | undefined;
      readonly children: ReadonlyArray<Message>;
      readonly summary: {
        readonly text: string;
        readonly turns: number;
        readonly durationMs: number;
        readonly model: string;
        readonly isError: boolean;
      } | null;
    };

const isAgentToolUse = (m: Message): boolean =>
  m.content._tag === "tool_use" &&
  (m.content.tool === "Agent" || m.content.tool === "Task");

/**
 * Walk the message log once and produce a flat render order where each
 * `Agent` tool_use becomes a single SubagentRow that owns:
 *   - the parent's `tool_use` row (rendered as the wrapper header),
 *   - every nested message tagged with `parentItemId === parent.itemId`,
 *   - the closing `subagent_summary` row (rendered as the wrapper footer).
 *
 * Top-level messages whose `parentItemId` is set are dropped from the
 * top-level pass — they appear inside the wrapper instead. The paired
 * `tool_result` for the parent Agent tool_use is also dropped (the
 * SubagentSummary is the visible closer). `usage` rows feed the cost
 * footer in Phase 7 and never render in the timeline.
 */
function groupMessages(messages: ReadonlyArray<Message>): ReadonlyArray<RenderGroup> {
  const out: RenderGroup[] = [];

  // First pass: index nested rows by parentItemId so the wrapper can pull
  // its children in O(1) rather than re-walking per Agent.
  const childrenByParent = new Map<AgentItemId, Message[]>();
  const summariesByItemId = new Map<AgentItemId, Message>();
  for (const m of messages) {
    const c = m.content;
    if (c._tag === "subagent_summary") {
      summariesByItemId.set(c.itemId, m);
      continue;
    }
    if ("parentItemId" in c && c.parentItemId !== undefined) {
      const list = childrenByParent.get(c.parentItemId) ?? [];
      list.push(m);
      childrenByParent.set(c.parentItemId, list);
    }
  }

  // Second pass: emit groups in original order. Skip nested children at
  // top level; skip subagent_summary (it's part of the wrapper); skip
  // usage rows entirely; suppress the paired tool_result for Agent
  // tool_uses (replaced by the SubagentSummary footer).
  const agentItemIds = new Set<AgentItemId>();
  for (const m of messages) {
    if (isAgentToolUse(m) && m.content._tag === "tool_use") {
      agentItemIds.add(m.content.itemId);
    }
  }

  for (const m of messages) {
    const c = m.content;
    if (c._tag === "usage") continue;
    if (c._tag === "subagent_summary") continue;
    if ("parentItemId" in c && c.parentItemId !== undefined) continue;
    if (
      c._tag === "tool_result" &&
      agentItemIds.has(c.itemId)
    ) {
      // Suppressed — SubagentSummary supersedes the bare tool_result row.
      continue;
    }
    if (isAgentToolUse(m) && c._tag === "tool_use") {
      const inputObj =
        c.input !== null && typeof c.input === "object"
          ? (c.input as Record<string, unknown>)
          : {};
      const subagentType =
        typeof inputObj.subagent_type === "string"
          ? (inputObj.subagent_type as string)
          : "agent";
      const modelRequested =
        typeof inputObj.model === "string"
          ? (inputObj.model as string)
          : undefined;
      const prompt =
        typeof inputObj.prompt === "string"
          ? (inputObj.prompt as string)
          : typeof inputObj.description === "string"
            ? (inputObj.description as string)
            : "";
      const summaryRow = summariesByItemId.get(c.itemId);
      const summary =
        summaryRow !== undefined &&
        summaryRow.content._tag === "subagent_summary"
          ? {
              text: summaryRow.content.summary,
              turns: summaryRow.content.turns,
              durationMs: summaryRow.content.durationMs,
              model: summaryRow.content.model,
              isError: summaryRow.content.isError,
            }
          : null;
      out.push({
        kind: "subagent",
        parent: m,
        parentItemId: c.itemId,
        agentName: subagentType,
        prompt,
        modelRequested,
        children: childrenByParent.get(c.itemId) ?? [],
        summary,
      });
      continue;
    }
    out.push({ kind: "single", message: m });
  }
  return out;
}

// Stable empty-array reference for the selector below. Returning a fresh
// `[]` from a Zustand selector each call breaks `useSyncExternalStore`'s
// snapshot-equality check and triggers an infinite re-render loop.
const EMPTY_MESSAGES: ReadonlyArray<Message> = [];

/**
 * Read-only timeline of one session. Subscribes to `messages.stream` via the
 * messages store on mount / session-change; the store owns the live fiber.
 * Auto-scrolls to bottom on new messages unless the user has scrolled up out
 * of the "near-bottom" band.
 */
export function ChatView({ sessionId }: { sessionId: SessionId }) {
  const messages = useMessagesStore(
    (s) => s.messagesBySession[sessionId] ?? EMPTY_MESSAGES,
  );
  const error = useMessagesStore((s) => s.errorBySession[sessionId] ?? null);
  const hydrate = useMessagesStore((s) => s.hydrate);

  const session = useSessionsStore((s) => {
    for (const list of Object.values(s.sessionsByProject)) {
      const match = list.find((session) => session.id === sessionId);
      if (match !== undefined) return match;
    }
    return null;
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    void hydrate(sessionId);
  }, [sessionId, hydrate]);

  // Track whether the user is near the bottom of the timeline; if they
  // scroll up, we stop auto-scrolling so reading older context isn't
  // disrupted by streaming new replies.
  const onScroll = () => {
    const el = scrollRef.current;
    if (el === null) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < NEAR_BOTTOM_PX;
  };

  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (el === null) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Pair tool_result rows back to their originating tool_use by AgentItemId.
  // The driver assigns the SDK's tool_use id to both events, so each
  // ToolRow can render its own result inline. We only record results that
  // have a preceding tool_use in this transcript so true orphans (e.g. a
  // dropped tool_use event) still fall through to a standalone error row
  // in MessageRow rather than disappearing silently.
  const resultsByItemId = useMemo(() => {
    const seenUseIds = new Set<AgentItemId>();
    const map = new Map<AgentItemId, ToolResultRecord>();
    for (const m of messages) {
      if (m.content._tag === "tool_use") {
        seenUseIds.add(m.content.itemId);
      } else if (
        m.content._tag === "tool_result" &&
        seenUseIds.has(m.content.itemId)
      ) {
        map.set(m.content.itemId, {
          output: m.content.output,
          isError: m.content.isError,
        });
      }
    }
    return map;
  }, [messages]);

  // Group messages so each `Agent` tool_use renders as a SubagentRow
  // wrapping its nested children + closing summary. Top-level messages
  // pass through unchanged. usage rows feed the cost footer (Phase 7) and
  // are skipped from the chat timeline regardless of nesting depth.
  const groups = useMemo(() => groupMessages(messages), [messages]);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto"
    >
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <MessageSquare className="size-10 opacity-40" />
          <div>
            <p className="text-sm">
              {session?.title ?? "New chat"}
            </p>
            <p className="mt-1 text-xs">
              Type a message below to get started.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col py-2">
          {groups.map((group) => {
            if (group.kind === "single") {
              return (
                <MessageRow
                  key={group.message.id}
                  message={group.message}
                  resultsByItemId={resultsByItemId}
                />
              );
            }
            return (
              <SubagentRow
                key={group.parent.id}
                agentToolUseId={group.parentItemId}
                agentName={group.agentName}
                prompt={group.prompt}
                modelRequested={group.modelRequested}
                children={group.children}
                summary={group.summary}
                resultsByItemId={resultsByItemId}
              />
            );
          })}
        </div>
      )}
      {error !== null && (
        <div className="mx-4 my-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
