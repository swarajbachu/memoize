import { SqlClient } from "@effect/sql";
import { Deferred, Effect, Layer, PubSub, Ref, Stream } from "effect";

import {
  PermissionRequest,
  PermissionRequestNotFoundError,
  type PermissionDecision,
  type PermissionKind,
  type SessionId,
} from "@forkzero/wire";

import {
  PermissionService,
  type PermissionServiceShape,
} from "../services/permission-service.ts";

interface PendingEntry {
  readonly request: PermissionRequest;
  readonly deferred: Deferred.Deferred<PermissionDecision>;
}

interface DecisionRow {
  readonly request_id: string;
  readonly session_id: string;
  readonly kind_tag: string;
  readonly kind_key: string;
  readonly kind_json: string;
  readonly decision: string;
  readonly decided_at: string;
}

/**
 * Stable per-kind matching key. Equality on this string is what lets
 * `AllowForSession` short-circuit a re-prompt — exact-match only, no
 * prefix / glob (kept deliberate per the Phase 4 plan; smarter matchers
 * are deferred).
 */
const kindKey = (kind: PermissionKind): string => {
  switch (kind._tag) {
    case "FileWrite":
      return kind.path;
    case "Bash":
      return kind.command;
    case "Network":
      return kind.url;
    case "Other":
      return `${kind.tool}:${kind.summary}`;
  }
};

const decisionTag = (
  decision: PermissionDecision,
): "AllowOnce" | "AllowForSession" | "Deny" | "AlwaysAllow" => decision._tag;

let requestCounter = 0;
const nextRequestId = (): string =>
  `pr_${Date.now()}_${++requestCounter}`;

export const PermissionServiceLive = Layer.scoped(
  PermissionService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const pubsub = yield* PubSub.unbounded<PermissionRequest>();
    const pending = yield* Ref.make<ReadonlyMap<string, PendingEntry>>(
      new Map(),
    );

    const findExistingSessionAllow = (
      sessionId: SessionId,
      kind: PermissionKind,
    ): Effect.Effect<boolean> =>
      sql<DecisionRow>`
        SELECT request_id, session_id, kind_tag, kind_key, kind_json, decision, decided_at
        FROM permission_decisions
        WHERE session_id = ${sessionId}
          AND kind_tag = ${kind._tag}
          AND kind_key = ${kindKey(kind)}
          AND decision = 'AllowForSession'
        LIMIT 1
      `.pipe(
        Effect.map((rows) => rows.length > 0),
        Effect.catchAll(() => Effect.succeed(false)),
      );

    const persistDecision = (
      request: PermissionRequest,
      decision: PermissionDecision,
    ): Effect.Effect<void> =>
      sql`
        INSERT OR REPLACE INTO permission_decisions
          (request_id, session_id, kind_tag, kind_key, kind_json, decision, decided_at)
        VALUES
          (${request.id}, ${request.sessionId}, ${request.kind._tag},
           ${kindKey(request.kind)}, ${JSON.stringify(request.kind)},
           ${decisionTag(decision)}, ${new Date().toISOString()})
      `.pipe(
        Effect.asVoid,
        Effect.catchAll((cause) =>
          Effect.logWarning(
            `[PermissionService] persist decision failed: ${String(cause)}`,
          ),
        ),
      );

    const request: PermissionServiceShape["request"] = (sessionId, kind) =>
      Effect.gen(function* () {
        const allowed = yield* findExistingSessionAllow(sessionId, kind);
        if (allowed) {
          return { _tag: "AllowOnce" } as PermissionDecision;
        }

        const id = nextRequestId();
        const req = PermissionRequest.make({
          id,
          sessionId,
          kind,
          requestedAt: new Date(),
        });
        const deferred = yield* Deferred.make<PermissionDecision>();
        yield* Ref.update(pending, (m) => {
          const next = new Map(m);
          next.set(id, { request: req, deferred });
          return next;
        });
        yield* PubSub.publish(pubsub, req);
        const decision = yield* Deferred.await(deferred);
        return decision;
      });

    const decide: PermissionServiceShape["decide"] = (requestId, decision) =>
      Effect.gen(function* () {
        const map = yield* Ref.get(pending);
        const entry = map.get(requestId);
        if (entry === undefined) {
          return yield* Effect.fail(
            new PermissionRequestNotFoundError({ requestId }),
          );
        }
        yield* Ref.update(pending, (m) => {
          const next = new Map(m);
          next.delete(requestId);
          return next;
        });
        yield* persistDecision(entry.request, decision);
        yield* Deferred.succeed(entry.deferred, decision);
      });

    const listPending: PermissionServiceShape["listPending"] = (sessionId) =>
      Effect.gen(function* () {
        const map = yield* Ref.get(pending);
        const out: PermissionRequest[] = [];
        for (const entry of map.values()) {
          if (entry.request.sessionId === sessionId) out.push(entry.request);
        }
        return out;
      });

    const requests: PermissionServiceShape["requests"] = () =>
      Stream.unwrapScoped(
        Effect.gen(function* () {
          const dequeue = yield* pubsub.subscribe;
          return Stream.fromQueue(dequeue);
        }),
      );

    return {
      request,
      decide,
      listPending,
      requests,
    } as const;
  }),
);
