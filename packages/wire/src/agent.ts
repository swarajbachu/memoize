import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import {
  AgentItemId,
  AgentSessionId,
  AgentTurnId,
  FolderId,
} from "./ids.ts";

/**
 * Identifier for a provider implementation (driver). v1 ships claude + codex;
 * the literal union is the contract — adding a new provider is an additive
 * change here plus a new driver in `apps/server/src/provider/drivers/`.
 */
export const ProviderId = Schema.Literal("claude", "codex");
export type ProviderId = typeof ProviderId.Type;

/**
 * How a session is being driven. `spawn-cli` is just a PTY launch with a known
 * argv; `sdk` runs through the in-process adapter and emits structured events.
 */
export const SessionMode = Schema.Literal("spawn-cli", "sdk");
export type SessionMode = typeof SessionMode.Type;

/**
 * High-level session lifecycle state. Mirrors what the side-panel chip shows.
 */
export const AgentStatus = Schema.Literal(
  "idle",
  "starting",
  "running",
  "waiting",
  "closed",
  "error",
);
export type AgentStatus = typeof AgentStatus.Type;

/**
 * Static availability report for a provider — does the user have the CLI on
 * PATH, is the CLI logged in (so the SDK can ride the local OAuth subprocess),
 * is an API key stored in the keychain. Either `cliLoggedIn` or `hasApiKey`
 * is enough to start a session; the renderer should treat them as equivalent
 * "ready" signals and prefer CLI login as the primary path.
 */
export const AgentAvailability = Schema.Struct({
  providerId: ProviderId,
  displayName: Schema.String,
  cliInstalled: Schema.Boolean,
  cliVersion: Schema.optional(Schema.String),
  cliPath: Schema.optional(Schema.String),
  cliLoggedIn: Schema.Boolean,
  hasApiKey: Schema.Boolean,
});
export type AgentAvailability = typeof AgentAvailability.Type;

// ---------------------------------------------------------------------------
// Event union — emitted on agent.events stream, one row per event. The split
// is intentionally broad so the renderer can render each kind without a giant
// switch on payload shape; phases 3+ add fields to existing tags rather than
// introducing new top-level shapes for the same concept.
// ---------------------------------------------------------------------------

const StartedEvent = Schema.TaggedStruct("Started", {
  sessionId: AgentSessionId,
  providerId: ProviderId,
  mode: SessionMode,
});

const StatusEvent = Schema.TaggedStruct("Status", {
  status: AgentStatus,
});

const AuthEvent = Schema.TaggedStruct("Auth", {
  sdkConfigured: Schema.Boolean,
});

const VersionEvent = Schema.TaggedStruct("Version", {
  cliVersion: Schema.optional(Schema.String),
  sdkVersion: Schema.optional(Schema.String),
});

const CapabilitiesEvent = Schema.TaggedStruct("Capabilities", {
  capabilities: Schema.Array(Schema.String),
});

const AssistantMessageEvent = Schema.TaggedStruct("AssistantMessage", {
  itemId: AgentItemId,
  text: Schema.String,
});

const ToolUseEvent = Schema.TaggedStruct("ToolUse", {
  itemId: AgentItemId,
  tool: Schema.String,
  input: Schema.Unknown,
});

const ToolResultEvent = Schema.TaggedStruct("ToolResult", {
  itemId: AgentItemId,
  output: Schema.Unknown,
  isError: Schema.Boolean,
});

/**
 * Phase 3 surface — the SDK asks the user before doing something dangerous
 * (running a shell command, writing outside the workspace, etc.). v2 just
 * auto-denies and emits this so the UI can toast "Phase 3 will let you allow
 * this."
 */
const PermissionRequestEvent = Schema.TaggedStruct("PermissionRequest", {
  itemId: AgentItemId,
  kind: Schema.String,
  details: Schema.Unknown,
});

const CompletedEvent = Schema.TaggedStruct("Completed", {
  reason: Schema.Literal("ended", "interrupted", "error"),
});

const ErrorEvent = Schema.TaggedStruct("Error", {
  message: Schema.String,
});

/**
 * Driver-emitted side-channel for the SDK's resume token. Claude exposes
 * its session UUID as `session_id` on every message; the driver captures
 * it on first sight and emits this event so MessageStore can persist it
 * onto `sessions.cursor` / `sessions.resume_strategy`. Lifecycle-only —
 * never persisted as a chat row.
 */
const SessionCursorEvent = Schema.TaggedStruct("SessionCursor", {
  cursor: Schema.String,
  strategy: Schema.Literal("claude-session-id"),
});

export const AgentEvent = Schema.Union(
  StartedEvent,
  StatusEvent,
  AuthEvent,
  VersionEvent,
  CapabilitiesEvent,
  AssistantMessageEvent,
  ToolUseEvent,
  ToolResultEvent,
  PermissionRequestEvent,
  SessionCursorEvent,
  CompletedEvent,
  ErrorEvent,
);
export type AgentEvent = typeof AgentEvent.Type;

// ---------------------------------------------------------------------------
// RPC inputs
// ---------------------------------------------------------------------------

export const StartSessionInput = Schema.Struct({
  folderId: FolderId,
  providerId: ProviderId,
  mode: SessionMode,
  initialPrompt: Schema.optional(Schema.String),
  // Optional caller-supplied id. When omitted, ProviderService mints a fresh
  // one. MessageStore uses this to lazy-restart a closed session without
  // moving its persisted history to a new row.
  sessionId: Schema.optional(AgentSessionId),
  // Optional provider-specific model id (e.g. "claude-opus-4-7"). Drivers
  // forward it to the SDK; omitting it lets the SDK pick its own default.
  model: Schema.optional(Schema.String),
});
export type StartSessionInput = typeof StartSessionInput.Type;

/**
 * Curated list of provider × model pairs the renderer offers in the
 * new-session picker. Source of truth so the dropdown and the server agree
 * on what's selectable. Adding a model here is the only change needed —
 * drivers pass the string through to the SDK as-is.
 */
export interface ModelOption {
  readonly id: string;
  readonly label: string;
}

export const MODELS_BY_PROVIDER: Record<ProviderId, ReadonlyArray<ModelOption>> = {
  claude: [
    { id: "claude-opus-4-7", label: "Opus 4.7" },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    { id: "claude-haiku-4-5", label: "Haiku 4.5" },
  ],
  codex: [
    { id: "gpt-5-codex", label: "GPT-5 Codex" },
    { id: "gpt-5", label: "GPT-5" },
  ],
};

export const defaultModelFor = (providerId: ProviderId): string =>
  MODELS_BY_PROVIDER[providerId][0]!.id;

export const SendInput = Schema.Struct({
  sessionId: AgentSessionId,
  text: Schema.String,
});
export type SendInput = typeof SendInput.Type;

export const InterruptInput = Schema.Struct({
  sessionId: AgentSessionId,
  turnId: Schema.optional(AgentTurnId),
});
export type InterruptInput = typeof InterruptInput.Type;

export const CloseInput = Schema.Struct({
  sessionId: AgentSessionId,
});
export type CloseInput = typeof CloseInput.Type;

export const SetCredentialInput = Schema.Struct({
  providerId: ProviderId,
  apiKey: Schema.String,
});
export type SetCredentialInput = typeof SetCredentialInput.Type;

// ---------------------------------------------------------------------------
// Wire errors
// ---------------------------------------------------------------------------

export class ProviderNotAvailableError extends Schema.TaggedError<ProviderNotAvailableError>()(
  "ProviderNotAvailableError",
  { providerId: ProviderId, reason: Schema.String },
) {}

export class AgentSessionNotFoundError extends Schema.TaggedError<AgentSessionNotFoundError>()(
  "AgentSessionNotFoundError",
  { sessionId: AgentSessionId },
) {}

export class AgentSessionStartError extends Schema.TaggedError<AgentSessionStartError>()(
  "AgentSessionStartError",
  { providerId: ProviderId, reason: Schema.String },
) {}

export class CredentialStoreError extends Schema.TaggedError<CredentialStoreError>()(
  "CredentialStoreError",
  { providerId: ProviderId, reason: Schema.String },
) {}

// ---------------------------------------------------------------------------
// RPC definitions. Not yet registered in `ForkzeroRpcs` — handlers come
// online in PR 3 (availability), PR 4 (credentials), PR 5/6 (sessions). Each
// of those PRs adds its RPC to the group when its handler exists.
// ---------------------------------------------------------------------------

export const AgentAvailabilityRpc = Rpc.make("agent.availability", {
  payload: Schema.Struct({}),
  success: Schema.Array(AgentAvailability),
});

export const AgentStartRpc = Rpc.make("agent.start", {
  payload: StartSessionInput,
  success: Schema.Struct({ sessionId: AgentSessionId }),
  error: Schema.Union(ProviderNotAvailableError, AgentSessionStartError),
});

export const AgentSendRpc = Rpc.make("agent.send", {
  payload: SendInput,
  success: Schema.Void,
  error: AgentSessionNotFoundError,
});

export const AgentInterruptRpc = Rpc.make("agent.interrupt", {
  payload: InterruptInput,
  success: Schema.Void,
  error: AgentSessionNotFoundError,
});

export const AgentCloseRpc = Rpc.make("agent.close", {
  payload: CloseInput,
  success: Schema.Void,
  error: AgentSessionNotFoundError,
});

export const AgentEventsRpc = Rpc.make("agent.events", {
  payload: Schema.Struct({ sessionId: AgentSessionId }),
  success: AgentEvent,
  error: AgentSessionNotFoundError,
  stream: true,
});

export const AgentSetCredentialRpc = Rpc.make("agent.setCredential", {
  payload: SetCredentialInput,
  success: Schema.Void,
  error: CredentialStoreError,
});
