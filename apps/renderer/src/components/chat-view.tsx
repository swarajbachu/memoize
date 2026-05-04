import { MessageSquare } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type { AgentItemId, Message, SessionId } from "@forkzero/wire";

import { useMessagesStore } from "../store/messages.ts";
import { useSessionsStore } from "../store/sessions.ts";
import { MessageRow, type ToolResultRecord } from "./message-row.tsx";

const NEAR_BOTTOM_PX = 80;

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
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              resultsByItemId={resultsByItemId}
            />
          ))}
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
