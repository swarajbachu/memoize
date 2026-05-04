import { Context, type Effect, type Stream } from "effect";

import type {
  FolderId,
  Message,
  ProviderId,
  Session,
  SessionId,
  SessionNotFoundError,
  SessionStartError,
} from "@forkzero/wire";

/**
 * Persistence-backed orchestration of chat sessions and their message log.
 * Wraps `ProviderService` so RPC handlers and the renderer talk to one
 * coherent surface — `agent.*` RPCs stay live for low-level access but the
 * chat UI never reaches past `MessageStore`.
 *
 * Invariants:
 * - `Session.id` matches the provider's in-memory `AgentSessionId`.
 * - Every persisted `Message` corresponds to either a user submit or an
 *   `AgentEvent` that produced renderable content; lifecycle events
 *   (`Started`, `Status`, `Completed`) update the session row but are not
 *   persisted as messages.
 * - `streamMessages` emits the full backfill before any live row.
 */
export interface CreateSessionInput {
  readonly projectId: FolderId;
  readonly providerId: ProviderId;
  readonly model: string;
  readonly title?: string;
  readonly initialPrompt?: string;
}

export interface MessageStoreShape {
  readonly listSessions: (
    projectId: FolderId,
    includeArchived: boolean,
  ) => Effect.Effect<ReadonlyArray<Session>>;

  readonly getSession: (
    sessionId: SessionId,
  ) => Effect.Effect<Session, SessionNotFoundError>;

  readonly createSession: (
    input: CreateSessionInput,
  ) => Effect.Effect<Session, SessionStartError>;

  readonly renameSession: (
    sessionId: SessionId,
    title: string,
  ) => Effect.Effect<void, SessionNotFoundError>;

  readonly setModel: (
    sessionId: SessionId,
    model: string,
  ) => Effect.Effect<void, SessionNotFoundError>;

  readonly archiveSession: (
    sessionId: SessionId,
  ) => Effect.Effect<void, SessionNotFoundError>;

  readonly unarchiveSession: (
    sessionId: SessionId,
  ) => Effect.Effect<void, SessionNotFoundError>;

  readonly deleteSession: (
    sessionId: SessionId,
  ) => Effect.Effect<void, SessionNotFoundError>;

  readonly resumeSession: (
    sessionId: SessionId,
  ) => Effect.Effect<Session, SessionNotFoundError | SessionStartError>;

  readonly listMessages: (
    sessionId: SessionId,
  ) => Effect.Effect<ReadonlyArray<Message>, SessionNotFoundError>;

  readonly streamMessages: (
    sessionId: SessionId,
  ) => Stream.Stream<Message, SessionNotFoundError>;

  readonly sendMessage: (
    sessionId: SessionId,
    text: string,
  ) => Effect.Effect<void, SessionNotFoundError>;

  readonly interruptSession: (
    sessionId: SessionId,
  ) => Effect.Effect<void, SessionNotFoundError>;
}

export class MessageStore extends Context.Tag("forkzero/MessageStore")<
  MessageStore,
  MessageStoreShape
>() {}
