import { Effect, Fiber, Stream } from "effect";
import { create } from "zustand";

import type { Message, SessionId } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";
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
  readonly hydrate: (sessionId: SessionId) => Promise<void>;
  readonly send: (sessionId: SessionId, text: string) => Promise<void>;
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
let liveSessionId: SessionId | null = null;

const stopLiveFiber = async () => {
  if (liveFiber !== null) {
    const fiber = liveFiber;
    liveFiber = null;
    liveSessionId = null;
    await Effect.runPromise(Fiber.interrupt(fiber));
  }
};

export const useMessagesStore = create<MessagesState>((set, _get) => ({
  messagesBySession: {},
  errorBySession: {},
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
    } catch (err) {
      set((s) => ({
        errorBySession: {
          ...s.errorBySession,
          [sessionId]: formatError(err),
        },
      }));
    }
  },
  send: async (sessionId, text) => {
    set((s) => ({
      errorBySession: { ...s.errorBySession, [sessionId]: null },
    }));
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.messages.send({ sessionId, text }));
      // The server auto-titles the session from the first user message. Pull
      // the freshly-titled row so the sidebar updates without a full reload.
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
