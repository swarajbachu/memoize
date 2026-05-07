import { Context, type Effect, type Stream } from "effect";

import type {
  AgentDefinition,
  AttachmentRef,
  FileRef,
  FolderId,
  Message,
  ProviderId,
  RuntimeMode,
  Session,
  SessionAlreadyStartedError,
  SessionId,
  SessionNotFoundError,
  SessionStartError,
  SessionStatus,
  SkillRef,
  WorktreeId,
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
  readonly runtimeMode?: RuntimeMode;
  /**
   * Sub-agents the main agent may delegate to. Stored on the session row
   * as JSON so a resumed session re-passes the same roster into
   * `provider.start`. Empty/omitted means no sub-agents.
   */
  readonly agents?: Readonly<Record<string, AgentDefinition>>;
  /**
   * Master toggle for sub-agent delegation on this session. Defaults true
   * when `agents` is non-empty; the driver only adds `Agent` to
   * `allowedTools` when the effective value is true.
   */
  readonly enableSubagents?: boolean;
  /**
   * Optional git worktree the session runs in. When omitted, runs in the
   * project's main checkout. The renderer passes a `WorktreeId` it created
   * via `worktree.create` for the "auto-create worktree" flow.
   */
  readonly worktreeId?: WorktreeId | null;
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

  /**
   * Update the per-session permission posture. The change applies to the
   * next tool call — running `canUseTool` callbacks observe the new value
   * via the runtime-mode getter `ProviderService` hands the driver.
   */
  readonly setRuntimeMode: (
    sessionId: SessionId,
    runtimeMode: RuntimeMode,
  ) => Effect.Effect<void, SessionNotFoundError>;

  /**
   * Switch the worktree this session runs in. Allowed only before the first
   * user message has been recorded — fails with `SessionAlreadyStartedError`
   * otherwise. `null` means "run in the main checkout."
   */
  readonly setWorktree: (
    sessionId: SessionId,
    worktreeId: WorktreeId | null,
  ) => Effect.Effect<
    void,
    SessionNotFoundError | SessionAlreadyStartedError
  >;

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

  /**
   * Live status feed. Emits the current `Session.status` immediately and
   * publishes every transition (`idle` → `running` → `closed` / `error`).
   * The renderer uses this to keep its in-flight indicator stable across
   * the whole tool-call loop instead of inferring from message content.
   */
  readonly streamStatus: (
    sessionId: SessionId,
  ) => Stream.Stream<
    { readonly sessionId: SessionId; readonly status: SessionStatus },
    SessionNotFoundError
  >;

  readonly sendMessage: (
    sessionId: SessionId,
    text: string,
    attachments?: ReadonlyArray<AttachmentRef>,
    fileRefs?: ReadonlyArray<FileRef>,
    skillRefs?: ReadonlyArray<SkillRef>,
  ) => Effect.Effect<void, SessionNotFoundError>;

  readonly interruptSession: (
    sessionId: SessionId,
  ) => Effect.Effect<void, SessionNotFoundError>;
}

export class MessageStore extends Context.Tag("forkzero/MessageStore")<
  MessageStore,
  MessageStoreShape
>() {}
