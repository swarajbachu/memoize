import { Effect, Fiber, Stream } from "effect";
import { create } from "zustand";

import type { ComposerInput, Message, SessionId } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";
import { usePrDetailsStore } from "./pr-details.ts";
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
/**
 * One queued mid-turn message. The user pressed Enter while a turn was in
 * flight; we hold the input here until the turn ends (auto-flush) or the
 * user clicks the Steer arrow on the chip.
 */
export interface QueuedMessage {
  readonly id: string;
  readonly input: ComposerInput;
  readonly createdAt: Date;
}

type MessagesState = {
  readonly messagesBySession: Record<string, ReadonlyArray<Message>>;
  readonly errorBySession: Record<string, string | null>;
  /**
   * Mirror of `Session.status === "running"`, fed by the `session.streamStatus`
   * subscription. The composer reads this for its in-flight indicator so the
   * Send/Interrupt swap stays stable across the whole tool-call loop.
   */
  readonly runningBySession: Record<string, boolean>;
  readonly queueBySession: Record<string, ReadonlyArray<QueuedMessage>>;
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
  /** Append `input` to this session's queue. */
  readonly queue: (sessionId: SessionId, input: ComposerInput) => void;
  /** Interrupt the running turn, then send `queueId` as the next user turn. */
  readonly steerFromQueue: (
    sessionId: SessionId,
    queueId: string,
  ) => Promise<void>;
  /** Silently drop a queue chip — no RPC call. */
  readonly dropFromQueue: (sessionId: SessionId, queueId: string) => void;
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

const newQueueId = (): string =>
  `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Resolve when `runningBySession[sessionId]` becomes false (or stays false),
 * or when `timeoutMs` elapses. Used by steer to wait for the SDK's
 * post-interrupt cleanup before issuing the next send.
 */
const waitUntilIdle = (sessionId: SessionId, timeoutMs: number): Promise<void> =>
  new Promise((resolve) => {
    if (useMessagesStore.getState().runningBySession[sessionId] !== true) {
      resolve();
      return;
    }
    const timeout = window.setTimeout(() => {
      unsub();
      resolve();
    }, timeoutMs);
    const unsub = useMessagesStore.subscribe((state, prev) => {
      const now = state.runningBySession[sessionId] === true;
      const before = prev.runningBySession[sessionId] === true;
      if (before && !now) {
        window.clearTimeout(timeout);
        unsub();
        resolve();
      }
    });
  });

export const useMessagesStore = create<MessagesState>((set, get) => ({
  messagesBySession: {},
  errorBySession: {},
  runningBySession: {},
  queueBySession: {},
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
                    void usePrDetailsStore
                      .getState()
                      .refresh(projectId as never);
                    break;
                  }
                }

                // Auto-flush: when a turn lands and the queue is non-empty,
                // send the queued items in order. Each send awaits the
                // previous so the provider sees a single linear chain.
                const queued = get().queueBySession[sessionId] ?? [];
                if (queued.length > 0) {
                  void (async () => {
                    for (const q of queued) {
                      try {
                        await get().send(sessionId, q.input);
                      } catch {
                        // Stop on first error; remaining chips stay in the
                        // queue and the user can retry by clicking Steer
                        // (which is a no-op send when no turn is running).
                        return;
                      }
                      set((s) => ({
                        queueBySession: {
                          ...s.queueBySession,
                          [sessionId]: (s.queueBySession[sessionId] ?? []).filter(
                            (it) => it.id !== q.id,
                          ),
                        },
                      }));
                    }
                  })();
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
  queue: (sessionId, input) =>
    set((s) => {
      const item: QueuedMessage = {
        id: newQueueId(),
        input,
        createdAt: new Date(),
      };
      const existing = s.queueBySession[sessionId] ?? [];
      return {
        queueBySession: {
          ...s.queueBySession,
          [sessionId]: [...existing, item],
        },
      };
    }),
  dropFromQueue: (sessionId, queueId) =>
    set((s) => ({
      queueBySession: {
        ...s.queueBySession,
        [sessionId]: (s.queueBySession[sessionId] ?? []).filter(
          (q) => q.id !== queueId,
        ),
      },
    })),
  steerFromQueue: async (sessionId, queueId) => {
    const queue = get().queueBySession[sessionId] ?? [];
    const item = queue.find((q) => q.id === queueId);
    if (!item) return;
    // Optimistic — drop the chip from the queue before issuing the RPCs so
    // a re-click can't fire twice.
    set((s) => ({
      queueBySession: {
        ...s.queueBySession,
        [sessionId]: (s.queueBySession[sessionId] ?? []).filter(
          (q) => q.id !== queueId,
        ),
      },
    }));
    // Steer: interrupt the running turn, then wait for the SDK's post-interrupt
    // cleanup to land (mirrored by `runningBySession[sessionId] === false`)
    // before sending. Subscribing to the status mirror is race-free; the prior
    // 250ms sleep tripped over slow tool_result drains. A 4 s upper bound keeps
    // a stuck driver from hanging the queue forever.
    try {
      const wasRunning = get().runningBySession[sessionId] === true;
      await get().interrupt(sessionId);
      if (wasRunning) await waitUntilIdle(sessionId, 4_000);
      await get().send(sessionId, item.input);
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
