import { SqlClient } from "@effect/sql";
import {
  Effect,
  Fiber,
  Layer,
  PubSub,
  Ref,
  Stream,
} from "effect";

import {
  Message,
  MessageId,
  type AgentEvent,
  type FolderId,
  type MessageContent,
  type MessageRole,
  type ProviderId,
  Session,
  SessionId,
  SessionNotFoundError,
  SessionStartError,
} from "@forkzero/wire";

import {
  MessageStore,
  type CreateSessionInput,
  type MessageStoreShape,
} from "../services/message-store.ts";
import { ProviderService } from "../services/provider-service.ts";

interface SessionRow {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly provider_id: string;
  readonly model: string;
  readonly status: string;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface MessageRow {
  readonly id: string;
  readonly session_id: string;
  readonly role: string;
  readonly kind: string;
  readonly content_json: string;
  readonly created_at: string;
}

const sessionFromRow = (row: SessionRow): Session =>
  Session.make({
    id: SessionId.make(row.id),
    projectId: row.project_id as FolderId,
    title: row.title,
    providerId: row.provider_id as ProviderId,
    model: row.model,
    status: row.status as Session["status"],
    archivedAt: row.archived_at === null ? null : new Date(row.archived_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });

const messageFromRow = (row: MessageRow): Message => {
  const content = JSON.parse(row.content_json) as MessageContent;
  return Message.make({
    id: MessageId.make(row.id),
    sessionId: SessionId.make(row.session_id),
    role: row.role as MessageRole,
    content,
    createdAt: new Date(row.created_at),
  });
};

const roleForContent = (content: MessageContent): MessageRole => {
  switch (content._tag) {
    case "user":
      return "user";
    case "assistant":
    case "tool_use":
      return "assistant";
    case "tool_result":
      return "tool";
    case "error":
      return "system";
  }
};

/**
 * Translate a provider event into the persisted message payload, or `null` if
 * the event is lifecycle-only (Started / Status / Completed / Auth / Version /
 * Capabilities / PermissionRequest). Only renderable content reaches the
 * messages table — lifecycle events drive `sessions.status` instead.
 */
const eventToContent = (event: AgentEvent): MessageContent | null => {
  switch (event._tag) {
    case "AssistantMessage":
      return { _tag: "assistant", text: event.text };
    case "ToolUse":
      return {
        _tag: "tool_use",
        itemId: event.itemId,
        tool: event.tool,
        input: event.input,
      };
    case "ToolResult":
      return {
        _tag: "tool_result",
        itemId: event.itemId,
        output: event.output,
        isError: event.isError,
      };
    case "Error":
      return { _tag: "error", message: event.message };
    default:
      return null;
  }
};

/**
 * Derive a starting title from the first line of the user's prompt. Phase 3
 * tracks the placeholder so PR 7's "auto-title" pass can still rewrite blank
 * titles after the assistant replies.
 */
const titleFromInitial = (prompt: string | undefined): string => {
  if (prompt === undefined) return "New chat";
  const firstLine = prompt.trim().split("\n")[0] ?? "";
  const truncated = firstLine.slice(0, 60).trim();
  return truncated.length > 0 ? truncated : "New chat";
};

export const MessageStoreLive = Layer.scoped(
  MessageStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const provider = yield* ProviderService;

    // One pubsub per session, lazily created. Re-used across multiple
    // `streamMessages` subscribers so a single provider event fans out to
    // every connected renderer view of that session.
    const pubsubs = yield* Ref.make<
      ReadonlyMap<SessionId, PubSub.PubSub<Message>>
    >(new Map());
    const fibers = yield* Ref.make<
      ReadonlyMap<SessionId, Fiber.RuntimeFiber<unknown, unknown>>
    >(new Map());

    const getOrMakePubsub = (sessionId: SessionId) =>
      Effect.gen(function* () {
        const map = yield* Ref.get(pubsubs);
        const existing = map.get(sessionId);
        if (existing !== undefined) return existing;
        const pubsub = yield* PubSub.unbounded<Message>();
        yield* Ref.update(pubsubs, (m) => {
          const next = new Map(m);
          next.set(sessionId, pubsub);
          return next;
        });
        return pubsub;
      });

    const lookupSession = (
      sessionId: SessionId,
    ): Effect.Effect<Session, SessionNotFoundError> =>
      Effect.gen(function* () {
        const rows = yield* sql<SessionRow>`
          SELECT id, project_id, title, provider_id, model, status,
                 archived_at, created_at, updated_at
          FROM sessions WHERE id = ${sessionId} LIMIT 1
        `.pipe(Effect.orDie);
        if (rows.length === 0) {
          return yield* Effect.fail(new SessionNotFoundError({ sessionId }));
        }
        return sessionFromRow(rows[0]!);
      });

    const persistMessage = (
      sessionId: SessionId,
      content: MessageContent,
    ): Effect.Effect<Message> =>
      Effect.gen(function* () {
        const id = MessageId.make(crypto.randomUUID());
        const role = roleForContent(content);
        const now = new Date();
        const nowIso = now.toISOString();
        yield* sql`
          INSERT INTO messages (id, session_id, role, kind, content_json, created_at)
          VALUES (${id}, ${sessionId}, ${role}, ${content._tag}, ${JSON.stringify(content)}, ${nowIso})
        `.pipe(Effect.orDie);
        yield* sql`
          UPDATE sessions SET updated_at = ${nowIso} WHERE id = ${sessionId}
        `.pipe(Effect.orDie);
        return Message.make({
          id,
          sessionId,
          role,
          content,
          createdAt: now,
        });
      });

    const setStatus = (
      sessionId: SessionId,
      status: Session["status"],
    ): Effect.Effect<void> =>
      sql`
        UPDATE sessions SET status = ${status}, updated_at = ${new Date().toISOString()}
        WHERE id = ${sessionId}
      `.pipe(Effect.asVoid, Effect.orDie);

    const broadcastMessage = (
      sessionId: SessionId,
      message: Message,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const pubsub = yield* getOrMakePubsub(sessionId);
        yield* PubSub.publish(pubsub, message);
      });

    /**
     * Fork a daemon that consumes the provider's event stream for one
     * session and persists each renderable event into `messages` while
     * fanning a copy out to live subscribers. Lifecycle events drive
     * `sessions.status`. Failure paths are swallowed at the daemon
     * boundary — the alternative is a runaway error that bubbles into the
     * RPC server and tears down the whole transport.
     */
    const startSubscription = (sessionId: SessionId): Effect.Effect<void> =>
      Effect.gen(function* () {
        const fiber = yield* Effect.forkDaemon(
          Stream.runForEach(provider.events(sessionId), (event) =>
            Effect.gen(function* () {
              if (event._tag === "Status") {
                if (
                  event.status === "running" ||
                  event.status === "closed" ||
                  event.status === "error" ||
                  event.status === "idle"
                ) {
                  yield* setStatus(sessionId, event.status);
                }
                return;
              }
              if (event._tag === "Completed") {
                yield* setStatus(
                  sessionId,
                  event.reason === "error" ? "error" : "closed",
                );
                return;
              }
              const content = eventToContent(event);
              if (content === null) return;
              const persisted = yield* persistMessage(sessionId, content);
              yield* broadcastMessage(sessionId, persisted);
            }),
          ).pipe(
            Effect.catchAllCause((cause) =>
              Effect.logDebug("[MessageStore] event stream ended").pipe(
                Effect.zipRight(Effect.logDebug(cause)),
              ),
            ),
          ),
        );
        yield* Ref.update(fibers, (m) => {
          const next = new Map(m);
          next.set(sessionId, fiber);
          return next;
        });
      });

    const teardownSubscription = (sessionId: SessionId): Effect.Effect<void> =>
      Effect.gen(function* () {
        const fiberMap = yield* Ref.get(fibers);
        const fiber = fiberMap.get(sessionId);
        if (fiber !== undefined) {
          yield* Fiber.interrupt(fiber);
          yield* Ref.update(fibers, (m) => {
            const next = new Map(m);
            next.delete(sessionId);
            return next;
          });
        }
        const pubsubMap = yield* Ref.get(pubsubs);
        const pubsub = pubsubMap.get(sessionId);
        if (pubsub !== undefined) {
          yield* PubSub.shutdown(pubsub);
          yield* Ref.update(pubsubs, (m) => {
            const next = new Map(m);
            next.delete(sessionId);
            return next;
          });
        }
      });

    // Boot recovery: any session left in `running` is stale (the previous
    // run's provider session died with the process). Demote to `idle` so the
    // sidebar reflects reality, but DO NOT pollute the message timeline with
    // synthetic rows — `sendMessage` will lazily restart the provider on the
    // next user turn (see below).
    yield* sql`
      UPDATE sessions SET status = 'idle' WHERE status = 'running'
    `.pipe(Effect.orDie);

    const listSessions: MessageStoreShape["listSessions"] = (
      projectId,
      includeArchived,
    ) =>
      Effect.gen(function* () {
        const rows = includeArchived
          ? yield* sql<SessionRow>`
              SELECT id, project_id, title, provider_id, model, status,
                     archived_at, created_at, updated_at
              FROM sessions WHERE project_id = ${projectId}
              ORDER BY updated_at DESC
            `.pipe(Effect.orDie)
          : yield* sql<SessionRow>`
              SELECT id, project_id, title, provider_id, model, status,
                     archived_at, created_at, updated_at
              FROM sessions
              WHERE project_id = ${projectId} AND archived_at IS NULL
              ORDER BY updated_at DESC
            `.pipe(Effect.orDie);
        return rows.map(sessionFromRow);
      });

    const createSession: MessageStoreShape["createSession"] = (
      input: CreateSessionInput,
    ) =>
      Effect.gen(function* () {
        // Provider mints the canonical session id; we mirror it into the row
        // so the in-memory map and the persisted row stay in lockstep.
        const started = yield* provider
          .start({
            folderId: input.projectId,
            providerId: input.providerId,
            mode: "sdk",
            initialPrompt: input.initialPrompt,
            model: input.model,
          })
          .pipe(
            Effect.mapError((err) =>
              err._tag === "ProviderNotAvailableError"
                ? new SessionStartError({
                    providerId: input.providerId,
                    reason: err.reason,
                  })
                : new SessionStartError({
                    providerId: err.providerId,
                    reason: err.reason,
                  }),
            ),
          );
        const sessionId = started.sessionId;
        const now = new Date();
        const nowIso = now.toISOString();
        const title = input.title?.trim() || titleFromInitial(input.initialPrompt);
        yield* sql`
          INSERT INTO sessions
            (id, project_id, title, provider_id, model, status, created_at, updated_at)
          VALUES
            (${sessionId}, ${input.projectId}, ${title}, ${input.providerId},
             ${input.model}, 'running', ${nowIso}, ${nowIso})
        `.pipe(Effect.orDie);
        if (
          input.initialPrompt !== undefined &&
          input.initialPrompt.trim().length > 0
        ) {
          yield* persistMessage(sessionId, {
            _tag: "user",
            text: input.initialPrompt,
          });
        }
        yield* startSubscription(sessionId);
        return Session.make({
          id: sessionId,
          projectId: input.projectId,
          title,
          providerId: input.providerId,
          model: input.model,
          status: "running",
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      });

    const renameSession: MessageStoreShape["renameSession"] = (
      sessionId,
      title,
    ) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        yield* sql`
          UPDATE sessions SET title = ${title}, updated_at = ${new Date().toISOString()}
          WHERE id = ${sessionId}
        `.pipe(Effect.orDie);
      });

    const archiveSession: MessageStoreShape["archiveSession"] = (sessionId) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        const nowIso = new Date().toISOString();
        yield* sql`
          UPDATE sessions SET archived_at = ${nowIso}, updated_at = ${nowIso}
          WHERE id = ${sessionId}
        `.pipe(Effect.orDie);
      });

    const unarchiveSession: MessageStoreShape["unarchiveSession"] = (
      sessionId,
    ) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        const nowIso = new Date().toISOString();
        yield* sql`
          UPDATE sessions SET archived_at = NULL, updated_at = ${nowIso}
          WHERE id = ${sessionId}
        `.pipe(Effect.orDie);
      });

    const deleteSession: MessageStoreShape["deleteSession"] = (sessionId) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        // Best-effort: provider may not know the id (already closed) — that's
        // not an error from the user's perspective.
        yield* provider.close(sessionId).pipe(Effect.catchAll(() => Effect.void));
        yield* teardownSubscription(sessionId);
        yield* sql`DELETE FROM sessions WHERE id = ${sessionId}`.pipe(
          Effect.orDie,
        );
        // ON DELETE CASCADE removes messages.
      });

    const listMessages: MessageStoreShape["listMessages"] = (sessionId) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        const rows = yield* sql<MessageRow>`
          SELECT id, session_id, role, kind, content_json, created_at
          FROM messages WHERE session_id = ${sessionId}
          ORDER BY created_at ASC
        `.pipe(Effect.orDie);
        return rows.map(messageFromRow);
      });

    const streamMessages: MessageStoreShape["streamMessages"] = (sessionId) =>
      Stream.unwrapScoped(
        Effect.gen(function* () {
          yield* lookupSession(sessionId);
          // Subscribe to the live pubsub *before* reading backfill so a
          // message persisted between SELECT and Stream.fromQueue is still
          // delivered. Filter live emissions against backfill ids to avoid
          // double-emitting any rows that landed during the SELECT window.
          const pubsub = yield* getOrMakePubsub(sessionId);
          const dequeue = yield* pubsub.subscribe;
          const rows = yield* sql<MessageRow>`
            SELECT id, session_id, role, kind, content_json, created_at
            FROM messages WHERE session_id = ${sessionId}
            ORDER BY created_at ASC
          `.pipe(Effect.orDie);
          const backfill = rows.map(messageFromRow);
          const seen = new Set<string>(backfill.map((m) => m.id));
          const live = Stream.fromQueue(dequeue).pipe(
            Stream.filter((m) => !seen.has(m.id)),
          );
          return Stream.concat(Stream.fromIterable(backfill), live);
        }),
      );

    /**
     * Restart the provider for `session` under the same persisted id so the
     * message history stays attached to the same row. Used after a process
     * restart wipes the provider's in-memory session map.
     */
    const restartProviderSession = (
      session: Session,
      initialPrompt: string,
    ): Effect.Effect<void, SessionNotFoundError> =>
      provider
        .start({
          folderId: session.projectId,
          providerId: session.providerId,
          mode: "sdk",
          sessionId: session.id,
          initialPrompt,
          model: session.model,
        })
        .pipe(
          Effect.flatMap(() => startSubscription(session.id)),
          Effect.mapError(() => new SessionNotFoundError({ sessionId: session.id })),
        );

    const sendMessage: MessageStoreShape["sendMessage"] = (sessionId, text) =>
      Effect.gen(function* () {
        const session = yield* lookupSession(sessionId);
        const persisted = yield* persistMessage(sessionId, {
          _tag: "user",
          text,
        });
        yield* broadcastMessage(sessionId, persisted);
        // First attempt: push into the existing provider session. If that
        // session is gone (provider dropped it across an app restart) start
        // a fresh one under the same id, then push.
        const sendResult = yield* provider.send(sessionId, text).pipe(
          Effect.matchEffect({
            onFailure: () => Effect.succeed("retry" as const),
            onSuccess: () => Effect.succeed("ok" as const),
          }),
        );
        if (sendResult === "retry") {
          yield* restartProviderSession(session, text);
        }
        yield* setStatus(sessionId, "running");
      });

    const interruptSession: MessageStoreShape["interruptSession"] = (
      sessionId,
    ) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        yield* provider.interrupt(sessionId).pipe(
          Effect.mapError(() => new SessionNotFoundError({ sessionId })),
        );
      });

    const getSession: MessageStoreShape["getSession"] = (sessionId) =>
      lookupSession(sessionId);

    return {
      listSessions,
      getSession,
      createSession,
      renameSession,
      archiveSession,
      unarchiveSession,
      deleteSession,
      listMessages,
      streamMessages,
      sendMessage,
      interruptSession,
    } as const;
  }),
);
