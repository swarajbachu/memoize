import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { ProviderId } from "./agent.ts";
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

export class Session extends Schema.Class<Session>("Session")({
  id: SessionId,
  projectId: FolderId,
  title: Schema.String,
  providerId: ProviderId,
  model: Schema.String,
  status: SessionStatus,
  archivedAt: Schema.NullOr(Schema.DateFromString),
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
  AssistantContent,
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
