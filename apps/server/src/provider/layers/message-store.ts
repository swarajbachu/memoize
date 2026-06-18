import { SqlClient } from "@effect/sql";
import { Effect, Fiber, Layer, PubSub, Ref, Stream } from "effect";
import { spawn } from "node:child_process";

import {
  Chat,
  ChatAlreadyStartedError,
  ChatArchiveScriptError,
  ChatArchiveTimeoutError,
  ChatArchiveWorktreeError,
  type ChatId,
  ChatNotFoundError,
  DEFAULT_PERMISSION_MODE,
  DEFAULT_RUNTIME_MODE,
  Message,
  MessageId,
  type PermissionMode,
  SessionAlreadyStartedError,
  type AgentDefinition,
  type AgentEvent,
  type AttachmentRef,
  type FileRef,
  type FolderId,
  type MessageContent,
  type MessageId as MessageIdType,
  type MessageRole,
  type ProviderId,
  type RuntimeMode,
  Session,
  SessionId,
  SessionNotFoundError,
  SessionStartError,
  type SkillRef,
  type Worktree,
  WorktreeId,
} from "@memoize/wire";

import { WorktreeService } from "../../worktree/services/worktree-service.ts";

import { NdjsonLogger } from "../../persistence/ndjson-logger.ts";
import { PtyService } from "../../pty/services/pty-service.ts";
import { RepositorySettingsService } from "../../repository-settings/services/repository-settings-service.ts";
import { isIgnorableGrokAuthNoise } from "../drivers/acp/grok-auth-noise.ts";
import {
  MessageStore,
  type CreateChatInput,
  type CreateSessionInput,
  type MessageStoreShape,
} from "../services/message-store.ts";
import {
  ProviderService,
  type GetRuntimeMode,
} from "../services/provider-service.ts";

interface SessionRow {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly provider_id: string;
  readonly model: string;
  readonly status: string;
  readonly archived_at: string | null;
  readonly cursor: string | null;
  readonly resume_strategy: string;
  readonly runtime_mode: string;
  readonly agents_json: string | null;
  readonly worktree_id: string | null;
  readonly chat_id: string;
  readonly forked_from_session_id: string | null;
  readonly forked_from_message_id: string | null;
  readonly permission_mode: string;
  readonly tool_search: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ChatRow {
  readonly id: string;
  readonly project_id: string;
  readonly worktree_id: string | null;
  readonly title: string;
  readonly active_session_id: string | null;
  readonly archived_at: string | null;
  readonly archived_worktree_json: string | null;
  readonly last_message_at: string | null;
  readonly last_read_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

const SESSION_COLUMNS =
  "id, project_id, title, provider_id, model, status, " +
  "archived_at, cursor, resume_strategy, runtime_mode, " +
  "agents_json, worktree_id, chat_id, forked_from_session_id, " +
  "forked_from_message_id, permission_mode, tool_search, created_at, updated_at";

const CHAT_COLUMNS =
  "id, project_id, worktree_id, title, active_session_id, " +
  "archived_at, archived_worktree_json, last_message_at, last_read_at, created_at, updated_at";

const ARCHIVE_SCRIPT_TIMEOUT_MS = 10 * 60 * 1000;
const ARCHIVE_OUTPUT_LIMIT = 12_000;

interface ArchivedWorktreeSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly path: string;
  readonly name: string;
  readonly branch: string;
  readonly baseBranch: string;
  readonly createdAt: string;
}

const truncateArchiveOutput = (value: string): string => {
  if (value.length <= ARCHIVE_OUTPUT_LIMIT) return value;
  return `…${value.slice(value.length - ARCHIVE_OUTPUT_LIMIT)}`;
};

const parseArchivedWorktreeSnapshot = (
  raw: string | null,
): ArchivedWorktreeSnapshot | null => {
  if (raw === null || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ArchivedWorktreeSnapshot>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.projectId !== "string" ||
      typeof parsed.path !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.branch !== "string" ||
      typeof parsed.baseBranch !== "string" ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }
    return {
      id: parsed.id,
      projectId: parsed.projectId,
      path: parsed.path,
      name: parsed.name,
      branch: parsed.branch,
      baseBranch: parsed.baseBranch,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
};

const parseAgents = (
  raw: string | null,
): Readonly<Record<string, AgentDefinition>> | null => {
  if (raw === null || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as Record<string, AgentDefinition>;
  } catch {
    return null;
  }
};

const RUNTIME_MODES: ReadonlySet<RuntimeMode> = new Set([
  "approval-required",
  "auto-accept-edits",
  "auto-accept-edits-and-bash",
  "full-access",
]);

const runtimeModeFromRow = (raw: string): RuntimeMode =>
  RUNTIME_MODES.has(raw as RuntimeMode)
    ? (raw as RuntimeMode)
    : DEFAULT_RUNTIME_MODE;

const PERMISSION_MODES: ReadonlySet<PermissionMode> = new Set([
  "default",
  "plan",
  "acceptEdits",
]);

const permissionModeFromRow = (raw: string): PermissionMode =>
  PERMISSION_MODES.has(raw as PermissionMode)
    ? (raw as PermissionMode)
    : DEFAULT_PERMISSION_MODE;

interface MessageRow {
  readonly id: string;
  readonly session_id: string;
  readonly role: string;
  readonly kind: string;
  readonly content_json: string;
  readonly parent_item_id: string | null;
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
    cursor: row.cursor,
    resumeStrategy:
      row.resume_strategy === "claude-session-id"
        ? "claude-session-id"
        : row.resume_strategy === "codex-thread-id"
          ? "codex-thread-id"
          : "none",
    runtimeMode: runtimeModeFromRow(row.runtime_mode),
    worktreeId:
      row.worktree_id === null
        ? null
        : (row.worktree_id as unknown as WorktreeId),
    chatId: row.chat_id as unknown as ChatId,
    forkedFromSessionId:
      row.forked_from_session_id === null
        ? null
        : SessionId.make(row.forked_from_session_id),
    forkedFromMessageId:
      row.forked_from_message_id === null
        ? null
        : (row.forked_from_message_id as MessageIdType),
    permissionMode: permissionModeFromRow(row.permission_mode),
    toolSearch: row.tool_search === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });

const chatFromRow = (row: ChatRow): Chat =>
  Chat.make({
    id: row.id as unknown as ChatId,
    projectId: row.project_id as FolderId,
    worktreeId:
      row.worktree_id === null
        ? null
        : (row.worktree_id as unknown as WorktreeId),
    title: row.title,
    activeSessionId:
      row.active_session_id === null
        ? null
        : SessionId.make(row.active_session_id),
    archivedAt: row.archived_at === null ? null : new Date(row.archived_at),
    lastMessageAt:
      row.last_message_at === null ? null : new Date(row.last_message_at),
    lastReadAt: row.last_read_at === null ? null : new Date(row.last_read_at),
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

/**
 * Pull `parentItemId` off a content payload for the dedicated SQL column.
 * The same value is also embedded in `content_json`; the column exists for
 * indexed lookups (e.g. "all rows nested under item X").
 */
const parentItemIdOfContent = (content: MessageContent): string | null => {
  switch (content._tag) {
    case "assistant":
    case "thinking":
    case "tool_use":
    case "tool_result":
    case "usage":
    case "user_question":
    case "user_question_answer":
      return content.parentItemId ?? null;
    case "subagent_summary":
      // The summary row IS the wrapper; it sits at the top level next to
      // its `Agent` tool_use. No parent.
      return null;
    default:
      return null;
  }
};

const roleForContent = (content: MessageContent): MessageRole => {
  switch (content._tag) {
    case "user":
    case "user_rich":
    case "user_question_answer":
      return "user";
    case "assistant":
    case "thinking":
    case "tool_use":
    case "subagent_summary":
    case "user_question":
      return "assistant";
    case "tool_result":
      return "tool";
    case "error":
    case "usage":
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
      return {
        _tag: "assistant",
        text: event.text,
        parentItemId: event.parentItemId,
      };
    case "Thinking":
      return {
        _tag: "thinking",
        itemId: event.itemId,
        text: event.text,
        redacted: event.redacted,
        parentItemId: event.parentItemId,
      };
    case "ToolUse":
      return {
        _tag: "tool_use",
        itemId: event.itemId,
        tool: event.tool,
        input: event.input,
        parentItemId: event.parentItemId,
      };
    case "ToolResult":
      return {
        _tag: "tool_result",
        itemId: event.itemId,
        output: event.output,
        isError: event.isError,
        parentItemId: event.parentItemId,
      };
    case "SubagentSummary":
      return {
        _tag: "subagent_summary",
        itemId: event.itemId,
        agentName: event.agentName,
        model: event.model,
        turns: event.turns,
        durationMs: event.durationMs,
        summary: event.summary,
        isError: event.isError,
      };
    case "UsageDelta":
      return {
        _tag: "usage",
        parentItemId: event.parentItemId,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        cacheReadTokens: event.cacheReadTokens,
        cacheCreationTokens: event.cacheCreationTokens,
        model: event.model,
      };
    case "Error":
      return { _tag: "error", message: event.message };
    case "UserQuestion":
      return {
        _tag: "user_question",
        itemId: event.itemId,
        questions: event.questions,
        parentItemId: event.parentItemId,
      };
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

const formatProviderFailure = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message;
  if (cause !== null && typeof cause === "object") {
    const record = cause as Record<string, unknown>;
    const tag = typeof record["_tag"] === "string" ? record["_tag"] : null;
    const reason =
      typeof record["reason"] === "string" ? record["reason"] : null;
    const providerId =
      typeof record["providerId"] === "string" ? record["providerId"] : null;
    const sessionId =
      typeof record["sessionId"] === "string" ? record["sessionId"] : null;
    if (reason !== null && reason.length > 0) {
      const provider = providerId !== null ? `${providerId}: ` : "";
      return tag !== null
        ? `${tag}: ${provider}${reason}`
        : `${provider}${reason}`;
    }
    if (sessionId !== null) {
      return tag !== null
        ? `${tag}: ${sessionId}`
        : `No active provider process for session ${sessionId}.`;
    }
    try {
      return JSON.stringify(cause, null, 2);
    } catch {
      return String(cause);
    }
  }
  return String(cause);
};

export const MessageStoreLive = Layer.scoped(
  MessageStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const provider = yield* ProviderService;
    const ndjson = yield* NdjsonLogger;
    const worktrees = yield* WorktreeService;
    const repositorySettings = yield* RepositorySettingsService;
    const ptys = yield* PtyService;

    const chatColumns = yield* sql<{ readonly name: string }>`
      PRAGMA table_info(chats)
    `.pipe(Effect.orDie);
    const hasChatColumn = (name: string): boolean =>
      chatColumns.some((column) => column.name === name);
    if (!hasChatColumn("archived_worktree_json")) {
      yield* sql`
        ALTER TABLE chats
          ADD COLUMN archived_worktree_json TEXT
      `.pipe(Effect.orDie);
    }

    /**
     * Resolve the cwd a session should run in. NULL `worktreeId` falls
     * through to the project's main checkout (handled by `provider.start`
     * when `cwdOverride` is omitted). Missing rows also fall through.
     */
    const cwdForWorktree = (
      worktreeId: WorktreeId | null,
    ): Effect.Effect<string | undefined> =>
      worktreeId === null
        ? Effect.succeed(undefined)
        : Effect.map(worktrees.get(worktreeId), (wt) => wt?.path ?? undefined);

    const projectPath = (projectId: FolderId): Effect.Effect<string | null> =>
      Effect.gen(function* () {
        const rows = yield* sql<{ readonly path: string }>`
          SELECT path FROM projects WHERE id = ${projectId} LIMIT 1
        `.pipe(Effect.orDie);
        return rows[0]?.path ?? null;
      });

    const runArchiveScript = ({
      chatId,
      script,
      cwd,
      env,
    }: {
      readonly chatId: ChatId;
      readonly script: string;
      readonly cwd: string;
      readonly env: Readonly<Record<string, string>>;
    }) =>
      Effect.tryPromise({
        try: () =>
          new Promise<{ readonly output: string }>((resolve, reject) => {
            let output = "";
            let timedOut = false;
            const child = spawn("/bin/zsh", ["-lc", script], {
              cwd,
              env: { ...(process.env as Record<string, string>), ...env },
              stdio: ["ignore", "pipe", "pipe"],
            });

            const append = (chunk: unknown) => {
              output = truncateArchiveOutput(output + String(chunk));
            };
            child.stdout?.on("data", append);
            child.stderr?.on("data", append);

            const timer = setTimeout(() => {
              timedOut = true;
              try {
                child.kill("SIGKILL");
              } catch {
                // already exited
              }
            }, ARCHIVE_SCRIPT_TIMEOUT_MS);

            child.on("error", (err) => {
              clearTimeout(timer);
              reject(
                new ChatArchiveScriptError({
                  chatId,
                  exitCode: null,
                  signal: null,
                  output: truncateArchiveOutput(
                    output ||
                      (err instanceof Error ? err.message : String(err)),
                  ),
                }),
              );
            });

            child.on("close", (code, signal) => {
              clearTimeout(timer);
              const finalOutput = truncateArchiveOutput(output);
              if (timedOut) {
                reject(
                  new ChatArchiveTimeoutError({
                    chatId,
                    timeoutMs: ARCHIVE_SCRIPT_TIMEOUT_MS,
                    output: finalOutput,
                  }),
                );
                return;
              }
              if (code !== 0) {
                reject(
                  new ChatArchiveScriptError({
                    chatId,
                    exitCode: code,
                    signal,
                    output: finalOutput,
                  }),
                );
                return;
              }
              resolve({ output: finalOutput });
            });
          }),
        catch: (err) =>
          err instanceof ChatArchiveScriptError ||
          err instanceof ChatArchiveTimeoutError
            ? err
            : new ChatArchiveScriptError({
                chatId,
                exitCode: null,
                signal: null,
                output: err instanceof Error ? err.message : String(err),
              }),
      });

    // Project-id cache so the per-message NDJSON append doesn't hit the DB
    // for every event. Populated lazily on first append per session.
    const projectIdBySession = new Map<SessionId, FolderId>();

    /**
     * Live runtime-mode cache. The driver reads this through the getter we
     * hand to `provider.start`, so a renderer-driven `setRuntimeMode` takes
     * effect on the next tool call without restarting the SDK. Populated on
     * every `provider.start` and on `setRuntimeMode`.
     */
    const runtimeModeBySession = new Map<SessionId, RuntimeMode>();
    const getRuntimeModeFor = (sessionId: SessionId): RuntimeMode =>
      runtimeModeBySession.get(sessionId) ?? DEFAULT_RUNTIME_MODE;

    /**
     * Live permission-mode cache. Persisted alongside the row so resume
     * brings the session back in the same mode; the in-memory map is the
     * fast path the chip uses to render without a round-trip.
     */
    const permissionModeBySession = new Map<SessionId, PermissionMode>();

    /**
     * Sub-agents config cached per session. Populated on `createSession`
     * and on the first `lookupSession` after boot; consumed by
     * `restartProviderSession` and `resumeSession` so the resumed SDK
     * session sees the same `agents` map the original creation chose.
     */
    const agentsBySession = new Map<
      SessionId,
      {
        agents: Readonly<Record<string, AgentDefinition>>;
        enableSubagents: boolean;
      }
    >();

    const ndjsonAppend = (
      sessionId: SessionId,
      message: Message,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        let projectId = projectIdBySession.get(sessionId);
        if (projectId === undefined) {
          const rows = yield* sql<{ readonly project_id: string }>`
            SELECT project_id FROM sessions WHERE id = ${sessionId} LIMIT 1
          `.pipe(
            Effect.catchAll(() =>
              Effect.succeed(
                [] as ReadonlyArray<{ readonly project_id: string }>,
              ),
            ),
          );
          if (rows.length === 0) return;
          projectId = rows[0]!.project_id as FolderId;
          projectIdBySession.set(sessionId, projectId);
        }
        yield* ndjson.append(sessionId, projectId, message);
      });

    // One pubsub per session, lazily created. Re-used across multiple
    // `streamMessages` subscribers so a single provider event fans out to
    // every connected renderer view of that session.
    const pubsubs = yield* Ref.make<
      ReadonlyMap<SessionId, PubSub.PubSub<Message>>
    >(new Map());
    const fibers = yield* Ref.make<
      ReadonlyMap<SessionId, Fiber.RuntimeFiber<unknown, unknown>>
    >(new Map());

    type StatusEvent = {
      readonly sessionId: SessionId;
      readonly status: Session["status"];
    };
    const statusPubsubs = yield* Ref.make<
      ReadonlyMap<SessionId, PubSub.PubSub<StatusEvent>>
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

    const getOrMakeStatusPubsub = (sessionId: SessionId) =>
      Effect.gen(function* () {
        const map = yield* Ref.get(statusPubsubs);
        const existing = map.get(sessionId);
        if (existing !== undefined) return existing;
        const pubsub = yield* PubSub.unbounded<StatusEvent>();
        yield* Ref.update(statusPubsubs, (m) => {
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
                 archived_at, cursor, resume_strategy, runtime_mode,
                 agents_json, worktree_id, chat_id, forked_from_session_id,
                 forked_from_message_id, permission_mode, tool_search,
                 created_at, updated_at
          FROM sessions WHERE id = ${sessionId} LIMIT 1
        `.pipe(Effect.orDie);
        if (rows.length === 0) {
          return yield* Effect.fail(new SessionNotFoundError({ sessionId }));
        }
        const row = rows[0]!;
        // Hydrate the agents cache from the row on first sight after boot
        // so resume / lazy-restart pick up the same roster the session was
        // created with.
        if (!agentsBySession.has(sessionId)) {
          const parsed = parseAgents(row.agents_json);
          if (parsed !== null && "agents" in parsed) {
            const hydrated = parsed as unknown as {
              agents: Record<string, AgentDefinition>;
              enableSubagents?: boolean;
            };
            agentsBySession.set(sessionId, {
              agents: hydrated.agents,
              enableSubagents: hydrated.enableSubagents ?? true,
            });
          }
        }
        return sessionFromRow(row);
      });

    const agentsFor = (sessionId: SessionId) => agentsBySession.get(sessionId);

    const persistMessage = (
      sessionId: SessionId,
      content: MessageContent,
    ): Effect.Effect<Message> =>
      Effect.gen(function* () {
        const id = MessageId.make(crypto.randomUUID());
        const role = roleForContent(content);
        const now = new Date();
        const nowIso = now.toISOString();
        const parentItemId = parentItemIdOfContent(content);
        yield* sql`
          INSERT INTO messages
            (id, session_id, role, kind, content_json, parent_item_id, created_at)
          VALUES
            (${id}, ${sessionId}, ${role}, ${content._tag},
             ${JSON.stringify(content)}, ${parentItemId}, ${nowIso})
        `.pipe(Effect.orDie);
        yield* sql`
          UPDATE sessions SET updated_at = ${nowIso} WHERE id = ${sessionId}
        `.pipe(Effect.orDie);
        // Advance the owning chat's activity clock so the sidebar can mark it
        // unread. `updated_at` (and sidebar ordering) is intentionally left
        // untouched — `last_message_at` is a separate read/unread signal.
        yield* sql`
          UPDATE chats SET last_message_at = ${nowIso}
          WHERE id = (SELECT chat_id FROM sessions WHERE id = ${sessionId})
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
      Effect.gen(function* () {
        yield* sql`
          UPDATE sessions SET status = ${status}, updated_at = ${new Date().toISOString()}
          WHERE id = ${sessionId}
        `.pipe(Effect.asVoid, Effect.orDie);
        const pubsub = yield* getOrMakeStatusPubsub(sessionId);
        yield* PubSub.publish(pubsub, { sessionId, status });
      });

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
        const session = yield* lookupSession(sessionId).pipe(Effect.orDie);
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
              if (event._tag === "SessionCursor") {
                yield* sql`
                  UPDATE sessions
                     SET cursor = ${event.cursor},
                         resume_strategy = ${event.strategy},
                         updated_at = ${new Date().toISOString()}
                  WHERE id = ${sessionId}
                `.pipe(Effect.asVoid, Effect.orDie);
                return;
              }
              if (event._tag === "PermissionModeChanged") {
                // SDK flipped its lifecycle mode (typically because
                // ExitPlanMode just ran successfully). Persist + cache
                // so the chat-header chip auto-untoggles and a future
                // `provider.start` resume passes the new mode through.
                yield* sql`
                  UPDATE sessions
                     SET permission_mode = ${event.mode},
                         updated_at = ${new Date().toISOString()}
                  WHERE id = ${sessionId}
                `.pipe(Effect.asVoid, Effect.orDie);
                permissionModeBySession.set(sessionId, event.mode);
                return;
              }
              if (
                session.providerId === "grok" &&
                event._tag === "Error" &&
                isIgnorableGrokAuthNoise(event.message)
              ) {
                return;
              }
              const content = eventToContent(event);
              if (content === null) return;
              const persisted = yield* persistMessage(sessionId, content);
              yield* broadcastMessage(sessionId, persisted);
              yield* ndjsonAppend(sessionId, persisted);
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

    // Interrupt only the provider → pubsub event-pump fiber, leaving the
    // message and status PubSubs alive. The renderer's `messages.stream`
    // and `session.streamStatus` subscriptions stay connected; the next
    // `sendMessage` lazy-restarts the provider and a fresh pump-fiber
    // publishes to the same pubsubs. Use this for setModel / setProvider /
    // resumeSession — anything that swaps the provider session out and
    // back in. Use `teardownSubscription` instead when the session itself
    // is going away (deleteSession).
    const interruptProviderFiber = (
      sessionId: SessionId,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const fiberMap = yield* Ref.get(fibers);
        const fiber = fiberMap.get(sessionId);
        if (fiber === undefined) return;
        yield* Fiber.interrupt(fiber);
        yield* Ref.update(fibers, (m) => {
          const next = new Map(m);
          next.delete(sessionId);
          return next;
        });
      });

    const teardownSubscription = (sessionId: SessionId): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* interruptProviderFiber(sessionId);
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
        const statusMap = yield* Ref.get(statusPubsubs);
        const statusPubsub = statusMap.get(sessionId);
        if (statusPubsub !== undefined) {
          yield* PubSub.shutdown(statusPubsub);
          yield* Ref.update(statusPubsubs, (m) => {
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
    // Sessions left in `booting` from a crashed daemon never finished the
    // provider handshake — surface them as failed starts so the renderer
    // shows a closable tab instead of a stuck spinner.
    yield* sql`
      UPDATE sessions SET status = 'error' WHERE status = 'booting'
    `.pipe(Effect.orDie);

    const listSessions: MessageStoreShape["listSessions"] = (
      projectId,
      includeArchived,
    ) =>
      Effect.gen(function* () {
        const rows = includeArchived
          ? yield* sql<SessionRow>`
              SELECT id, project_id, title, provider_id, model, status,
                     archived_at, cursor, resume_strategy, runtime_mode,
                     agents_json, worktree_id, chat_id, forked_from_session_id,
                     forked_from_message_id, permission_mode, tool_search,
                     created_at, updated_at
              FROM sessions WHERE project_id = ${projectId}
              ORDER BY updated_at DESC
            `.pipe(Effect.orDie)
          : yield* sql<SessionRow>`
              SELECT id, project_id, title, provider_id, model, status,
                     archived_at, cursor, resume_strategy, runtime_mode,
                     agents_json, worktree_id, chat_id, forked_from_session_id,
                     forked_from_message_id, permission_mode, tool_search,
                     created_at, updated_at
              FROM sessions
              WHERE project_id = ${projectId} AND archived_at IS NULL
              ORDER BY updated_at DESC
            `.pipe(Effect.orDie);
        // Defensive filter — `chat_id` is NOT NULL since migration 0012, but
        // any row that somehow slips through with NULL would crash the
        // Session schema decode and take the entire sidebar / fs / terminal
        // down with it. Drop and log instead.
        const usable: SessionRow[] = [];
        let dropped = 0;
        for (const row of rows) {
          if (row.chat_id === null) {
            dropped += 1;
            continue;
          }
          usable.push(row);
        }
        if (dropped > 0) {
          yield* Effect.logWarning(
            `[MessageStore] listSessions: dropped ${dropped} row(s) with NULL chat_id (project ${projectId})`,
          );
        }
        return usable.map(sessionFromRow);
      });

    /**
     * Resolve a chat row for createSession. Failures surface as
     * SessionStartError so the renderer treats unknown / archived chat ids
     * the same as provider boot failures.
     */
    const lookupChatForSession = (
      chatId: ChatId,
      providerId: ProviderId,
    ): Effect.Effect<ChatRow, SessionStartError> =>
      Effect.gen(function* () {
        const rows = yield* sql<ChatRow>`
          SELECT id, project_id, worktree_id, title, active_session_id,
                 archived_at, archived_worktree_json, last_message_at, last_read_at, created_at, updated_at
          FROM chats WHERE id = ${chatId} LIMIT 1
        `.pipe(Effect.orDie);
        const row = rows[0];
        if (row === undefined) {
          return yield* Effect.fail(
            new SessionStartError({
              providerId,
              reason: `chat ${chatId} not found`,
            }),
          );
        }
        if (row.archived_at !== null) {
          return yield* Effect.fail(
            new SessionStartError({
              providerId,
              reason: "cannot create a session in an archived chat",
            }),
          );
        }
        return row;
      });

    const createSession: MessageStoreShape["createSession"] = (
      input: CreateSessionInput,
    ) =>
      Effect.gen(function* () {
        // Project + worktree are inherited from the chat row — clients no
        // longer pass them at session-create time. Fail-fast on missing /
        // archived chats so we never leave a stray provider session behind.
        const chatRow = yield* lookupChatForSession(
          input.chatId,
          input.providerId,
        );
        const projectId = chatRow.project_id as FolderId;
        const worktreeId: WorktreeId | null =
          chatRow.worktree_id === null
            ? null
            : (chatRow.worktree_id as unknown as WorktreeId);
        // Mint the session id up-front so the row + caches exist BEFORE
        // `provider.start` runs. Background-mode callers (`session.create`)
        // can then return immediately and let the slow CLI boot flip the
        // status out of `"booting"` from a daemon fiber.
        const sessionId = SessionId.make(
          `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        );
        const newSessionRuntimeMode: GetRuntimeMode = () =>
          getRuntimeModeFor(sessionId);
        const effectiveEnableSubagents =
          input.enableSubagents ??
          (input.agents !== undefined && Object.keys(input.agents).length > 0);
        const cwdOverride = yield* cwdForWorktree(worktreeId);
        const initialPermissionMode =
          input.permissionMode ?? DEFAULT_PERMISSION_MODE;
        const initialToolSearch = input.toolSearch ?? false;
        const initialRuntimeMode = input.runtimeMode ?? DEFAULT_RUNTIME_MODE;
        runtimeModeBySession.set(sessionId, initialRuntimeMode);
        permissionModeBySession.set(sessionId, initialPermissionMode);
        if (
          input.agents !== undefined &&
          Object.keys(input.agents).length > 0
        ) {
          agentsBySession.set(sessionId, {
            agents: input.agents,
            enableSubagents: effectiveEnableSubagents,
          });
        }
        const now = new Date();
        const nowIso = now.toISOString();
        const title =
          input.title?.trim() || titleFromInitial(input.initialPrompt);
        const agentsJson =
          input.agents !== undefined && Object.keys(input.agents).length > 0
            ? JSON.stringify({
                agents: input.agents,
                enableSubagents: effectiveEnableSubagents,
              })
            : null;
        const hasInitial =
          input.initialPrompt !== undefined &&
          input.initialPrompt.trim().length > 0;
        const background = input.background === true;
        const postBootStatus: Session["status"] = hasInitial
          ? "running"
          : "idle";
        // Synchronous mode (chat.create) inserts with the final post-boot
        // status because it waits for `provider.start` below — the row is
        // never visible to the renderer in `booting`. Background mode
        // (session.create) inserts as `booting`; the daemon flips it.
        const rowStatus: Session["status"] = background
          ? "booting"
          : postBootStatus;
        if (background) {
          yield* sql`
            INSERT INTO sessions
              (id, project_id, title, provider_id, model, status, runtime_mode,
               agents_json, worktree_id, chat_id, permission_mode,
               tool_search, created_at, updated_at)
            VALUES
              (${sessionId}, ${projectId}, ${title}, ${input.providerId},
               ${input.model}, ${rowStatus}, ${initialRuntimeMode},
               ${agentsJson}, ${worktreeId}, ${input.chatId},
               ${initialPermissionMode}, ${initialToolSearch ? 1 : 0},
               ${nowIso}, ${nowIso})
          `.pipe(Effect.orDie);
          yield* sql`
            UPDATE chats
            SET active_session_id = ${sessionId}, updated_at = ${nowIso}
            WHERE id = ${input.chatId}
          `.pipe(Effect.asVoid, Effect.orDie);
          if (hasInitial) {
            yield* persistMessage(sessionId, {
              _tag: "user",
              text: input.initialPrompt!,
            });
          }
          // Detach the boot so the RPC reply happens immediately. The status
          // pubsub fans the eventual transition out to the renderer via
          // `session.streamStatus`; on failure we mark `error` and log so
          // the user sees a closable failed tab instead of a stuck spinner.
          yield* Effect.forkDaemon(
            provider
              .start(
                {
                  folderId: projectId,
                  providerId: input.providerId,
                  mode: "sdk",
                  sessionId,
                  initialPrompt: input.initialPrompt,
                  model: input.model,
                  agents: input.agents,
                  enableSubagents: effectiveEnableSubagents,
                  cwdOverride,
                  permissionMode: initialPermissionMode,
                  toolSearch: initialToolSearch,
                },
                null,
                newSessionRuntimeMode,
              )
              .pipe(
                Effect.flatMap(() =>
                  Effect.gen(function* () {
                    yield* setStatus(sessionId, postBootStatus);
                    yield* startSubscription(sessionId);
                  }),
                ),
                Effect.catchAll((err) =>
                  Effect.gen(function* () {
                    yield* Effect.logWarning(
                      `[MessageStore] provider.start failed for session ${sessionId} (${input.providerId}): ${err.reason}`,
                    );
                    yield* setStatus(sessionId, "error");
                  }),
                ),
              ),
          );
          return Session.make({
            id: sessionId,
            projectId,
            title,
            providerId: input.providerId,
            model: input.model,
            status: "booting",
            archivedAt: null,
            cursor: null,
            resumeStrategy: "none",
            runtimeMode: initialRuntimeMode,
            worktreeId,
            chatId: input.chatId,
            forkedFromSessionId: null,
            forkedFromMessageId: null,
            permissionMode: initialPermissionMode,
            toolSearch: initialToolSearch,
            createdAt: now,
            updatedAt: now,
          });
        }
        // Synchronous boot — used by `chat.create` so its existing staged
        // loading panel (which animates over the full ~60s wait) stays in
        // lockstep with the actual provider handshake. Boot failures bubble
        // back as `SessionStartError`; the caller (`createChat`) rolls back
        // the chat row in that case.
        yield* provider
          .start(
            {
              folderId: projectId,
              providerId: input.providerId,
              mode: "sdk",
              sessionId,
              initialPrompt: input.initialPrompt,
              model: input.model,
              agents: input.agents,
              enableSubagents: effectiveEnableSubagents,
              cwdOverride,
              permissionMode: initialPermissionMode,
              toolSearch: initialToolSearch,
            },
            null,
            newSessionRuntimeMode,
          )
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
        yield* sql`
          INSERT INTO sessions
            (id, project_id, title, provider_id, model, status, runtime_mode,
             agents_json, worktree_id, chat_id, permission_mode,
             tool_search, created_at, updated_at)
          VALUES
            (${sessionId}, ${projectId}, ${title}, ${input.providerId},
             ${input.model}, ${rowStatus}, ${initialRuntimeMode},
             ${agentsJson}, ${worktreeId}, ${input.chatId},
             ${initialPermissionMode}, ${initialToolSearch ? 1 : 0},
             ${nowIso}, ${nowIso})
        `.pipe(Effect.orDie);
        yield* sql`
          UPDATE chats
          SET active_session_id = ${sessionId}, updated_at = ${nowIso}
          WHERE id = ${input.chatId}
        `.pipe(Effect.asVoid, Effect.orDie);
        if (hasInitial) {
          yield* persistMessage(sessionId, {
            _tag: "user",
            text: input.initialPrompt!,
          });
        }
        yield* startSubscription(sessionId);
        return Session.make({
          id: sessionId,
          projectId,
          title,
          providerId: input.providerId,
          model: input.model,
          status: postBootStatus,
          archivedAt: null,
          cursor: null,
          resumeStrategy: "none",
          runtimeMode: initialRuntimeMode,
          worktreeId,
          chatId: input.chatId,
          forkedFromSessionId: null,
          forkedFromMessageId: null,
          permissionMode: initialPermissionMode,
          toolSearch: initialToolSearch,
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

    /**
     * Update the per-session runtime mode. Persists immediately. The driver's
     * `canUseTool` callback observes the new value via `provider.start`'s
     * runtime-mode getter on the next tool call — no need to restart the SDK.
     */
    const setRuntimeMode: MessageStoreShape["setRuntimeMode"] = (
      sessionId,
      runtimeMode,
    ) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        const nowIso = new Date().toISOString();
        yield* sql`
          UPDATE sessions SET runtime_mode = ${runtimeMode}, updated_at = ${nowIso}
          WHERE id = ${sessionId}
        `.pipe(Effect.orDie);
        // Poke the in-memory cache so the next `canUseTool` invocation picks
        // up the new mode without restarting the SDK.
        runtimeModeBySession.set(sessionId, runtimeMode);
      });

    /**
     * Switch SDK lifecycle mode mid-session. Persists, updates the cache,
     * then forwards to `provider.setPermissionMode` which calls
     * `Query.setPermissionMode` on the live SDK handle and emits a
     * `PermissionModeChanged` event the renderer subscribes to.
     */
    const setPermissionMode: MessageStoreShape["setPermissionMode"] = (
      sessionId,
      mode,
    ) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        const nowIso = new Date().toISOString();
        yield* sql`
          UPDATE sessions SET permission_mode = ${mode}, updated_at = ${nowIso}
          WHERE id = ${sessionId}
        `.pipe(Effect.orDie);
        permissionModeBySession.set(sessionId, mode);
        yield* provider.setPermissionMode(sessionId, mode).pipe(
          // The SDK session may have been closed (idle / closed status).
          // Persisting the mode is enough — when the renderer hits Send,
          // `restartProviderSession` will pass the persisted value back
          // into `provider.start`'s Options.
          Effect.catchAll(() => Effect.void),
        );
      });

    /**
     * Resolve a pending AskUserQuestion. Persist the answer first so a
     * crash mid-flight doesn't leave the renderer with no record; then
     * forward to the driver, which resolves the deferred Promise and
     * lets the SDK turn unwind with the answers as the tool result.
     */
    const answerQuestion: MessageStoreShape["answerQuestion"] = (
      sessionId,
      itemId,
      answers,
    ) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        const persisted = yield* persistMessage(sessionId, {
          _tag: "user_question_answer",
          itemId,
          answers,
        });
        // Broadcast so the renderer sees the answer arrive on
        // `messages.stream` and the ChatComposer's `pendingQuestion`
        // selector flips to null — switching the composer slot back
        // from the QuestionCard to the regular editor. Without this,
        // the row sits in the DB until the next hydrate.
        yield* broadcastMessage(sessionId, persisted);
        yield* ndjsonAppend(sessionId, persisted);
        yield* provider
          .answerQuestion(sessionId, itemId, answers)
          .pipe(Effect.catchAll(() => Effect.void));
      });

    /**
     * Switch the worktree the session runs in. Allowed only before the
     * first user message is recorded — cwd cannot move under a running
     * agent. The renderer guards via `messagesCount > 0`, but we re-check
     * server-side so a stale client can't race past the lock.
     */
    const setWorktree: MessageStoreShape["setWorktree"] = (
      sessionId,
      worktreeId,
    ) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        const existing = yield* sql<{ readonly id: string }>`
          SELECT id FROM messages
          WHERE session_id = ${sessionId} AND role = 'user'
          LIMIT 1
        `.pipe(Effect.orDie);
        if (existing.length > 0) {
          return yield* Effect.fail(
            new SessionAlreadyStartedError({ sessionId }),
          );
        }
        const nowIso = new Date().toISOString();
        yield* sql`
          UPDATE sessions
          SET worktree_id = ${worktreeId}, updated_at = ${nowIso}
          WHERE id = ${sessionId}
        `.pipe(Effect.orDie);
      });

    /**
     * Persist a new model on the session row and tear down the in-memory
     * provider session so the next user turn lazy-restarts the SDK with the
     * new model. Existing message history stays attached to the same row.
     */
    const setModel: MessageStoreShape["setModel"] = (sessionId, model) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        const nowIso = new Date().toISOString();
        yield* sql`
          UPDATE sessions SET model = ${model}, updated_at = ${nowIso}
          WHERE id = ${sessionId}
        `.pipe(Effect.orDie);
        // Drop the provider's in-memory session and interrupt the event pump
        // fiber; the message + status pubsubs stay alive so the renderer's
        // streams remain connected. sendMessage's "send fails → restart"
        // path reads sessions.model so the next turn picks up the new model.
        yield* provider
          .close(sessionId)
          .pipe(Effect.catchAll(() => Effect.void));
        yield* interruptProviderFiber(sessionId);
        yield* setStatus(sessionId, "idle");
      });

    /**
     * Switch a session's provider (and the model it runs under) before any
     * user message has been sent. The new CLI can't read the prior CLI's
     * transcript, so this is fresh-session-only — mid-chat callers get
     * `SessionAlreadyStartedError`. Resets `cursor` / `resume_strategy`
     * since both are provider-specific.
     */
    const setProvider: MessageStoreShape["setProvider"] = (
      sessionId,
      providerId,
      model,
    ) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        const existing = yield* sql<{ readonly id: string }>`
          SELECT id FROM messages
          WHERE session_id = ${sessionId} AND role = 'user'
          LIMIT 1
        `.pipe(Effect.orDie);
        if (existing.length > 0) {
          return yield* Effect.fail(
            new SessionAlreadyStartedError({ sessionId }),
          );
        }
        const nowIso = new Date().toISOString();
        yield* sql`
          UPDATE sessions
          SET provider_id = ${providerId},
              model = ${model},
              cursor = NULL,
              resume_strategy = 'none',
              updated_at = ${nowIso}
          WHERE id = ${sessionId}
        `.pipe(Effect.orDie);
        // See setModel: keep the pubsubs alive so the renderer's streams
        // stay connected across the provider swap.
        yield* provider
          .close(sessionId)
          .pipe(Effect.catchAll(() => Effect.void));
        yield* interruptProviderFiber(sessionId);
        yield* setStatus(sessionId, "idle");
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
        yield* provider
          .close(sessionId)
          .pipe(Effect.catchAll(() => Effect.void));
        yield* teardownSubscription(sessionId);
        yield* sql`DELETE FROM sessions WHERE id = ${sessionId}`.pipe(
          Effect.orDie,
        );
        // ON DELETE CASCADE removes messages.
      });

    // -------------------------------------------------------------------------
    // Chats — sidebar containers. Each chat hosts ≥ 1 session as a tab.
    // -------------------------------------------------------------------------

    const lookupChat = (
      chatId: ChatId,
    ): Effect.Effect<Chat, ChatNotFoundError> =>
      Effect.gen(function* () {
        const rows = yield* sql<ChatRow>`
          SELECT id, project_id, worktree_id, title, active_session_id,
                 archived_at, archived_worktree_json, last_message_at, last_read_at, created_at, updated_at
          FROM chats WHERE id = ${chatId} LIMIT 1
        `.pipe(Effect.orDie);
        if (rows.length === 0) {
          return yield* Effect.fail(new ChatNotFoundError({ chatId }));
        }
        return chatFromRow(rows[0]!);
      });

    const listChats: MessageStoreShape["listChats"] = (
      projectId,
      includeArchived,
    ) =>
      Effect.gen(function* () {
        const rows = includeArchived
          ? yield* sql<ChatRow>`
              SELECT id, project_id, worktree_id, title, active_session_id,
                     archived_at, archived_worktree_json, last_message_at, last_read_at, created_at, updated_at
              FROM chats WHERE project_id = ${projectId}
              ORDER BY updated_at DESC
            `.pipe(Effect.orDie)
          : yield* sql<ChatRow>`
              SELECT id, project_id, worktree_id, title, active_session_id,
                     archived_at, archived_worktree_json, last_message_at, last_read_at, created_at, updated_at
              FROM chats
              WHERE project_id = ${projectId} AND archived_at IS NULL
              ORDER BY updated_at DESC
            `.pipe(Effect.orDie);
        return rows.map(chatFromRow);
      });

    const getChat: MessageStoreShape["getChat"] = (chatId) =>
      lookupChat(chatId);

    /**
     * Create a chat row AND its initial session in one effect. Both rows
     * land or neither does — we INSERT the chat first, attempt the
     * provider boot, and if the boot fails we DELETE the chat to leave
     * the DB clean.
     */
    const createChat: MessageStoreShape["createChat"] = (
      input: CreateChatInput,
    ) =>
      Effect.gen(function* () {
        const now = new Date();
        const nowIso = now.toISOString();
        const chatId = crypto.randomUUID() as unknown as ChatId;
        const title =
          input.title?.trim() || titleFromInitial(input.initialPrompt);
        const worktreeId = input.worktreeId ?? null;
        yield* sql`
          INSERT INTO chats
            (id, project_id, worktree_id, title, active_session_id,
             archived_at, last_message_at, last_read_at, created_at, updated_at)
          VALUES
            (${chatId}, ${input.projectId}, ${worktreeId}, ${title}, NULL,
             NULL, NULL, ${nowIso}, ${nowIso}, ${nowIso})
        `.pipe(Effect.asVoid, Effect.orDie);
        const initialSession = yield* createSession({
          chatId,
          providerId: input.providerId,
          model: input.model,
          title: input.title,
          initialPrompt: input.initialPrompt,
          runtimeMode: input.runtimeMode,
          agents: input.agents,
          enableSubagents: input.enableSubagents,
          permissionMode: input.permissionMode,
          toolSearch: input.toolSearch,
        }).pipe(
          Effect.tapError(() =>
            // Roll back the chat row if the provider failed to boot —
            // otherwise the sidebar would show an empty container the
            // user can't escape from.
            sql`DELETE FROM chats WHERE id = ${chatId}`.pipe(
              Effect.asVoid,
              Effect.orDie,
            ),
          ),
        );
        const chat = yield* lookupChat(chatId).pipe(Effect.orDie);
        // Fetch the initial user message (if any) so the renderer can seed
        // its messages store and skip the empty-state flash while the live
        // message stream is connecting. `createSession` writes the row
        // synchronously when `initialPrompt` is supplied, so by here it
        // exists in the table.
        const hasInitial =
          input.initialPrompt !== undefined &&
          input.initialPrompt.trim().length > 0;
        const initialMessage = hasInitial
          ? yield* sql<MessageRow>`
              SELECT id, session_id, role, kind, content_json, parent_item_id, created_at
              FROM messages
              WHERE session_id = ${initialSession.id} AND role = 'user'
              ORDER BY created_at ASC
              LIMIT 1
            `.pipe(
              Effect.orDie,
              Effect.map((rows) =>
                rows.length > 0 ? messageFromRow(rows[0]!) : null,
              ),
            )
          : null;
        return { chat, initialSession, initialMessage };
      });

    const renameChat: MessageStoreShape["renameChat"] = (chatId, title) =>
      Effect.gen(function* () {
        yield* lookupChat(chatId);
        const nowIso = new Date().toISOString();
        yield* sql`
          UPDATE chats SET title = ${title}, updated_at = ${nowIso}
          WHERE id = ${chatId}
        `.pipe(Effect.asVoid, Effect.orDie);
      });

    const markChatRead: MessageStoreShape["markChatRead"] = (chatId) =>
      Effect.gen(function* () {
        yield* lookupChat(chatId);
        const nowIso = new Date().toISOString();
        // Read state only — leave `updated_at` (sidebar ordering) untouched.
        yield* sql`
          UPDATE chats SET last_read_at = ${nowIso} WHERE id = ${chatId}
        `.pipe(Effect.asVoid, Effect.orDie);
        return yield* lookupChat(chatId);
      });

    /**
     * Worktrees are immutable past the first user message in any of the
     * chat's sessions. Mirrors `session.setWorktree`'s pre-message check
     * but lifted to the chat scope.
     */
    const setChatWorktree: MessageStoreShape["setChatWorktree"] = (
      chatId,
      worktreeId,
    ) =>
      Effect.gen(function* () {
        yield* lookupChat(chatId);
        const existing = yield* sql<{ readonly id: string }>`
          SELECT m.id FROM messages m
          INNER JOIN sessions s ON s.id = m.session_id
          WHERE s.chat_id = ${chatId} AND m.role = 'user'
          LIMIT 1
        `.pipe(Effect.orDie);
        if (existing.length > 0) {
          return yield* Effect.fail(new ChatAlreadyStartedError({ chatId }));
        }
        const nowIso = new Date().toISOString();
        yield* sql`
          UPDATE chats SET worktree_id = ${worktreeId}, updated_at = ${nowIso}
          WHERE id = ${chatId}
        `.pipe(Effect.asVoid, Effect.orDie);
        // Mirror onto every member session so renderer reads of
        // session.worktreeId stay accurate without a second round-trip.
        yield* sql`
          UPDATE sessions SET worktree_id = ${worktreeId}, updated_at = ${nowIso}
          WHERE chat_id = ${chatId}
        `.pipe(Effect.asVoid, Effect.orDie);
        // Background-booted sessions (chat.create → session.create with
        // background=true) already spawned a provider CLI in the OLD cwd
        // before the user got a chance to pick a worktree. Kill those so
        // the next `sendMessage` lazy-restarts via `restartProviderSession`,
        // which reads the now-updated `session.worktreeId` and resolves
        // `cwdForWorktree` to the new path. Without this teardown the
        // first user message would land in the wrong working tree.
        const memberSessions = yield* sql<{ readonly id: string }>`
          SELECT id FROM sessions
          WHERE chat_id = ${chatId} AND archived_at IS NULL
        `.pipe(Effect.orDie);
        for (const row of memberSessions) {
          const sid = row.id as SessionId;
          yield* provider.close(sid).pipe(Effect.catchAll(() => Effect.void));
          yield* interruptProviderFiber(sid);
          yield* setStatus(sid, "idle");
        }
        return yield* lookupChat(chatId);
      });

    const setChatActiveSession: MessageStoreShape["setChatActiveSession"] = (
      chatId,
      sessionId,
    ) =>
      Effect.gen(function* () {
        yield* lookupChat(chatId);
        const nowIso = new Date().toISOString();
        // Defensive: only update if the session belongs to this chat.
        // Stale renderer state shouldn't be able to scramble the memo.
        yield* sql`
          UPDATE chats
          SET active_session_id = ${sessionId}, updated_at = ${nowIso}
          WHERE id = ${chatId}
            AND EXISTS (
              SELECT 1 FROM sessions
              WHERE id = ${sessionId} AND chat_id = ${chatId}
            )
        `.pipe(Effect.asVoid, Effect.orDie);
      });

    const archiveChat: MessageStoreShape["archiveChat"] = (chatId) =>
      Effect.gen(function* () {
        const chat = yield* lookupChat(chatId);
        if (chat.archivedAt !== null) {
          return { chat, cleanup: null };
        }

        const settings = yield* repositorySettings.get(chat.projectId);
        const worktree =
          chat.worktreeId === null
            ? null
            : yield* worktrees.get(chat.worktreeId);
        const snapshot =
          worktree === null
            ? null
            : {
                id: worktree.id,
                projectId: worktree.projectId,
                path: worktree.path,
                name: worktree.name,
                branch: worktree.branch,
                baseBranch: worktree.baseBranch,
                createdAt: worktree.createdAt.toISOString(),
              };
        const snapshotJson =
          snapshot === null ? null : JSON.stringify(snapshot);

        const liveSessions = yield* sql<{ readonly id: string }>`
          SELECT id FROM sessions
          WHERE chat_id = ${chatId} AND archived_at IS NULL
        `.pipe(Effect.orDie);
        for (const row of liveSessions) {
          const sessionId = SessionId.make(row.id);
          yield* provider
            .close(sessionId)
            .pipe(Effect.catchAll(() => Effect.void));
          yield* interruptProviderFiber(sessionId);
        }
        if (worktree !== null) {
          yield* ptys
            .closeByCwdPrefix(worktree.path)
            .pipe(Effect.catchAll(() => Effect.void));
        }

        let cleanup: { readonly ran: boolean; readonly output: string } | null =
          null;
        const script = settings.archiveCleanupScript?.trim() ?? "";
        if (worktree !== null && script.length > 0) {
          const rootPath = yield* projectPath(chat.projectId);
          const result = yield* runArchiveScript({
            chatId,
            script: settings.archiveCleanupScript ?? "",
            cwd: worktree.path,
            env: {
              MEMOIZE_ROOT_PATH: rootPath ?? "",
              MEMOIZE_WORKSPACE_PATH: worktree.path,
              MEMOIZE_CHAT_ID: chatId,
              MEMOIZE_WORKTREE_ID: worktree.id,
            },
          });
          cleanup = { ran: true, output: result.output };
        } else if (worktree !== null) {
          cleanup = { ran: false, output: "" };
        }

        if (worktree !== null && settings.archiveRemoveWorktree) {
          yield* worktrees.remove(worktree.id, false).pipe(
            Effect.mapError(
              (err) =>
                new ChatArchiveWorktreeError({
                  chatId,
                  reason:
                    "reason" in err && typeof err.reason === "string"
                      ? err.reason
                      : err._tag,
                }),
            ),
          );
        }

        const nowIso = new Date().toISOString();
        yield* sql`
          UPDATE chats
          SET archived_at = ${nowIso},
              archived_worktree_json = ${snapshotJson},
              updated_at = ${nowIso}
          WHERE id = ${chatId}
        `.pipe(Effect.asVoid, Effect.orDie);
        yield* sql`
          UPDATE sessions SET archived_at = ${nowIso}, updated_at = ${nowIso}
          WHERE chat_id = ${chatId} AND archived_at IS NULL
        `.pipe(Effect.asVoid, Effect.orDie);
        return { chat: yield* lookupChat(chatId), cleanup };
      });

    const unarchiveChat: MessageStoreShape["unarchiveChat"] = (chatId) =>
      Effect.gen(function* () {
        const chatRows = yield* sql<ChatRow>`
          SELECT id, project_id, worktree_id, title, active_session_id,
                 archived_at, archived_worktree_json, last_message_at, last_read_at, created_at, updated_at
          FROM chats WHERE id = ${chatId} LIMIT 1
        `.pipe(Effect.orDie);
        const chatRow = chatRows[0];
        if (chatRow === undefined) {
          return yield* Effect.fail(new ChatNotFoundError({ chatId }));
        }

        const snapshot = parseArchivedWorktreeSnapshot(
          chatRow.archived_worktree_json,
        );
        let restoredWorktree: Worktree | null = null;
        let restoredWorktreeId: WorktreeId | null =
          chatRow.worktree_id === null
            ? null
            : WorktreeId.make(chatRow.worktree_id);
        if (snapshot !== null) {
          const existing = yield* worktrees.get(WorktreeId.make(snapshot.id));
          if (existing !== null) {
            restoredWorktree = existing;
            restoredWorktreeId = existing.id;
          } else if (chatRow.worktree_id === null) {
            restoredWorktree = yield* worktrees
              .restore({
                id: WorktreeId.make(snapshot.id),
                projectId: snapshot.projectId as FolderId,
                path: snapshot.path,
                name: snapshot.name,
                branch: snapshot.branch,
                baseBranch: snapshot.baseBranch,
                createdAt: new Date(snapshot.createdAt),
              })
              .pipe(
                Effect.mapError(
                  (err) =>
                    new ChatArchiveWorktreeError({
                      chatId,
                      reason: err.reason,
                    }),
                ),
              );
            restoredWorktreeId = restoredWorktree.id;
          }
        }

        const nowIso = new Date().toISOString();
        yield* sql`
          UPDATE chats
          SET archived_at = NULL,
              worktree_id = ${restoredWorktreeId},
              archived_worktree_json = NULL,
              updated_at = ${nowIso}
          WHERE id = ${chatId}
        `.pipe(Effect.asVoid, Effect.orDie);
        if (restoredWorktreeId !== null) {
          yield* sql`
            UPDATE sessions
            SET worktree_id = ${restoredWorktreeId}, updated_at = ${nowIso}
            WHERE chat_id = ${chatId}
          `.pipe(Effect.asVoid, Effect.orDie);
        }
        if (chatRow.archived_at !== null) {
          yield* sql`
            UPDATE sessions
            SET archived_at = NULL, updated_at = ${nowIso}
            WHERE chat_id = ${chatId}
              AND archived_at = ${chatRow.archived_at}
          `.pipe(Effect.asVoid, Effect.orDie);
        }
        const sessions = yield* sql<SessionRow>`
          SELECT id, project_id, title, provider_id, model, status,
                 archived_at, cursor, resume_strategy, runtime_mode,
                 agents_json, worktree_id, chat_id, forked_from_session_id,
                 forked_from_message_id, permission_mode, tool_search,
                 created_at, updated_at
          FROM sessions
          WHERE chat_id = ${chatId} AND archived_at IS NULL
          ORDER BY updated_at DESC
        `.pipe(Effect.orDie);
        return {
          chat: yield* lookupChat(chatId),
          sessions: sessions.map(sessionFromRow),
          worktree: restoredWorktree,
        };
      });

    const deleteChat: MessageStoreShape["deleteChat"] = (chatId) =>
      Effect.gen(function* () {
        yield* lookupChat(chatId);
        // Tear down each child session's provider state before the SQL
        // CASCADE wipes the rows so we don't leak an in-memory pubsub /
        // fiber after the data is gone.
        const childIds = yield* sql<{ readonly id: string }>`
          SELECT id FROM sessions WHERE chat_id = ${chatId}
        `.pipe(Effect.orDie);
        for (const { id } of childIds) {
          const sessionId = SessionId.make(id);
          yield* provider
            .close(sessionId)
            .pipe(Effect.catchAll(() => Effect.void));
          yield* teardownSubscription(sessionId);
        }
        yield* sql`DELETE FROM chats WHERE id = ${chatId}`.pipe(
          Effect.asVoid,
          Effect.orDie,
        );
        // ON DELETE CASCADE handles sessions + messages.
      });

    const listMessages: MessageStoreShape["listMessages"] = (sessionId) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        const rows = yield* sql<MessageRow>`
          SELECT id, session_id, role, kind, content_json, parent_item_id, created_at
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
            SELECT id, session_id, role, kind, content_json, parent_item_id, created_at
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

    const streamStatus: MessageStoreShape["streamStatus"] = (sessionId) =>
      Stream.unwrapScoped(
        Effect.gen(function* () {
          const session = yield* lookupSession(sessionId);
          // Mirror streamMessages: subscribe before reading the persisted row
          // so transitions during the SELECT window are still delivered.
          const pubsub = yield* getOrMakeStatusPubsub(sessionId);
          const dequeue = yield* pubsub.subscribe;
          const initial: {
            readonly sessionId: SessionId;
            readonly status: Session["status"];
          } = {
            sessionId,
            status: session.status,
          };
          return Stream.concat(
            Stream.succeed(initial),
            Stream.fromQueue(dequeue),
          );
        }),
      );

    /**
     * Restart the provider for `session` under the same persisted id so the
     * message history stays attached to the same row. Used after a process
     * restart wipes the provider's in-memory session map.
     *
     * The user's text + attachments are pushed via `provider.send` after the
     * session opens, NOT via `StartSessionInput.initialPrompt`. The
     * initialPrompt path only knows about plain text — routing through
     * `send` reuses the image-block builder so attachments survive the
     * restart instead of dropping silently.
     */
    const restartProviderSession = (
      session: Session,
      text: string,
      attachments: ReadonlyArray<AttachmentRef>,
    ): Effect.Effect<void, SessionStartError> => {
      runtimeModeBySession.set(session.id, session.runtimeMode);
      permissionModeBySession.set(session.id, session.permissionMode);
      const subagents = agentsFor(session.id);
      return cwdForWorktree(session.worktreeId).pipe(
        Effect.flatMap((cwdOverride) =>
          provider
            .start(
              {
                folderId: session.projectId,
                providerId: session.providerId,
                mode: "sdk",
                sessionId: session.id,
                model: session.model,
                agents: subagents?.agents,
                enableSubagents: subagents?.enableSubagents,
                cwdOverride,
                permissionMode: session.permissionMode,
                toolSearch: session.toolSearch,
              },
              // Re-attach to the upstream conversation when we have a
              // cursor. The driver passes it as `options.resume`; SDK
              // reloads history and continues from there.
              session.cursor,
              () => getRuntimeModeFor(session.id),
            )
            .pipe(
              Effect.flatMap(() => startSubscription(session.id)),
              Effect.flatMap(() =>
                provider.send(session.id, text, attachments),
              ),
              Effect.mapError((err) =>
                err._tag === "ProviderNotAvailableError"
                  ? new SessionStartError({
                      providerId: session.providerId,
                      reason: err.reason,
                    })
                  : err._tag === "AgentSessionStartError"
                    ? new SessionStartError({
                        providerId: err.providerId,
                        reason: err.reason,
                      })
                    : new SessionStartError({
                        providerId: session.providerId,
                        reason: formatProviderFailure(err),
                      }),
              ),
            ),
        ),
      );
    };

    const resumeSession: MessageStoreShape["resumeSession"] = (sessionId) =>
      Effect.gen(function* () {
        const session = yield* lookupSession(sessionId);
        if (session.resumeStrategy === "none" || session.cursor === null) {
          return yield* Effect.fail(
            new SessionStartError({
              providerId: session.providerId,
              reason: "resume_unsupported",
            }),
          );
        }
        // Best-effort cleanup of any stale in-memory session before opening
        // a fresh handle attached to the same DB row. Keep the pubsubs
        // alive so renderer subscriptions stay connected across the
        // resume — only the event-pump fiber needs to restart.
        yield* provider
          .close(sessionId)
          .pipe(Effect.catchAll(() => Effect.void));
        yield* interruptProviderFiber(sessionId);
        runtimeModeBySession.set(session.id, session.runtimeMode);
        permissionModeBySession.set(session.id, session.permissionMode);
        const subagents = agentsFor(session.id);
        const cwdOverride = yield* cwdForWorktree(session.worktreeId);
        yield* provider
          .start(
            {
              folderId: session.projectId,
              providerId: session.providerId,
              mode: "sdk",
              sessionId: session.id,
              model: session.model,
              agents: subagents?.agents,
              enableSubagents: subagents?.enableSubagents,
              cwdOverride,
              permissionMode: session.permissionMode,
              toolSearch: session.toolSearch,
            },
            session.cursor,
            () => getRuntimeModeFor(session.id),
          )
          .pipe(
            Effect.mapError((err) =>
              err._tag === "ProviderNotAvailableError"
                ? new SessionStartError({
                    providerId: session.providerId,
                    reason: err.reason,
                  })
                : new SessionStartError({
                    providerId: err.providerId,
                    reason: err.reason,
                  }),
            ),
          );
        yield* startSubscription(sessionId);
        yield* setStatus(sessionId, "running");
        return yield* lookupSession(sessionId);
      });

    const sendMessage: MessageStoreShape["sendMessage"] = (
      sessionId,
      text,
      attachments,
      fileRefs,
      skillRefs,
    ) =>
      Effect.gen(function* () {
        const session = yield* lookupSession(sessionId);
        // Drop "pending-*" placeholder ids — those are renderer-side temp
        // tokens for attachments whose upload didn't finish before submit.
        // The bytes don't exist server-side, so forwarding them would just
        // make the driver log a 404 per attachment.
        const cleanAttachments = (attachments ?? []).filter(
          (a) => !a.id.startsWith("pending-"),
        );
        const hasRichSegments =
          cleanAttachments.length > 0 ||
          (fileRefs ?? []).length > 0 ||
          (skillRefs ?? []).length > 0;
        const content: MessageContent = hasRichSegments
          ? {
              _tag: "user_rich",
              text,
              attachments: cleanAttachments,
              fileRefs: fileRefs ?? [],
              skillRefs: skillRefs ?? [],
            }
          : { _tag: "user", text };
        const persisted = yield* persistMessage(sessionId, content);
        // Pin the attachments so the GC sweep treats them as referenced —
        // a separate row per (message, attachment) keeps the existing
        // GC join intact.
        for (const a of cleanAttachments) {
          yield* sql`
            INSERT OR IGNORE INTO message_attachments (message_id, attachment_id)
            VALUES (${persisted.id}, ${a.id})
          `.pipe(Effect.ignoreLogged);
        }
        yield* broadcastMessage(sessionId, persisted);
        // Auto-title: if the session is still on its placeholder title, derive
        // one from the user's first real message. Cheaper and more accurate
        // than a separate LLM summarization step.
        if (session.title === "New chat") {
          const derived = titleFromInitial(text);
          if (derived !== "New chat") {
            yield* sql`
              UPDATE sessions SET title = ${derived}
              WHERE id = ${sessionId} AND title = 'New chat'
            `.pipe(Effect.orDie);
          }
        }
        // First attempt: push into the existing provider session. If that
        // session is gone (provider dropped it across an app restart) start
        // a fresh one under the same id, then push.
        console.log(
          `[message-store.sendMessage] sessionId=${sessionId} cleanAttachments=${cleanAttachments.length} (orig=${
            (attachments ?? []).length
          })`,
        );
        const sendResult = yield* provider
          .send(sessionId, text, cleanAttachments, fileRefs, skillRefs)
          .pipe(
            Effect.matchEffect({
              onFailure: (err) =>
                Effect.succeed({
                  _tag: "retry" as const,
                  reason: formatProviderFailure(err),
                }),
              onSuccess: () => Effect.succeed("ok" as const),
            }),
          );
        if (sendResult !== "ok") {
          const isGrok = session.providerId === "grok";
          const looksLikeGrokAuthWorkerDeath =
            isGrok &&
            /Grok's agent worker rejected the session.*AuthorizationRequired/i.test(
              sendResult.reason,
            );

          if (looksLikeGrokAuthWorkerDeath) {
            yield* setStatus(sessionId, "running");
            return;
          }

          console.log(
            `[message-store.sendMessage] provider.send failed; restarting provider session for ${sessionId}`,
          );
          const restartResult = yield* restartProviderSession(
            session,
            text,
            cleanAttachments,
          ).pipe(
            Effect.matchEffect({
              onFailure: (err) =>
                Effect.succeed({
                  _tag: "failed" as const,
                  reason: formatProviderFailure(err),
                }),
              onSuccess: () => Effect.succeed({ _tag: "ok" as const }),
            }),
          );
          if (restartResult._tag === "failed") {
            const message =
              `Provider restart failed after send could not find an active session.\n\n` +
              `Initial send failure:\n${sendResult.reason}\n\n` +
              `Restart failure:\n${restartResult.reason}`;
            const persistedError = yield* persistMessage(sessionId, {
              _tag: "error",
              message,
            });
            yield* broadcastMessage(sessionId, persistedError);
            yield* ndjsonAppend(sessionId, persistedError);
            yield* setStatus(sessionId, "idle");
            return;
          }
        }
        yield* setStatus(sessionId, "running");
      });

    const interruptSession: MessageStoreShape["interruptSession"] = (
      sessionId,
    ) =>
      Effect.gen(function* () {
        yield* lookupSession(sessionId);
        yield* provider
          .interrupt(sessionId)
          .pipe(Effect.mapError(() => new SessionNotFoundError({ sessionId })));
        yield* setStatus(sessionId, "idle");
      });

    const getSession: MessageStoreShape["getSession"] = (sessionId) =>
      lookupSession(sessionId);

    return {
      listSessions,
      getSession,
      createSession,
      renameSession,
      setModel,
      setProvider,
      setRuntimeMode,
      setPermissionMode,
      answerQuestion,
      setWorktree,
      archiveSession,
      unarchiveSession,
      deleteSession,
      listChats,
      getChat,
      createChat,
      renameChat,
      markChatRead,
      setChatWorktree,
      setChatActiveSession,
      archiveChat,
      unarchiveChat,
      deleteChat,
      resumeSession,
      listMessages,
      streamMessages,
      streamStatus,
      sendMessage,
      interruptSession,
    } as const;
  }),
);
