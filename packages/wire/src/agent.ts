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
export const ProviderId = Schema.Literal("claude", "codex", "grok");
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
 * How permission prompts behave for a session (or a sub-agent). Originally
 * declared in `session.ts`; lifted here so `AgentDefinition.permissionMode`
 * can reuse the same literal set without an import cycle.
 *
 *   - `approval-required` — prompt every write/Bash/Network/Task/MCP call.
 *   - `auto-accept-edits` — also auto-allow Edit / Write / MultiEdit /
 *     NotebookEdit. Bash / Network / Task / MCP still prompt.
 *   - `full-access` — auto-allow everything except sensitive paths.
 */
export const RuntimeMode = Schema.Literal(
  "approval-required",
  "auto-accept-edits",
  "full-access",
);
export type RuntimeMode = typeof RuntimeMode.Type;
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "approval-required";

/**
 * SDK-level lifecycle mode. Distinct from `RuntimeMode` (which controls our
 * own auto-allow policy): this maps onto the Claude Agent SDK's
 * `Options.permissionMode`.
 *
 *   - `default` — normal operation; `canUseTool` decides each call.
 *   - `plan` — agent reads / explores only and ends turns by calling the
 *     SDK's built-in `ExitPlanMode` tool with a proposed plan.
 *   - `acceptEdits` — file edits skip the prompt; everything else goes
 *     through `canUseTool`. Equivalent to RuntimeMode `auto-accept-edits`.
 *
 * The two modes coexist: `permissionMode: 'plan'` short-circuits all
 * write/exec tools regardless of `RuntimeMode`. Approving the plan
 * switches `permissionMode` back to `default` and the existing `RuntimeMode`
 * resumes governing prompts.
 */
export const PermissionMode = Schema.Literal(
  "default",
  "plan",
  "acceptEdits",
);
export type PermissionMode = typeof PermissionMode.Type;
export const DEFAULT_PERMISSION_MODE: PermissionMode = "default";

/**
 * Per-provider verdict on whether the installed CLI is new enough for the
 * SDK we ship against.
 *
 *   - `ok` — version parsed and meets/exceeds the SDK's minimum
 *   - `outdated` — version parsed but is below the minimum (`cliVersionMinRequired`
 *     carries the floor so the renderer can render "Codex 0.27.0 < 0.128.0")
 *   - `unknown` — no `--version` output, parser failed, or no minimum tracked
 *     for this provider. Treat as "let them try" so a parser bug doesn't
 *     block a legitimate session start.
 */
export const CliVersionStatus = Schema.Literal("ok", "outdated", "unknown");
export type CliVersionStatus = typeof CliVersionStatus.Type;

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
  /**
   * Computed verdict on whether `cliVersion` meets the SDK's minimum. The
   * renderer renders an "Upgrade Codex" card when this is `"outdated"` so
   * the user sees the upgrade path *before* attempting to start a session.
   */
  cliVersionStatus: Schema.optional(CliVersionStatus),
  /**
   * Minimum CLI version the bundled SDK requires (e.g. `"0.128.0"`). Set in
   * tandem with `cliVersionStatus`; rendered inside the upgrade card.
   */
  cliVersionMinRequired: Schema.optional(Schema.String),
  /**
   * One-line shell command we recommend the user run to fix an outdated
   * CLI. Co-located with the version probe so renderer doesn't need its
   * own per-provider install lookup.
   */
  cliUpgradeCommand: Schema.optional(Schema.String),
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
  // `parentItemId` is set when this message originated inside a sub-agent —
  // the value is the parent's `Agent` tool_use itemId so the renderer can
  // group nested rows under one collapsible wrapper. Absent for top-level.
  parentItemId: Schema.optional(AgentItemId),
});

const ThinkingEvent = Schema.TaggedStruct("Thinking", {
  itemId: AgentItemId,
  text: Schema.String,
  redacted: Schema.Boolean,
  parentItemId: Schema.optional(AgentItemId),
});

const ToolUseEvent = Schema.TaggedStruct("ToolUse", {
  itemId: AgentItemId,
  tool: Schema.String,
  input: Schema.Unknown,
  parentItemId: Schema.optional(AgentItemId),
});

const ToolResultEvent = Schema.TaggedStruct("ToolResult", {
  itemId: AgentItemId,
  output: Schema.Unknown,
  isError: Schema.Boolean,
  parentItemId: Schema.optional(AgentItemId),
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
  // Carries the parent Agent tool_use itemId when the requesting tool ran
  // inside a sub-agent context. The toast prepends "via <name> · <model> ·"
  // when set so the user sees who's actually asking.
  parentItemId: Schema.optional(AgentItemId),
});

/**
 * Closing summary for a sub-agent run. Emitted when the parent's
 * `Agent` tool_result lands; the wrapper-row footer reads from this when
 * collapsed.
 */
const SubagentSummaryEvent = Schema.TaggedStruct("SubagentSummary", {
  itemId: AgentItemId,
  agentName: Schema.String,
  model: Schema.String,
  turns: Schema.Number,
  durationMs: Schema.Number,
  summary: Schema.String,
  isError: Schema.Boolean,
});

/**
 * Per-turn token usage. Emitted on every SDK `result` message; tagged with
 * `parentItemId` when the result belongs to a sub-agent. The renderer
 * accumulates these into the per-agent footer.
 */
const UsageDeltaEvent = Schema.TaggedStruct("UsageDelta", {
  parentItemId: Schema.optional(AgentItemId),
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  cacheReadTokens: Schema.Number,
  cacheCreationTokens: Schema.Number,
  model: Schema.String,
});

const CompletedEvent = Schema.TaggedStruct("Completed", {
  reason: Schema.Literal("ended", "interrupted", "error"),
});

const ErrorEvent = Schema.TaggedStruct("Error", {
  message: Schema.String,
});

/**
 * Driver-emitted side-channel for the SDK's resume token. Claude exposes
 * its session UUID as `session_id` on every message; Codex exposes its
 * thread id via the `thread.started` event. Each driver captures the token
 * on first sight and emits this event so MessageStore can persist it onto
 * `sessions.cursor` / `sessions.resume_strategy`. Lifecycle-only — never
 * persisted as a chat row.
 */
const SessionCursorEvent = Schema.TaggedStruct("SessionCursor", {
  cursor: Schema.String,
  strategy: Schema.Literal(
    "claude-session-id",
    "codex-thread-id",
    "grok-session-id",
  ),
});

/**
 * Structured question shape used by both `UserQuestionEvent` and the
 * persisted `userQuestion` message row. Mirrors Conductor's
 * AskUserQuestion: a question with N preset options and optional
 * multi-select. The renderer always offers an additional "Other" free-text
 * field — there is no need to include it in `options`.
 */
export const UserQuestion = Schema.Struct({
  question: Schema.String,
  options: Schema.Array(Schema.String),
  multiSelect: Schema.optional(Schema.Boolean),
});
export type UserQuestion = typeof UserQuestion.Type;

/**
 * Emitted when the agent calls the in-process `AskUserQuestion` tool. The
 * renderer subscribes to this and renders a question card. `itemId` is the
 * SDK's `tool_use.id` so the eventual answer maps back to a single tool
 * call.
 */
const UserQuestionEvent = Schema.TaggedStruct("UserQuestion", {
  itemId: AgentItemId,
  questions: Schema.Array(UserQuestion),
  parentItemId: Schema.optional(AgentItemId),
});

/**
 * Emitted when `Query.setPermissionMode` succeeds. The renderer uses it to
 * keep the chat-header chip in sync without a round-trip.
 */
const PermissionModeChangedEvent = Schema.TaggedStruct(
  "PermissionModeChanged",
  { mode: PermissionMode },
);

export const AgentEvent = Schema.Union(
  StartedEvent,
  StatusEvent,
  AuthEvent,
  VersionEvent,
  CapabilitiesEvent,
  AssistantMessageEvent,
  ThinkingEvent,
  ToolUseEvent,
  ToolResultEvent,
  PermissionRequestEvent,
  SubagentSummaryEvent,
  UsageDeltaEvent,
  SessionCursorEvent,
  UserQuestionEvent,
  PermissionModeChangedEvent,
  CompletedEvent,
  ErrorEvent,
);
export type AgentEvent = typeof AgentEvent.Type;

// ---------------------------------------------------------------------------
// RPC inputs
// ---------------------------------------------------------------------------

/**
 * Definition of a sub-agent that the main agent can delegate to. Mirror of
 * the Claude Agent SDK's `AgentDefinition` shape (subset we expose now —
 * `skills`, `mcpServers`, `memory`, `effort`, `background`, and `isolation`
 * are reserved for follow-ups).
 *
 * `permissionMode` shadows the session's runtime mode for tool calls made
 * inside this sub-agent — used by `test-runner` to keep Bash prompts on
 * even when the parent session runs in `full-access`.
 */
export const AgentDefinition = Schema.Struct({
  description: Schema.String,
  prompt: Schema.String,
  tools: Schema.optional(Schema.Array(Schema.String)),
  disallowedTools: Schema.optional(Schema.Array(Schema.String)),
  model: Schema.optional(Schema.String),
  maxTurns: Schema.optional(Schema.Number),
  permissionMode: Schema.optional(RuntimeMode),
});
export type AgentDefinition = typeof AgentDefinition.Type;

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
  // Sub-agents the main agent may delegate to. Keys are the `subagent_type`
  // the SDK reports back on `Agent` tool_use blocks; values define each
  // sub-agent's prompt, tool subset, model, and permission mode. Empty /
  // omitted means no sub-agents — session behaves as before.
  agents: Schema.optional(
    Schema.Record({ key: Schema.String, value: AgentDefinition }),
  ),
  // Master toggle. When the renderer wants to start a Claude session with
  // sub-agents disabled even though presets exist, it sends this as false.
  // Defaults true when `agents` is non-empty; the driver only adds `Agent`
  // to `allowedTools` when the effective value is true.
  enableSubagents: Schema.optional(Schema.Boolean),
  /**
   * Optional absolute path the agent should run in. When omitted, the
   * provider resolves cwd from `folderId` (the project's main checkout).
   * `MessageStore` populates this with a worktree path when a session was
   * created against a worktree, so the SDK runs in the worktree dir.
   */
  cwdOverride: Schema.optional(Schema.String),
  /**
   * SDK lifecycle mode passed to `Options.permissionMode`. Defaults to
   * `default`. Pass `plan` to start the session in plan mode — the agent
   * will explore read-only and propose a plan via `ExitPlanMode`.
   */
  permissionMode: Schema.optional(PermissionMode),
  /**
   * When true, future MCP servers register without `alwaysLoad`, letting
   * the SDK delegate to its built-in tool search instead of inflating the
   * tool list every turn. No-op today (no MCP tools shipped yet); ready
   * for 0.04.
   */
  toolSearch: Schema.optional(Schema.Boolean),
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
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
    { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark" },
  ],
  // Seed list — Grok CLI's `-m` flag accepts any model id it knows, so a
  // custom slug typed by the user still works; this list is just what the
  // picker shows by default. `grok-build` is the only model free-tier
  // accounts can run (verified via `grok models`); the rest unlock with a
  // SuperGrok subscription. Passing a slug the account can't access yields
  // a clean 403 surfaced through grok's streaming-json `type: "error"`
  // envelope, so no client-side validation needed.
  grok: [
    { id: "grok-build", label: "Grok Build" },
    { id: "grok-4", label: "Grok 4" },
    { id: "grok-4-fast", label: "Grok 4 Fast" },
    { id: "grok-code-fast-1", label: "Grok Code Fast" },
  ],
};

export const defaultModelFor = (providerId: ProviderId): string =>
  MODELS_BY_PROVIDER[providerId][0]!.id;

/**
 * Aliases for codex model slugs that no longer work — current Codex CLI rejects
 * `gpt-5-codex` / `gpt-5` when the user is on a ChatGPT account. We rewrite
 * persisted user settings and incoming requests through this map so existing
 * sessions don't crash.
 */
export const MODEL_ALIASES_BY_PROVIDER: Record<ProviderId, Record<string, string>> = {
  claude: {},
  codex: {
    "gpt-5-codex": "gpt-5.4",
    "gpt-5": "gpt-5.4",
  },
  grok: {},
};

export const resolveModelSlug = (providerId: ProviderId, slug: string): string =>
  MODEL_ALIASES_BY_PROVIDER[providerId][slug] ?? slug;

/**
 * Per-million-token USD pricing used by the renderer to compute the
 * "saved ~$X" line in the per-agent cost footer. Numbers are reference
 * values — keep aligned with vendor pricing pages. The wire stays just
 * numbers; conversion to currency happens renderer-side.
 */
export interface ModelPricing {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheCreate: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-7": { input: 15, output: 75, cacheRead: 1.5, cacheCreate: 18.75 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheCreate: 1.25 },
};

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
// RPC definitions. Not yet registered in `MemoizeRpcs` — handlers come
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
