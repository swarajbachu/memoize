import { Context, type Effect, type Stream } from "effect";

import type {
  PermissionDecision,
  PermissionKind,
  PermissionRequest,
  PermissionRequestNotFoundError,
  SessionId,
} from "@forkzero/wire";

/**
 * Bridge between provider drivers (which call `request` from inside their
 * SDK permission callback) and the renderer (which subscribes to `requests`,
 * shows a toast, then calls `decide`).
 *
 * `request` blocks the driver until a decision is made or the session
 * tears down. `decide` resolves whichever deferred is keyed by `requestId`.
 * `listPending` lets a freshly-mounted UI hydrate without waiting for the
 * next stream message.
 *
 * "Allow for session" is enforced inside `request` itself: before publishing
 * a new `PermissionRequest` we look up `permission_decisions` for an
 * existing `AllowForSession` row matching `(sessionId, kindTag, kindKey)`,
 * and short-circuit with an `AllowOnce` decision when one exists. This
 * mirrors the SDK's own session-scoped suppression and keeps the prompt
 * stream quiet for repeat tool calls within a session.
 */
export interface PermissionServiceShape {
  readonly request: (
    sessionId: SessionId,
    kind: PermissionKind,
  ) => Effect.Effect<PermissionDecision>;

  readonly decide: (
    requestId: string,
    decision: PermissionDecision,
  ) => Effect.Effect<void, PermissionRequestNotFoundError>;

  readonly listPending: (
    sessionId: SessionId,
  ) => Effect.Effect<ReadonlyArray<PermissionRequest>>;

  readonly requests: () => Stream.Stream<PermissionRequest>;
}

export class PermissionService extends Context.Tag(
  "forkzero/PermissionService",
)<PermissionService, PermissionServiceShape>() {}
