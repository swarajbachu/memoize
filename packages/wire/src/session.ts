import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { ProviderId } from "./agent.ts";
import { AttachmentRef, ComposerInput, FileRef, SkillRef } from "./composer.ts";
import {
  AgentItemId,
  AgentSessionId,
  FolderId,
  MessageId,
} from "./ids.ts";

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

/**
 * How permission prompts behave for this session.
 *
 *   - `approval-required` — prompt every write/Bash/Network/Task/MCP call.
 *     Read-only tools auto-allow. Sensitive paths force a prompt regardless
 *     of any other allow rule. **Default for new sessions** — safe by default.
 *   - `auto-accept-edits` — also auto-allow `Edit` / `Write` / `MultiEdit` /
 *     `NotebookEdit`. Bash / Network / Task / MCP still prompt. Sensitive
 *     paths still force a prompt.
 *   - `full-access` — auto-allow everything except sensitive paths (which
 *     still prompt — the safety net the user opted into is preserved).
 */
export const RuntimeMode = Schema.Literal(
  "approval-required",
  "auto-accept-edits",
  "full-access",
);
export type RuntimeMode = typeof RuntimeMode.Type;
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "approval-required";

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

/**
 * User message that carries chips: typed file/directory tags, image
 * attachments, and skill invocations. Coexists with `user` — old rows still
 * render via the plain `user` variant. The renderer prefers `user_rich` when
 * a submission has any non-text segments.
 */
const UserRichContent = Schema.TaggedStruct("user_rich", {
  text: Schema.String,
  attachments: Schema.Array(AttachmentRef),
  fileRefs: Schema.Array(FileRef),
  skillRefs: Schema.Array(SkillRef),
});

const AssistantContent = Schema.TaggedStruct("assistant", {
  text: Schema.String,
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
});

const ToolUseContent = Schema.TaggedStruct("tool_use", {
  itemId: AgentItemId,
  tool: Schema.String,
  input: Schema.Unknown,
});

const ToolResultContent = Schema.TaggedStruct("tool_result", {
  itemId: AgentItemId,
  output: Schema.Unknown,
  isError: Schema.Boolean,
});

const ErrorContent = Schema.TaggedStruct("error", {
  message: Schema.String,
});

/**
 * Tagged-union of all renderable message payloads. Persisted as the JSON blob
 * in `messages.content_json`; the `_tag` mirrors the `messages.kind` column.
 * Keep the shape additive — new tags become new rendered variants in the
 * renderer without touching existing rows.
 */
export const MessageContent = Schema.Union(
  UserContent,
  UserRichContent,
  AssistantContent,
  ThinkingContent,
  ToolUseContent,
  ToolResultContent,
  ErrorContent,
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

/**
 * Reported by `messages.steer` if the active provider cannot interrupt the
 * running turn. Both 0.03 drivers (Claude, Codex) support steer; the error
 * is reserved for future providers.
 */
export class SteerUnsupportedError extends Schema.TaggedError<SteerUnsupportedError>()(
  "SteerUnsupportedError",
  { providerId: ProviderId },
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

/**
 * Send a user turn. The legacy `text` field stays accepted alongside the
 * richer `input` form so the renderer can migrate the composer to
 * `ComposerInput` in a follow-up phase without a wire flag-day. Server
 * prefers `input` when both are present.
 */
export const MessagesSendRpc = Rpc.make("messages.send", {
  payload: Schema.Struct({
    sessionId: SessionId,
    text: Schema.optional(Schema.String),
    input: Schema.optional(ComposerInput),
  }),
  success: Schema.Void,
  error: SessionNotFoundError,
});

export const MessagesInterruptRpc = Rpc.make("messages.interrupt", {
  payload: Schema.Struct({ sessionId: SessionId }),
  success: Schema.Void,
  error: SessionNotFoundError,
});

/**
 * Interrupt the running turn (if any) and immediately send `input` as the
 * next user turn. The driver drains the post-interrupt cleanup messages
 * before issuing the new query so the message stream stays linear.
 */
export const MessagesSteerRpc = Rpc.make("messages.steer", {
  payload: Schema.Struct({
    sessionId: SessionId,
    input: ComposerInput,
  }),
  success: Schema.Void,
  error: Schema.Union(SessionNotFoundError, SteerUnsupportedError),
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
