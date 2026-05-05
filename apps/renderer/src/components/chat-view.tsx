import { MessageSquare } from "lucide-react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AgentItemId, Message, SessionId } from "@forkzero/wire";

import { useMessagesStore } from "../store/messages.ts";
import { useSessionsStore } from "../store/sessions.ts";
import { useSkillsStore } from "../store/skills.ts";
import { MessageRow, type ToolResultRecord } from "./message-row.tsx";
import { TurnSummary } from "./turn-summary.tsx";
import { GradientDescent } from "./ui/gradient-descent.tsx";

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
  const inFlight = useMessagesStore(
    (s) => s.runningBySession[sessionId] === true,
  );
  const error = useMessagesStore((s) => s.errorBySession[sessionId] ?? null);
  const hydrate = useMessagesStore((s) => s.hydrate);
  const hydrateSkills = useSkillsStore((s) => s.hydrate);

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
    void hydrateSkills(sessionId);
  }, [sessionId, hydrate, hydrateSkills]);

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
  // Split the flat message stream into turns: each turn is one user message
  // (or null for an open response with no preceding user msg) plus every
  // assistant / thinking / tool message that follows until the next user
  // message. Used to wrap completed turns in a TurnSummary card.
  const turns = useMemo(() => {
    const out: Array<{
      user: Message | null;
      body: Message[];
    }> = [];
    let current: { user: Message | null; body: Message[] } | null = null;
    for (const m of messages) {
      if (m.content._tag === "user") {
        if (current !== null) out.push(current);
        current = { user: m, body: [] };
      } else {
        if (current === null) current = { user: null, body: [] };
        current.body.push(m);
      }
    }
    if (current !== null) out.push(current);
    return out;
  }, [messages]);

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
          {turns.map((turn, idx) => {
            const isLastTurn = idx === turns.length - 1;
            const isLive = inFlight && isLastTurn;
            const hasToolCalls = turn.body.some(
              (m) => m.content._tag === "tool_use",
            );
            // Only collapse into a summary when there's a final assistant
            // message worth showing as the body — otherwise a turn with
            // just tool calls would lose its content behind the accordion.
            const hasFinalText = turn.body.some(
              (m) =>
                m.content._tag === "assistant" &&
                m.content.text.trim().length > 0,
            );
            const showSummary = !isLive && hasToolCalls && hasFinalText;
            const turnKey = turn.user?.id ?? `turn-${idx}`;
            return (
              <Fragment key={turnKey}>
                {turn.user !== null ? (
                  <MessageRow
                    message={turn.user}
                    resultsByItemId={resultsByItemId}
                  />
                ) : null}
                {showSummary ? (
                  <TurnSummary
                    body={turn.body}
                    resultsByItemId={resultsByItemId}
                  />
                ) : (
                  turn.body.map((m) => (
                    <MessageRow
                      key={m.id}
                      message={m}
                      resultsByItemId={resultsByItemId}
                    />
                  ))
                )}
              </Fragment>
            );
          })}
          {inFlight && <WorkingRow messages={messages} />}
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

const formatElapsed = (ms: number): string => {
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  return `${min}m ${sec.toFixed(1)}s`;
};

const PATTERNS = [
  "frame",
  "corners",
  "checker",
  "x",
  "full",
] as const;
type Pattern = (typeof PATTERNS)[number];

function pickDifferent(current: Pattern | null): Pattern {
  const candidates = PATTERNS.filter((p) => p !== current);
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

function WorkingRow({ messages }: { messages: ReadonlyArray<Message> }) {
  // Anchor to the most recent user message — we want the live "current turn"
  // elapsed time beside the loader, not the session-wide total.
  const anchorMs = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.content._tag === "user") return m.createdAt.getTime();
    }
    return null;
  }, [messages]);

  const [now, setNow] = useState(() => Date.now());
  const [pattern, setPattern] = useState<Pattern>(() => pickDifferent(null));
  useEffect(() => {
    const tickId = window.setInterval(() => setNow(Date.now()), 100);
    const patternId = window.setInterval(
      () => setPattern((prev) => pickDifferent(prev)),
      2200,
    );
    return () => {
      window.clearInterval(tickId);
      window.clearInterval(patternId);
    };
  }, []);

  const elapsed = anchorMs === null ? 0 : Math.max(0, now - anchorMs);

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-[11px] text-muted-foreground">
      <div data-pattern={pattern}>
        <GradientDescent dotSize={2.5} cellPadding={0.75} speed={1.2} />
      </div>
      <span className="tabular-nums">{formatElapsed(elapsed)}</span>
    </div>
  );
}
