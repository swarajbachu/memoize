import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { AgentDefinition, ProviderId, RuntimeMode } from "./agent.ts";
import {
  AgentItemId,
  AgentSessionId,
  FolderId,
  MessageId,
} from "./ids.ts";

export { DEFAULT_RUNTIME_MODE, RuntimeMode } from "./agent.ts";

/**
 * A session is one chat thread inside a project. The id matches the underlying
 * provider session id (`AgentSessionId`) so the persistence layer and the
 * provider's in-memory map stay in lockstep.
 */
export const SessionId = AgentSessionId;
export type SessionId = AgentSessionId;

/**
 * Persisted lifecycle state of a session. Mirrors the `sessions.status` column.
 * `idle`     — row exists but no provider session is currently driving it.
 * `running`  — provider session is alive; `agent.events` is being consumed.
 * `closed`   — turn ended normally or session was closed by the user.
 * `error`    — provider terminated the session with an error.
 */
export const SessionStatus = Schema.Literal(
  "idle",
  "running",
  "closed",
  "error",
);
export type SessionStatus = typeof SessionStatus.Type;

/**
 * How (if at all) a session can resume after the provider session is gone.
 * Captured at start time; the renderer uses it to decide whether to expose
 * a "Resumable" affordance on stopped sessions.
 *
 *   - `claude-session-id` — Claude SDK's `session_id` is stored in `cursor`
 *     and passed back as `options.resume` on the next start.
 *   - `none` — no resume; sending again starts a fresh provider session
 *     under the same DB row (existing chat-MVP behavior).
 */
export const ResumeStrategy = Schema.Literal("claude-session-id", "none");
export type ResumeStrategy = typeof ResumeStrategy.Type;

// `RuntimeMode` and `DEFAULT_RUNTIME_MODE` are defined in `agent.ts` so the
// new `AgentDefinition.permissionMode` can reuse the same literal set
// without an import cycle. Re-exported above for back-compat with the
// existing `import { RuntimeMode } from "@forkzero/wire"` callers.

export class Session extends Schema.Class<Session>("Session")({
  id: SessionId,
  projectId: FolderId,
  title: Schema.String,
  providerId: ProviderId,
  model: Schema.String,
  status: SessionStatus,
  archivedAt: Schema.NullOr(Schema.DateFromString),
  cursor: Schema.NullOr(Schema.String),
  resumeStrategy: ResumeStrategy,
  runtimeMode: RuntimeMode,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
}) {}

/**
 * Conventional chat-message role. `tool` is used for tool_result rows so
 * markdown renderers can pick a distinct visual treatment without sniffing
 * `content._tag`.
 */
export const MessageRole = Schema.Literal(
  "user",
  "assistant",
  "system",
  "tool",
);
export type MessageRole = typeof MessageRole.Type;

const UserContent = Schema.TaggedStruct("user", {
  text: Schema.String,
});

const AssistantContent = Schema.TaggedStruct("assistant", {
  text: Schema.String,
  parentItemId: Schema.optional(AgentItemId),
});

/**
 * Extended-thinking / reasoning text emitted by the model before its final
 * answer. `redacted` mirrors Anthropic's `redacted_thinking` blocks where
 * the content is hidden but the row still appears so users see something
 * was thought about.
 */
const ThinkingContent = Schema.TaggedStruct("thinking", {
  itemId: AgentItemId,
  text: Schema.String,
  redacted: Schema.Boolean,
  parentItemId: Schema.optional(AgentItemId),
});

const ToolUseContent = Schema.TaggedStruct("tool_use", {
  itemId: AgentItemId,
  tool: Schema.String,
  input: Schema.Unknown,
  parentItemId: Schema.optional(AgentItemId),
});

const ToolResultContent = Schema.TaggedStruct("tool_result", {
  itemId: AgentItemId,
  output: Schema.Unknown,
  isError: Schema.Boolean,
  parentItemId: Schema.optional(AgentItemId),
});

const ErrorContent = Schema.TaggedStruct("error", {
  message: Schema.String,
});

/**
 * Closing summary persisted for a sub-agent run. Mirrors the streaming
 * `SubagentSummaryEvent` so resume parity holds: the wrapper-row footer
 * reads `summary` / `turns` / `durationMs` from this row when collapsed.
 */
const SubagentSummaryContent = Schema.TaggedStruct("subagent_summary", {
  itemId: AgentItemId,
  agentName: Schema.String,
  model: Schema.String,
  turns: Schema.Number,
  durationMs: Schema.Number,
  summary: Schema.String,
  isError: Schema.Boolean,
});

/**
 * Per-turn token usage. Persisted (rather than transient) so resume parity
 * gives us the per-agent cost footer for free. `parentItemId` set means
 * the usage belongs to a sub-agent; absent means main-agent usage.
 */
const UsageContent = Schema.TaggedStruct("usage", {
  parentItemId: Schema.optional(AgentItemId),
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  cacheReadTokens: Schema.Number,
  cacheCreationTokens: Schema.Number,
  model: Schema.String,
});

/**
 * Tagged-union of all renderable message payloads. Persisted as the JSON blob
 * in `messages.content_json`; the `_tag` mirrors the `messages.kind` column.
 * Keep the shape additive — new tags become new rendered variants in the
 * renderer without touching existing rows.
 */
export const MessageContent = Schema.Union(
  UserContent,
  AssistantContent,
  ThinkingContent,
  ToolUseContent,
  ToolResultContent,
  ErrorContent,
  SubagentSummaryContent,
  UsageContent,
);
export type MessageContent = typeof MessageContent.Type;

export class Message extends Schema.Class<Message>("Message")({
  id: MessageId,
  sessionId: SessionId,
  role: MessageRole,
  content: MessageContent,
  createdAt: Schema.DateFromString,
}) {}

export class SessionNotFoundError extends Schema.TaggedError<SessionNotFoundError>()(
  "SessionNotFoundError",
  { sessionId: SessionId },
) {}

export class SessionStartError extends Schema.TaggedError<SessionStartError>()(
  "SessionStartError",
  { providerId: ProviderId, reason: Schema.String },
) {}

// ---------------------------------------------------------------------------
// Session RPCs
// ---------------------------------------------------------------------------

export const SessionListRpc = Rpc.make("session.list", {
  payload: Schema.Struct({
    projectId: FolderId,
    includeArchived: Schema.optional(Schema.Boolean),
  }),
  success: Schema.Array(Session),
});

export const SessionGetRpc = Rpc.make("session.get", {
  payload: Schema.Struct({ sessionId: SessionId }),
  success: Session,
  error: SessionNotFoundError,
});

export const SessionCreateRpc = Rpc.make("session.create", {
  payload: Schema.Struct({
    projectId: FolderId,
    providerId: ProviderId,
    model: Schema.String,
    title: Schema.optional(Schema.String),
    initialPrompt: Schema.optional(Schema.String),
    runtimeMode: Schema.optional(RuntimeMode),
    // Sub-agents the new session may delegate to. The renderer reads
    // these from the user's preset settings and injects them at create
    // time so the wire stays the single source of truth.
    agents: Schema.optional(
      Schema.Record({ key: Schema.String, value: AgentDefinition }),
    ),
    enableSubagents: Schema.optional(Schema.Boolean),
  }),
  success: Session,
  error: SessionStartError,
});

export const SessionRenameRpc = Rpc.make("session.rename", {
  payload: Schema.Struct({ sessionId: SessionId, title: Schema.String }),
  success: Schema.Void,
  error: SessionNotFoundError,
});

export const SessionSetModelRpc = Rpc.make("session.setModel", {
  payload: Schema.Struct({ sessionId: SessionId, model: Schema.String }),
  success: Schema.Void,
  error: SessionNotFoundError,
});

export const SessionArchiveRpc = Rpc.make("session.archive", {
  payload: Schema.Struct({ sessionId: SessionId }),
  success: Schema.Void,
  error: SessionNotFoundError,
});

export const SessionUnarchiveRpc = Rpc.make("session.unarchive", {
  payload: Schema.Struct({ sessionId: SessionId }),
  success: Schema.Void,
  error: SessionNotFoundError,
});

export const SessionDeleteRpc = Rpc.make("session.delete", {
  payload: Schema.Struct({ sessionId: SessionId }),
  success: Schema.Void,
  error: SessionNotFoundError,
});

// ---------------------------------------------------------------------------
// Message RPCs
// ---------------------------------------------------------------------------

export const MessagesListRpc = Rpc.make("messages.list", {
  payload: Schema.Struct({ sessionId: SessionId }),
  success: Schema.Array(Message),
  error: SessionNotFoundError,
});

/**
 * Subscribe to a session's message log. The stream emits each persisted row in
 * `created_at` order (backfill) and continues with live rows as the provider
 * produces events. The renderer treats it as the single source of truth — no
 * separate hydrate / live split.
 */
export const MessagesStreamRpc = Rpc.make("messages.stream", {
  payload: Schema.Struct({ sessionId: SessionId }),
  success: Message,
  error: SessionNotFoundError,
  stream: true,
});

export const MessagesSendRpc = Rpc.make("messages.send", {
  payload: Schema.Struct({ sessionId: SessionId, text: Schema.String }),
  success: Schema.Void,
  error: SessionNotFoundError,
});

export const MessagesInterruptRpc = Rpc.make("messages.interrupt", {
  payload: Schema.Struct({ sessionId: SessionId }),
  success: Schema.Void,
  error: SessionNotFoundError,
});

/**
 * Re-open a stopped session against the provider. For Claude this passes
 * the persisted `cursor` to the SDK's `resume`; for Codex it currently
 * fails with `SessionStartError({ reason: "resume_unsupported" })` and the
 * renderer offers "Start new session" instead.
 */
export const SessionResumeRpc = Rpc.make("session.resume", {
  payload: Schema.Struct({ sessionId: SessionId }),
  success: Session,
  error: Schema.Union(SessionNotFoundError, SessionStartError),
});

/**
 * Set the per-session permission posture. Takes effect on the next tool call —
 * if a turn is in flight when the toggle changes, the running canUseTool
 * callbacks observe the new mode without restarting the SDK.
 */
export const SessionSetRuntimeModeRpc = Rpc.make("session.setRuntimeMode", {
  payload: Schema.Struct({
    sessionId: SessionId,
    runtimeMode: RuntimeMode,
  }),
  success: Schema.Void,
  error: SessionNotFoundError,
});

/**
 * Live status feed for a session. Mirrors the message stream pattern: emits
 * the current status immediately, then every transition. The renderer uses
 * it to keep the composer's "running" indicator stable across the whole
 * tool-call loop instead of inferring from the last message.
 */
export const SessionStatusStreamRpc = Rpc.make("session.streamStatus", {
  payload: Schema.Struct({ sessionId: SessionId }),
  success: Schema.Struct({ sessionId: SessionId, status: SessionStatus }),
  error: SessionNotFoundError,
  stream: true,
});
