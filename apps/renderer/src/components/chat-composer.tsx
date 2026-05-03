import { Send, Square } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { Message, Session, SessionId } from "@forkzero/wire";

import { useMessagesStore } from "../store/messages.ts";

const MIN_HEIGHT = 56;
const MAX_HEIGHT = 240;

// Stable empty-array reference; see chat-view.tsx for rationale.
const EMPTY_MESSAGES: ReadonlyArray<Message> = [];

/**
 * Heuristic for "we're awaiting an LLM response": the most recent message is
 * either the user's submit or a tool_use without its paired tool_result yet.
 * Coarse but stable; PR 7 may swap it for a real session-status subscription.
 */
const inferInFlight = (messages: ReadonlyArray<Message>): boolean => {
  if (messages.length === 0) return false;
  const last = messages[messages.length - 1]!;
  return last.content._tag === "user" || last.content._tag === "tool_use";
};

export function ChatComposer({ session }: { session: Session }) {
  const sessionId: SessionId = session.id;
  const messages = useMessagesStore(
    (s) => s.messagesBySession[sessionId] ?? EMPTY_MESSAGES,
  );
  const send = useMessagesStore((s) => s.send);
  const interrupt = useMessagesStore((s) => s.interrupt);

  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const inFlight = useMemo(() => inferInFlight(messages), [messages]);
  const canSend = !inFlight && value.trim().length > 0;

  const submit = async () => {
    const text = value.trim();
    if (text.length === 0 || inFlight) return;
    setValue("");
    if (textareaRef.current !== null) {
      textareaRef.current.style.height = `${MIN_HEIGHT}px`;
    }
    await send(sessionId, text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  // Auto-grow the textarea up to MAX_HEIGHT, then scroll internally.
  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const ta = e.target;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, ta.scrollHeight))}px`;
  };

  return (
    <div className="shrink-0 border-t border-border bg-zinc-900 px-3 pb-3 pt-2">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-2 py-1.5 focus-within:ring-1 focus-within:ring-primary/40">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder="Send a message…  ⌘+Enter to send"
            rows={1}
            style={{ height: MIN_HEIGHT }}
            className="flex-1 resize-none bg-transparent px-1 py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          {inFlight ? (
            <button
              type="button"
              onClick={() => void interrupt(sessionId)}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive text-destructive-foreground hover:opacity-90"
              aria-label="Interrupt"
              title="Interrupt"
            >
              <Square className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSend}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send"
              title="Send (⌘+Enter)"
            >
              <Send className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground">
          <span>
            {session.providerId} · {session.model}
          </span>
          <span>
            {inFlight ? "running…" : "idle"}
          </span>
        </div>
      </div>
    </div>
  );
}
