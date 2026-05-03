import { MessageSquare } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";

import type { SessionId } from "@forkzero/wire";

import { useMessagesStore } from "../store/messages.ts";
import { useSessionsStore } from "../store/sessions.ts";
import { MessageRow } from "./message-row.tsx";

const NEAR_BOTTOM_PX = 80;

/**
 * Read-only timeline of one session. Subscribes to `messages.stream` via the
 * messages store on mount / session-change; the store owns the live fiber.
 * Auto-scrolls to bottom on new messages unless the user has scrolled up out
 * of the "near-bottom" band.
 */
export function ChatView({ sessionId }: { sessionId: SessionId }) {
  const messages = useMessagesStore(
    (s) => s.messagesBySession[sessionId] ?? [],
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
            <MessageRow key={message.id} message={message} />
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
