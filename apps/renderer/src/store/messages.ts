import { Effect, Fiber, Stream } from "effect";
import { create } from "zustand";

import {
  ComposerInput,
  type Message,
  type ProviderId,
  type SessionId,
} from "@memoize/wire";

import { formatError } from "../lib/format-error.ts";
import { getRpcClient } from "../lib/rpc-client.ts";
import { usePrDetailsStore } from "./pr-details.ts";
import { usePrStateStore } from "./pr-state.ts";
import { useSessionsStore } from "./sessions.ts";

/**
 * Tagged chat error shown in the message bubble at the bottom of a session.
 * The renderer classifies once on ingest so the bubble can show the right
 * CTA — "Sign in to Codex" for auth, "Connection lost" for network,
 * generic Retry otherwise — without re-parsing the message string on every
 * render.
 */
export type ChatError =
  | {
      readonly kind: "auth";
      readonly providerId?: ProviderId;
      readonly message: string;
    }
  | { readonly kind: "network"; readonly message: string }
  | { readonly kind: "generic"; readonly message: string };

const AUTH_PATTERN =
  /\b401\b|\bunauthorized\b|expired token|invalid_grant|signed?\s?out|sign\s?in required|please log in/i;
const NETWORK_PATTERN =
  /\b(network|fetch|econn|enotfound|etimedout|timeout|getaddrinfo)\b/i;

/**
 * Read the per-session model-option bag the composer's ReasoningPicker
 * persists to sessionStorage. Returns `null` when nothing has been set so
 * the RPC payload stays clean (drivers default to model presets).
 */
const readSessionModelOptions = (
  sessionId: SessionId,
): Record<string, string> | null => {
  if (typeof window === "undefined") return null;
  const reasoning = window.sessionStorage.getItem(
    `memoize.reasoning.${sessionId}`,
  );
  if (reasoning === "low" || reasoning === "medium" || reasoning === "high") {
    return { reasoning };
  }
  return null;
};

const classifyMessage = (
  message: string,
  providerId?: ProviderId,
): ChatError => {
  if (AUTH_PATTERN.test(message)) {
    return providerId
      ? { kind: "auth", providerId, message }
      : { kind: "auth", message };
  }
  if (NETWORK_PATTERN.test(message)) return { kind: "network", message };
  return { kind: "generic", message };
};

const classifyError = (err: unknown, providerId?: ProviderId): ChatError =>
  classifyMessage(formatError(err), providerId);

const lookupSessionProvider = (sessionId: SessionId): ProviderId | undefined => {
  const buckets = useSessionsStore.getState().sessionsByProject;
  for (const list of Object.values(buckets)) {
    const sess = list.find((s) => s.id === sessionId);
    if (sess !== undefined) return sess.providerId;
  }
  return undefined;
};

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
  readonly errorBySession: Record<string, ChatError | null>;
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
  /**
   * Re-send the most recent user turn. Used by the error-bubble Retry button
   * after the user fixed the underlying issue (re-auth, network back up).
   * No-op when there's no prior user message on the session.
   */
  readonly retry: (sessionId: SessionId) => Promise<void>;
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
  // We intentionally do NOT clear the prior session's `runningBySession`
  // entry here. The sidebar-root `useSessionRunningSubscriptions` hook
  // keeps a persistent subscription per session, so the flag remains the
  // live truth even after switching away. Wiping it would make the
  // previous session's busy indicator disappear in the sidebar until
  // the next transition event.
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
              const next = [...current, message];
              // Auto-untoggle plan mode when the SDK runs ExitPlanMode
              // successfully. The server already persists the flip via
              // a `PermissionModeChanged` agent-event side-effect; this
              // patches the renderer's session-store optimistically so
              // the chip flips without waiting for the next refresh.
              if (
                message.content._tag === "tool_result" &&
                message.content.isError === false
              ) {
                const useId = message.content.itemId;
                const paired = current.find(
                  (m) =>
                    m.content._tag === "tool_use" &&
                    m.content.itemId === useId &&
                    m.content.tool === "ExitPlanMode",
                );
                if (paired !== undefined) {
                  useSessionsStore.setState((sess) => {
                    let dirty = false;
                    const updated: typeof sess.sessionsByProject = {};
                    for (const [pid, list] of Object.entries(
                      sess.sessionsByProject,
                    )) {
                      updated[pid] = list.map((row) => {
                        if (row.id === sessionId && row.permissionMode === "plan") {
                          dirty = true;
                          return { ...row, permissionMode: "default" };
                        }
                        return row;
                      });
                    }
                    return dirty ? { sessionsByProject: updated } : sess;
                  });
                }
              }
              return {
                messagesBySession: {
                  ...s.messagesBySession,
                  [sessionId]: next,
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
      // Reset the running flag if the status stream ever errors — otherwise
      // a transient RPC failure (server restart, dropped connection) leaves
      // `runningBySession[sessionId]` pinned `true`, and the composer is
      // stuck showing Interrupt with no way back to Send.
      //
      // BUT skip this reset when the stream ends because we deliberately
      // interrupted it during a session switch. In that case the OLD
      // session may still be running on the backend — the sidebar-root
      // `useSessionRunningSubscriptions` hook owns its state from now on
      // and we don't want to clobber its truth with a `false`.
      const resetOnStreamEnd = Effect.sync(() => {
        if (liveSessionId !== sessionId) return;
        useMessagesStore.setState((s) => {
          if (s.runningBySession[sessionId] !== true) return s;
          return {
            runningBySession: { ...s.runningBySession, [sessionId]: false },
          };
        });
      });
      const statusProgram = Stream.runForEach(
        client.session.streamStatus({ sessionId }).pipe(
          Stream.catchAll((err) => {
            console.error("[messages] status stream errored", err);
            return Stream.empty;
          }),
        ),
        (event) =>
          Effect.sync(() => {
            // Guard: the per-active-session statusFiber gets interrupted
            // when the user switches sessions, but its pending stream
            // events still drain during the async interrupt cleanup. Those
            // stale events would clobber the now-correct
            // `runningBySession[prevSessionId]` (typically a backend
            // `closed` emitted as the turn ends), making the prior
            // session's sidebar loader disappear the moment you navigate
            // away. The sidebar-root `useSessionRunningSubscriptions` hook
            // is the canonical writer for non-active sessions — let it
            // own those transitions.
            if (liveSessionId !== sessionId) return;
            const wasRunning = get().runningBySession[sessionId] === true;
            const isRunning = event.status === "running";
            set((s) => ({
              runningBySession: {
                ...s.runningBySession,
                [sessionId]: isRunning,
              },
            }));
            if (wasRunning && !isRunning) {
              // Refresh PR state for this session's specific (project,
              // worktree) pair — a turn that pushed commits on a worktree's
              // branch shouldn't touch the main checkout's cache entry.
              const sessions = useSessionsStore.getState().sessionsByProject;
              for (const list of Object.values(sessions)) {
                const sess = list.find((s) => s.id === sessionId);
                if (sess !== undefined) {
                  void usePrStateStore
                    .getState()
                    .refresh(sess.projectId, sess.worktreeId);
                  void usePrDetailsStore
                    .getState()
                    .refresh(sess.projectId, sess.worktreeId);
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
      ).pipe(Effect.ensuring(resetOnStreamEnd));
      statusFiber = Effect.runFork(statusProgram);
    } catch (err) {
      set((s) => ({
        errorBySession: {
          ...s.errorBySession,
          [sessionId]: classifyError(err, lookupSessionProvider(sessionId)),
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
      // Pick up the per-session reasoning selection the composer's
      // ReasoningPicker persists to sessionStorage. Drivers that don't
      // implement reasoning silently ignore it; only models whose
      // descriptor advertises a `reasoning` option even show the picker.
      const modelOptions = readSessionModelOptions(sessionId);
      const payload =
        typeof input === "string"
          ? { sessionId, text: input, ...(modelOptions !== null ? { modelOptions } : {}) }
          : { sessionId, input, ...(modelOptions !== null ? { modelOptions } : {}) };
      await Effect.runPromise(client.messages.send(payload));
      void useSessionsStore.getState().refreshOne(sessionId);
    } catch (err) {
      // Reset the optimistic running flag — otherwise a failed send leaves
      // the composer stuck on Interrupt with no path back to Send (the
      // status stream won't emit "idle" if the server never saw the turn).
      set((s) => ({
        errorBySession: {
          ...s.errorBySession,
          [sessionId]: classifyError(err, lookupSessionProvider(sessionId)),
        },
        runningBySession: { ...s.runningBySession, [sessionId]: false },
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
          [sessionId]: classifyError(err, lookupSessionProvider(sessionId)),
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
          [sessionId]: classifyError(err, lookupSessionProvider(sessionId)),
        },
      }));
    }
  },
  clearError: (sessionId) =>
    set((s) => ({
      errorBySession: { ...s.errorBySession, [sessionId]: null },
    })),
  retry: async (sessionId) => {
    const msgs = get().messagesBySession[sessionId] ?? [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]!;
      const c = m.content;
      if (c._tag === "user_rich") {
        await get().send(
          sessionId,
          new ComposerInput({
            text: c.text,
            attachments: c.attachments,
            fileRefs: c.fileRefs,
            skillRefs: c.skillRefs,
          }),
        );
        return;
      }
      if (c._tag === "user") {
        await get().send(sessionId, c.text);
        return;
      }
    }
  },
}));
