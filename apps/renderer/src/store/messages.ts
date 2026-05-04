import { Effect, Fiber, Stream } from "effect";
import { create } from "zustand";

import type { ComposerInput, Message, SessionId } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";
import { usePrStateStore } from "./pr-state.ts";
import { useSessionsStore } from "./sessions.ts";

/**
 * Live view of one session's message log. Subscribes to `messages.stream`
 * (which emits backfill rows then live ones), drops them straight into
 * `messagesBySession[sessionId]`. Switching sessions tears down the previous
 * subscription so a single live fiber is alive at any time.
 *
 * `inFlightBySession` is a heuristic — true while the last message is from
 * the user (assistant has not yet replied) or is a tool_use that hasn't
 * paired with a tool_result. PR 7 may swap this for a real session-status
 * subscription; for the chat-MVP it gives the composer a "running" indicator
 * that flips on send and back off when the assistant text arrives.
 */
type MessagesState = {
  readonly messagesBySession: Record<string, ReadonlyArray<Message>>;
  readonly errorBySession: Record<string, string | null>;
  /**
   * Mirror of `Session.status === "running"`, fed by the `session.streamStatus`
   * subscription. The composer reads this for its in-flight indicator so the
   * Send/Interrupt swap stays stable across the whole tool-call loop.
   */
  readonly runningBySession: Record<string, boolean>;
  readonly hydrate: (sessionId: SessionId) => Promise<void>;
  /**
   * Send a user turn. Accepts either a raw string (legacy / simple-text
   * callers) or a fully-typed `ComposerInput`. The underlying RPC accepts
   * both for the same reason — the composer migration to ComposerInput
   * lands incrementally across phases.
   */
  readonly send: (
    sessionId: SessionId,
    input: string | ComposerInput,
  ) => Promise<void>;
  readonly interrupt: (sessionId: SessionId) => Promise<void>;
  readonly clearError: (sessionId: SessionId) => void;
};

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

let liveFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;
let statusFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;
let liveSessionId: SessionId | null = null;

const stopLiveFiber = async () => {
  const tasks: Array<Promise<unknown>> = [];
  if (liveFiber !== null) {
    tasks.push(Effect.runPromise(Fiber.interrupt(liveFiber)));
    liveFiber = null;
  }
  if (statusFiber !== null) {
    tasks.push(Effect.runPromise(Fiber.interrupt(statusFiber)));
    statusFiber = null;
  }
  liveSessionId = null;
  await Promise.all(tasks);
};

export const useMessagesStore = create<MessagesState>((set, get) => ({
  messagesBySession: {},
  errorBySession: {},
  runningBySession: {},
  hydrate: async (sessionId) => {
    if (liveSessionId === sessionId && liveFiber !== null) return;
    await stopLiveFiber();
    liveSessionId = sessionId;
    set((s) => ({
      messagesBySession: { ...s.messagesBySession, [sessionId]: [] },
      errorBySession: { ...s.errorBySession, [sessionId]: null },
    }));
    try {
      const client = await getRpcClient();
      liveFiber = Effect.runFork(
        Stream.runForEach(client.messages.stream({ sessionId }), (message) =>
          Effect.sync(() => {
            set((s) => {
              const current = s.messagesBySession[sessionId] ?? [];
              if (current.some((m) => m.id === message.id)) return s;
              return {
                messagesBySession: {
                  ...s.messagesBySession,
                  [sessionId]: [...current, message],
                },
              };
            });
          }),
        ),
      );
      // Status mirror — keeps the composer's "running" indicator stable
      // across the whole tool-call loop. When a turn ends we also refresh
      // the project's PR state so freshly pushed branches recolor the
      // branch icon without waiting for the user to click around.
      statusFiber = Effect.runFork(
        Stream.runForEach(
          client.session.streamStatus({ sessionId }),
          (event) =>
            Effect.sync(() => {
              const wasRunning = get().runningBySession[sessionId] === true;
              const isRunning = event.status === "running";
              set((s) => ({
                runningBySession: {
                  ...s.runningBySession,
                  [sessionId]: isRunning,
                },
              }));
              if (wasRunning && !isRunning) {
                const session = useSessionsStore
                  .getState()
                  .sessionsByProject;
                for (const [projectId, sessions] of Object.entries(session)) {
                  if (sessions.some((sess) => sess.id === sessionId)) {
                    void usePrStateStore
                      .getState()
                      .refresh(projectId as never);
                    break;
                  }
                }
              }
            }),
        ),
      );
    } catch (err) {
      set((s) => ({
        errorBySession: {
          ...s.errorBySession,
          [sessionId]: formatError(err),
        },
      }));
    }
  },
  send: async (sessionId, input) => {
    // Optimistic — flip running to true before the server status arrives so
    // the composer's Send→Interrupt swap doesn't flash through "idle" while
    // the RPC round-trip happens.
    set((s) => ({
      errorBySession: { ...s.errorBySession, [sessionId]: null },
      runningBySession: { ...s.runningBySession, [sessionId]: true },
    }));
    try {
      const client = await getRpcClient();
      const payload =
        typeof input === "string"
          ? { sessionId, text: input }
          : { sessionId, input };
      await Effect.runPromise(client.messages.send(payload));
      void useSessionsStore.getState().refreshOne(sessionId);
    } catch (err) {
      set((s) => ({
        errorBySession: {
          ...s.errorBySession,
          [sessionId]: formatError(err),
        },
      }));
    }
  },
  interrupt: async (sessionId) => {
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.messages.interrupt({ sessionId }));
    } catch (err) {
      set((s) => ({
        errorBySession: {
          ...s.errorBySession,
          [sessionId]: formatError(err),
        },
      }));
    }
  },
  clearError: (sessionId) =>
    set((s) => ({
      errorBySession: { ...s.errorBySession, [sessionId]: null },
    })),
}));
