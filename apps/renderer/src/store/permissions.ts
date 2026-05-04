import { Effect, Fiber, Stream } from "effect";
import { create } from "zustand";

import type {
  PermissionDecision,
  PermissionRequest,
  SessionId,
} from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * Catalog of pending permission prompts. The renderer subscribes once to
 * `permission.requests` (a server-side broadcast) and routes each into
 * `requestsById`. Per-session filtering happens at the component layer —
 * the toast subscribes by session and shows the head of the queue.
 *
 * Decisions clear the prompt immediately on the client; the server also
 * removes it when `permission.decide` resolves, so a late-arriving stream
 * echo is harmless.
 */
type PermissionsState = {
  readonly requestsById: Record<string, PermissionRequest>;
  readonly errorBySession: Record<string, string | null>;
  readonly start: () => void;
  readonly hydrate: (sessionId: SessionId) => Promise<void>;
  readonly decide: (
    requestId: string,
    decision: PermissionDecision,
  ) => Promise<void>;
};

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

let streamFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;

export const usePermissionsStore = create<PermissionsState>((set) => ({
  requestsById: {},
  errorBySession: {},
  start: () => {
    if (streamFiber !== null) return;
    void (async () => {
      try {
        const client = await getRpcClient();
        streamFiber = Effect.runFork(
          Stream.runForEach(client.permission.requests({}), (req) =>
            Effect.sync(() => {
              set((s) => ({
                requestsById: { ...s.requestsById, [req.id]: req },
              }));
            }),
          ),
        );
      } catch {
        // Boot-time stream failure is silent — `hydrate` is the safety net.
      }
    })();
  },
  hydrate: async (sessionId) => {
    try {
      const client = await getRpcClient();
      const pending = await Effect.runPromise(
        client.permission.listPending({ sessionId }),
      );
      set((s) => {
        const next = { ...s.requestsById };
        for (const req of pending) next[req.id] = req;
        return {
          requestsById: next,
          errorBySession: { ...s.errorBySession, [sessionId]: null },
        };
      });
    } catch (err) {
      set((s) => ({
        errorBySession: {
          ...s.errorBySession,
          [sessionId]: formatError(err),
        },
      }));
    }
  },
  decide: async (requestId, decision) => {
    set((s) => {
      const next = { ...s.requestsById };
      delete next[requestId];
      return { requestsById: next };
    });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.permission.decide({ requestId, decision }),
      );
    } catch {
      // The server drops the entry on success; a failed decide leaves it in
      // memory and we'll re-hydrate via listPending on the next session
      // mount. No noisy error UI for this case.
    }
  },
}));

export const selectRequestsForSession = (
  sessionId: SessionId,
): ((s: PermissionsState) => ReadonlyArray<PermissionRequest>) => {
  return (s) => {
    const out: PermissionRequest[] = [];
    for (const req of Object.values(s.requestsById)) {
      if (req.sessionId === sessionId) out.push(req);
    }
    return out.sort(
      (a, b) => a.requestedAt.getTime() - b.requestedAt.getTime(),
    );
  };
};
