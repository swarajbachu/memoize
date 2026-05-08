import { Effect, Fiber, Stream } from "effect";
import { create } from "zustand";

import type {
  FolderId,
  PermissionDecision,
  PermissionRequest,
  SavedDecision,
  SessionId,
} from "@memoize/wire";

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
  readonly decisionsByProject: Record<string, ReadonlyArray<SavedDecision>>;
  readonly loadingDecisionsByProject: Record<string, boolean>;
  readonly start: () => void;
  readonly hydrate: (sessionId: SessionId) => Promise<void>;
  readonly decide: (
    requestId: string,
    decision: PermissionDecision,
  ) => Promise<void>;
  readonly loadDecisions: (projectId: FolderId) => Promise<void>;
  readonly revoke: (projectId: FolderId, requestId: string) => Promise<void>;
};

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

let streamFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  requestsById: {},
  errorBySession: {},
  decisionsByProject: {},
  loadingDecisionsByProject: {},
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
  loadDecisions: async (projectId) => {
    set((s) => ({
      loadingDecisionsByProject: {
        ...s.loadingDecisionsByProject,
        [projectId]: true,
      },
    }));
    try {
      const client = await getRpcClient();
      const decisions = await Effect.runPromise(
        client.permission.listDecisions({ projectId }),
      );
      set((s) => ({
        decisionsByProject: {
          ...s.decisionsByProject,
          [projectId]: decisions,
        },
        loadingDecisionsByProject: {
          ...s.loadingDecisionsByProject,
          [projectId]: false,
        },
      }));
    } catch {
      set((s) => ({
        loadingDecisionsByProject: {
          ...s.loadingDecisionsByProject,
          [projectId]: false,
        },
      }));
    }
  },
  revoke: async (projectId, requestId) => {
    // Optimistic — drop the row from the cached list before the RPC settles.
    // If the RPC fails we re-fetch to repair state. In practice a failure
    // here is a renderer-side bug, not a user-visible state divergence.
    const before = get().decisionsByProject[projectId];
    set((s) => ({
      decisionsByProject: {
        ...s.decisionsByProject,
        [projectId]: (s.decisionsByProject[projectId] ?? []).filter(
          (d) => d.requestId !== requestId,
        ),
      },
    }));
    try {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.permission.revokeDecision({ requestId }),
      );
    } catch {
      if (before !== undefined) {
        set((s) => ({
          decisionsByProject: {
            ...s.decisionsByProject,
            [projectId]: before,
          },
        }));
      }
    }
  },
}));

