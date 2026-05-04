import {
  query,
  type Options,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { Effect, Mailbox, Stream } from "effect";

import {
  AgentSessionStartError,
  type AgentEvent,
  type AgentItemId,
  type AgentSessionId,
  type PermissionDecision,
  type PermissionKind,
  type RuntimeMode,
  type StartSessionInput,
} from "@forkzero/wire";

/**
 * Live-only handle for one Claude SDK conversation. The orchestrator
 * (`ProviderService`) owns the map of sessionId → handle and forwards wire
 * RPCs to these methods.
 */
export interface ClaudeSessionHandle {
  readonly events: Stream.Stream<AgentEvent>;
  readonly send: (text: string) => Effect.Effect<void>;
  readonly interrupt: () => Effect.Effect<void>;
  readonly close: () => Effect.Effect<void>;
}

/**
 * Tiny promise-backed async input channel. The Claude SDK's streaming-input
 * mode wants an `AsyncIterable<SDKUserMessage>`; we want imperative pushes
 * from `send()`. This bridges the two without pulling in another dependency.
 * `push` after `close` is silently dropped.
 */
class UserInputChannel implements AsyncIterable<SDKUserMessage> {
  private buffer: SDKUserMessage[] = [];
  private waiting: ((r: IteratorResult<SDKUserMessage>) => void) | null = null;
  private closed = false;

  push(message: SDKUserMessage): void {
    if (this.closed) return;
    if (this.waiting !== null) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: message, done: false });
      return;
    }
    this.buffer.push(message);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.waiting !== null) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () =>
        new Promise<IteratorResult<SDKUserMessage>>((resolve) => {
          const next = this.buffer.shift();
          if (next !== undefined) {
            resolve({ value: next, done: false });
            return;
          }
          if (this.closed) {
            resolve({ value: undefined, done: true });
            return;
          }
          this.waiting = resolve;
        }),
    };
  }
}

const userMessageOf = (text: string, sessionId: string): SDKUserMessage => ({
  type: "user",
  message: {
    role: "user",
    content: [{ type: "text", text }],
  },
  parent_tool_use_id: null,
  session_id: sessionId,
});

let itemCounter = 0;
const nextItemId = (): AgentItemId =>
  `i_${Date.now()}_${++itemCounter}` as AgentItemId;

// Markers Claude Code injects into every subprocess it spawns. If forkzero
// is launched from a Claude Code terminal these get inherited, and the
// nested `claude` binary then loads a different parent's session state
// instead of the user's `claude /login` OAuth. Strip them so our spawn
// runs as if the user had launched it from a fresh shell.
const INHERITED_CLAUDE_MARKERS = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_AGENT_SDK_VERSION",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_SESSION_NAME",
  "CLAUDE_CODE_SESSION_LOG",
] as const;

const scrubInheritedClaudeMarkers = (
  base: NodeJS.ProcessEnv,
): Record<string, string | undefined> => {
  const next: Record<string, string | undefined> = { ...base };
  for (const key of INHERITED_CLAUDE_MARKERS) delete next[key];
  return next;
};


/**
 * Per-turn accumulator for thinking_delta / redacted_thinking blocks. The
 * SDK delivers raw `content_block_*` events when `includePartialMessages`
 * is on; we stitch them back together because the completed assistant
 * message has the `thinking` field stripped (SDK policy).
 *
 * Keyed by `index` from the stream events, which is stable within one
 * message but resets per turn — `message_start` clears the map.
 */
interface ThinkingAccumulator {
  kind: "thinking" | "redacted_thinking";
  text: string;
  signatureLength: number;
}

interface TranslateState {
  thinkingByIndex: Map<number, ThinkingAccumulator>;
  emittedThinkingThisTurn: boolean;
}

const newTranslateState = (): TranslateState => ({
  thinkingByIndex: new Map(),
  emittedThinkingThisTurn: false,
});

// Off by default; enable with FORKZERO_DEBUG_THINKING=1 when diagnosing
// thinking-block delivery. One JSON object per line so terminal
// scrollback / `grep` / `tee logfile` all preserve every field — Node's
// default util.inspect spans multiple lines and gets chopped by
// line-oriented tools.
const THINKING_DEBUG = process.env.FORKZERO_DEBUG_THINKING === "1";
const tlog = (event: string, payload: Record<string, unknown> = {}): void => {
  if (!THINKING_DEBUG) return;
  let line: string;
  try {
    line = JSON.stringify({ event, ...payload });
  } catch {
    line = JSON.stringify({ event, error: "unserializable payload" });
  }
  // eslint-disable-next-line no-console
  console.error(`[claude-driver/thinking] ${line}`);
};
const summarize = (value: unknown, max = 200): string => {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return s.length > max ? `${s.slice(0, max)}…(${s.length}b)` : s;
  } catch {
    return String(value);
  }
};

/**
 * Translate one SDKMessage into zero-or-more wire AgentEvents. Mostly
 * stateless, but the `state` carries thinking-delta accumulators across
 * `stream_event` messages so we can emit one Thinking event per content
 * block at its `content_block_stop`.
 */
const translate = (
  msg: SDKMessage,
  state: TranslateState,
): ReadonlyArray<AgentEvent> => {
  tlog("sdk-msg", {
    type: (msg as { type?: unknown }).type,
    hasMessage: "message" in (msg as object),
    sessionId: (msg as { session_id?: unknown }).session_id,
  });
  if (msg.type === "assistant") {
    const out: AgentEvent[] = [];
    const content = msg.message.content;
    const blockTypes: string[] = [];
    if (Array.isArray(content)) {
      for (const block of content) {
        blockTypes.push(String((block as { type?: unknown }).type));
        if (block.type === "text" && typeof block.text === "string") {
          out.push({
            _tag: "AssistantMessage",
            itemId: nextItemId(),
            text: block.text,
          });
        } else if (block.type === "tool_use") {
          const id =
            typeof (block as { id?: unknown }).id === "string"
              ? ((block as { id: string }).id as AgentItemId)
              : nextItemId();
          out.push({
            _tag: "ToolUse",
            itemId: id,
            tool: block.name,
            input: block.input,
          });
        } else if (
          block.type === "thinking" &&
          typeof (block as { thinking?: unknown }).thinking === "string"
        ) {
          // Fallback: if the partial-message deltas didn't deliver
          // anything for this turn (e.g. SDK strips them too), at least
          // emit whatever the assistant message has — even if `thinking`
          // is empty — so a row appears and we know thinking happened.
          const text = (block as { thinking: string }).thinking;
          tlog("assistant.thinking-block", {
            textLen: text.length,
            emittedFromDeltasThisTurn: state.emittedThinkingThisTurn,
            preview: summarize(text),
          });
          if (!state.emittedThinkingThisTurn) {
            out.push({
              _tag: "Thinking",
              itemId: nextItemId(),
              text,
              redacted: false,
            });
          }
        } else if (block.type === "redacted_thinking") {
          tlog("assistant.redacted-thinking-block", {
            emittedFromDeltasThisTurn: state.emittedThinkingThisTurn,
          });
          if (!state.emittedThinkingThisTurn) {
            out.push({
              _tag: "Thinking",
              itemId: nextItemId(),
              text: "",
              redacted: true,
            });
          }
        }
      }
    }
    tlog("assistant.blocks", { types: blockTypes, emitted: out.length });
    return out;
  }
  if (msg.type === "stream_event") {
    const ev = (msg as { event?: unknown }).event as
      | Record<string, unknown>
      | undefined;
    if (ev === undefined || typeof ev.type !== "string") {
      tlog("stream_event.malformed", { event: summarize(ev) });
      return [];
    }
    if (ev.type === "message_start") {
      state.thinkingByIndex.clear();
      state.emittedThinkingThisTurn = false;
      tlog("stream_event.message_start");
      return [];
    }
    if (ev.type === "content_block_start") {
      const index = typeof ev.index === "number" ? ev.index : null;
      const block = ev.content_block as Record<string, unknown> | undefined;
      tlog("stream_event.content_block_start", {
        index,
        blockType: block?.type,
        block: summarize(block),
      });
      if (index === null || block === undefined) return [];
      if (block.type === "thinking") {
        state.thinkingByIndex.set(index, {
          kind: "thinking",
          text: "",
          signatureLength: 0,
        });
      } else if (block.type === "redacted_thinking") {
        state.thinkingByIndex.set(index, {
          kind: "redacted_thinking",
          text: "",
          signatureLength: 0,
        });
      }
      return [];
    }
    if (ev.type === "content_block_delta") {
      const index = typeof ev.index === "number" ? ev.index : null;
      const delta = ev.delta as Record<string, unknown> | undefined;
      if (index === null || delta === undefined) {
        tlog("stream_event.content_block_delta.malformed", {
          index,
          delta: summarize(delta),
        });
        return [];
      }
      const acc = state.thinkingByIndex.get(index);
      if (delta.type === "thinking_delta") {
        const chunk =
          typeof delta.thinking === "string" ? delta.thinking : "";
        tlog("stream_event.thinking_delta", {
          index,
          chunkLen: chunk.length,
          chunkPreview: summarize(chunk, 80),
          haveAccumulator: acc !== undefined,
        });
        if (acc !== undefined) acc.text += chunk;
      } else if (delta.type === "signature_delta") {
        // signatures confirm thinking happened even when text is empty
        const sig =
          typeof delta.signature === "string" ? delta.signature : "";
        tlog("stream_event.signature_delta", { index, sigLen: sig.length });
        if (acc !== undefined) acc.signatureLength += sig.length;
      } else if (
        delta.type !== "text_delta" &&
        delta.type !== "input_json_delta"
      ) {
        tlog("stream_event.other_delta", {
          index,
          deltaType: delta.type,
          delta: summarize(delta),
        });
      }
      return [];
    }
    if (ev.type === "content_block_stop") {
      const index = typeof ev.index === "number" ? ev.index : null;
      if (index === null) return [];
      const acc = state.thinkingByIndex.get(index);
      if (acc === undefined) return [];
      state.thinkingByIndex.delete(index);
      tlog("stream_event.content_block_stop[thinking]", {
        index,
        kind: acc.kind,
        textLen: acc.text.length,
        signatureLen: acc.signatureLength,
        textPreview: summarize(acc.text),
      });
      if (acc.kind === "redacted_thinking") {
        state.emittedThinkingThisTurn = true;
        return [
          {
            _tag: "Thinking",
            itemId: nextItemId(),
            text: "",
            redacted: true,
          },
        ];
      }
      if (acc.text.length > 0) {
        state.emittedThinkingThisTurn = true;
        return [
          {
            _tag: "Thinking",
            itemId: nextItemId(),
            text: acc.text,
            redacted: false,
          },
        ];
      }
      // Empty thinking + a non-zero signature still indicates a thought
      // was produced — render the empty placeholder so the user can see
      // it happened. (If signature is also zero, drop silently.)
      if (acc.signatureLength > 0) {
        state.emittedThinkingThisTurn = true;
        return [
          {
            _tag: "Thinking",
            itemId: nextItemId(),
            text: "",
            redacted: false,
          },
        ];
      }
      return [];
    }
    return [];
  }
  if (msg.type === "user") {
    // Tool results come back as user messages with tool_result content blocks.
    const out: AgentEvent[] = [];
    const content = msg.message.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "tool_result") {
          // Pair to the originating tool_use by the SDK's correlation id;
          // fall back to a fresh id only if the SDK omits it (shouldn't
          // happen for valid tool_result blocks).
          const id =
            typeof (block as { tool_use_id?: unknown }).tool_use_id ===
            "string"
              ? ((block as { tool_use_id: string })
                  .tool_use_id as AgentItemId)
              : nextItemId();
          out.push({
            _tag: "ToolResult",
            itemId: id,
            output: block.content ?? null,
            isError: block.is_error === true,
          });
        }
      }
    }
    return out;
  }
  if (msg.type === "result") {
    if (msg.subtype === "success") {
      return [{ _tag: "Completed", reason: "ended" }];
    }
    return [{ _tag: "Completed", reason: "error" }];
  }
  return [];
};

/**
 * Tools the agent can run without a prompt. These are pure reads or
 * internal-state tools (`TodoWrite`) with no observable blast radius. The
 * `Read` exception for sensitive paths is enforced separately in
 * `policyFor` — even read-only tools force a prompt when the target looks
 * like a secret.
 */
const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "Read",
  "LS",
  "Glob",
  "Grep",
  "NotebookRead",
  "BashOutput",
  "TodoWrite",
]);

/**
 * Path patterns that always prompt regardless of any prior `AllowForSession`
 * or `AlwaysAllow` decision. Match anywhere in the path string — agents
 * tend to use absolute paths, so anchoring to a directory boundary catches
 * `~/.ssh/...` and `/path/to/repo/.env` alike.
 */
const SENSITIVE_PATTERNS: ReadonlyArray<RegExp> = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)credentials(\.[^/]+)?$/i,
  /(^|\/)\.aws\//,
  /(^|\/)\.ssh\//,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)\.netrc$/,
  /(^|\/)\.pgpass$/,
];

const isSensitivePath = (p: string): boolean =>
  SENSITIVE_PATTERNS.some((re) => re.test(p));

type ToolPolicy =
  | { readonly kind: "auto-allow" }
  | { readonly kind: "prompt"; readonly forcePrompt: boolean };

const FILE_EDIT_TOOLS: ReadonlySet<string> = new Set([
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
]);

const editPathOf = (toolInput: Record<string, unknown>): string =>
  typeof toolInput.file_path === "string"
    ? toolInput.file_path
    : typeof toolInput.notebook_path === "string"
      ? (toolInput.notebook_path as string)
      : "";

/**
 * Decide whether the SDK's tool call needs to bother the user. Layered:
 *
 *   1. Sensitive paths always force a prompt (`forcePrompt: true`) — this is
 *      the safety net that survives every other allow rule, including
 *      `full-access` mode.
 *   2. Read-only tools auto-allow.
 *   3. `auto-accept-edits` mode short-circuits file edits.
 *   4. `full-access` mode short-circuits everything else.
 *   5. Otherwise, prompt.
 */
const policyFor = (
  toolName: string,
  toolInput: Record<string, unknown>,
  runtimeMode: RuntimeMode,
): ToolPolicy => {
  // 1. Sensitive paths — checked before any auto-allow. Even YOLO mode prompts.
  if (toolName === "Read") {
    const path = typeof toolInput.file_path === "string"
      ? toolInput.file_path
      : "";
    if (path.length > 0 && isSensitivePath(path)) {
      return { kind: "prompt", forcePrompt: true };
    }
  }
  if (FILE_EDIT_TOOLS.has(toolName)) {
    const path = editPathOf(toolInput);
    if (path.length > 0 && isSensitivePath(path)) {
      return { kind: "prompt", forcePrompt: true };
    }
  }

  // 2. Read-only tools — always free, regardless of mode.
  if (READ_ONLY_TOOLS.has(toolName)) {
    return { kind: "auto-allow" };
  }

  // 3. auto-accept-edits — file edits skip the prompt; everything else falls
  //    through to the regular prompt flow.
  if (runtimeMode === "auto-accept-edits" && FILE_EDIT_TOOLS.has(toolName)) {
    return { kind: "auto-allow" };
  }

  // 4. full-access — auto-allow anything that survived the sensitive-path check.
  if (runtimeMode === "full-access") {
    return { kind: "auto-allow" };
  }

  return { kind: "prompt", forcePrompt: false };
};

/**
 * Map a Claude SDK tool invocation onto a wire `PermissionKind`. Tools we
 * don't classify drop into `Other`; the server treats those as auto-allow
 * for now (logged) so the agent loop isn't stalled by every internal `Read`
 * or `Glob`. Adding a classification is a one-line change here.
 */
const kindForTool = (
  toolName: string,
  toolInput: Record<string, unknown>,
): PermissionKind => {
  switch (toolName) {
    case "Bash": {
      const command = typeof toolInput.command === "string"
        ? toolInput.command
        : JSON.stringify(toolInput);
      return { _tag: "Bash", command };
    }
    case "Edit":
    case "Write":
    case "MultiEdit":
    case "NotebookEdit": {
      const path =
        typeof toolInput.file_path === "string"
          ? toolInput.file_path
          : typeof toolInput.notebook_path === "string"
            ? (toolInput.notebook_path as string)
            : "(unknown)";
      return { _tag: "FileWrite", path };
    }
    case "WebFetch":
    case "WebSearch": {
      const url =
        typeof toolInput.url === "string"
          ? toolInput.url
          : typeof toolInput.query === "string"
            ? `search:${toolInput.query as string}`
            : "(unknown)";
      return { _tag: "Network", url };
    }
    default: {
      const summary = JSON.stringify(toolInput).slice(0, 120);
      return { _tag: "Other", tool: toolName, summary };
    }
  }
};

/**
 * Hook the driver passes into the SDK's `canUseTool`. Returning a
 * `PermissionDecision` lets the orchestrator (`ProviderService`) plug
 * `PermissionService.request` in directly without the driver reaching
 * across modules. `forcePrompt` flows through to the broker so sensitive
 * paths can't be silenced by prior `AllowForSession` / `AlwaysAllow` rows.
 */
export type RequestPermission = (
  sessionId: AgentSessionId,
  kind: PermissionKind,
  options: { readonly forcePrompt: boolean },
) => Promise<PermissionDecision>;

/**
 * Spin up a streaming-input Claude conversation. The SDK is driven by an
 * AsyncIterable we push into from `send()`; the SDK's outbound async generator
 * is consumed by a forked daemon that translates messages into wire events
 * and offers them to the per-session mailbox.
 *
 * `apiKey` is the keychain-stored API key, if any. When non-null we set
 * `ANTHROPIC_API_KEY` on the spawned `claude` subprocess. When null we omit
 * the SDK's `env` option entirely so `process.env` is inherited — that lets
 * the spawned `claude` CLI find its own OAuth credentials (macOS keychain
 * entry "Claude Code-credentials" or `~/.claude/.credentials.json`). This
 * is the primary auth path; API keys are a fallback.
 *
 * `requestPermission` is the bridge to `PermissionService`. It returns a
 * decision the caller honors via the SDK's allow/deny contract; the driver
 * itself stays free of any DB or PubSub wiring.
 */
/**
 * Live read of the per-session runtime mode. Called inside `canUseTool` so
 * the user toggling the chat header takes effect on the next tool call —
 * no SDK restart needed.
 */
export type GetRuntimeMode = () => RuntimeMode;

export const startClaudeSession = (
  input: StartSessionInput,
  cwd: string,
  apiKey: string | null,
  claudeExecutablePath: string | null,
  sessionId: AgentSessionId,
  requestPermission: RequestPermission,
  getRuntimeMode: GetRuntimeMode,
  resumeCursor: string | null = null,
): Effect.Effect<ClaudeSessionHandle, AgentSessionStartError> =>
  Effect.gen(function* () {
    const events = yield* Mailbox.make<AgentEvent>();
    const inputChannel = new UserInputChannel();
    const abort = new AbortController();

    if (input.initialPrompt !== undefined && input.initialPrompt.length > 0) {
      inputChannel.push(userMessageOf(input.initialPrompt, sessionId));
    }

    // Pass `process.env` through, but scrub any "we are inside another
    // Claude Code session" markers that Claude Code injects into its child
    // shells. When forkzero is launched from a Claude Code terminal (very
    // common during dev), the shell inherits CLAUDECODE=1,
    // CLAUDE_CODE_ENTRYPOINT, CLAUDE_CODE_EXECPATH, and friends — which
    // confuses the spawned `claude` binary's auth resolver into thinking
    // it's a nested SDK call from a different Claude installation, and the
    // `EXECPATH` even redirects to a sibling app's bundled binary with its
    // own auth state. The result is "Invalid API key · Fix external API
    // key" even with a perfectly valid `claude /login`.
    //
    // The SDK adds back its own `CLAUDE_CODE_ENTRYPOINT="sdk-ts"` for
    // telemetry purposes (we read it back in error messages); that's fine
    // because it lets the binary know IT is the SDK process, not its parent.
    //
    // `pathToClaudeCodeExecutable` points at the user's globally-installed
    // `claude`. Without it, the SDK falls back to its bundled native CLI —
    // shipped as an optional native dep that doesn't always install (yields
    // "Native CLI binary for darwin-arm64 not found").
    const env = scrubInheritedClaudeMarkers(process.env);
    if (apiKey !== null) env.ANTHROPIC_API_KEY = apiKey;
    const options: Options = {
      cwd,
      abortController: abort,
      ...(claudeExecutablePath !== null
        ? { pathToClaudeCodeExecutable: claudeExecutablePath }
        : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      // `effort: "high"` enables deep reasoning. We pair it with an
      // explicit `display: "summarized"` because Opus 4.7 defaults the
      // adaptive-thinking display to "omitted" — meaning the API
      // intentionally returns empty thinking text plus a signature.
      // Without this override, our `thinking_delta` chunks arrive empty
      // even though the model thought (we see `signature_delta` only).
      // Other Claude 4 models default to "summarized" so this is a
      // no-op for them.
      effort: "high",
      thinking: { type: "adaptive", display: "summarized" },
      forwardSubagentText: true,
      // Surfaces thinking deltas in the partial-message stream so we
      // can render thinking as it streams in.
      includePartialMessages: true,
      env: env as Options["env"],
      // Bridge the SDK's permission callback to the server-side
      // `PermissionService`. The renderer's toast eventually fulfills the
      // promise this awaits.
      canUseTool: async (toolName, toolInput) => {
        const policy = policyFor(toolName, toolInput, getRuntimeMode());
        if (policy.kind === "auto-allow") {
          // Read / LS / Glob / Grep / NotebookRead / BashOutput / TodoWrite
          // skip the prompt entirely. We deliberately don't surface a
          // `PermissionRequest` event for these — the timeline already
          // shows the underlying `tool_use`, and a second "I asked for
          // permission and was given it" row would be pure noise.
          return { behavior: "allow", updatedInput: toolInput };
        }
        const kind = kindForTool(toolName, toolInput);
        events.unsafeOffer({
          _tag: "PermissionRequest",
          itemId: nextItemId(),
          kind: toolName,
          details: toolInput,
        });
        const decision = await requestPermission(sessionId, kind, {
          forcePrompt: policy.forcePrompt,
        });
        if (decision._tag === "Deny") {
          return {
            behavior: "deny",
            message: "User denied this tool call.",
          };
        }
        // AllowOnce / AllowForSession / AlwaysAllow → allow. The session
        // and folder scopes are enforced server-side: a second request
        // with the same (sessionId|projectId, kindKey) short-circuits to
        // AllowOnce without prompting (unless `forcePrompt` is set).
        return { behavior: "allow", updatedInput: toolInput };
      },
    };

    events.unsafeOffer({
      _tag: "Started",
      sessionId,
      providerId: "claude",
      mode: "sdk",
    });

    // If the caller has a resume cursor, hand it to the SDK before opening
    // the conversation. Mutually exclusive with `forkSession` per SDK docs.
    if (resumeCursor !== null) {
      options.resume = resumeCursor;
    }

    let q: Query;
    try {
      q = query({ prompt: inputChannel, options });
    } catch (cause) {
      yield* events.end;
      return yield* Effect.fail(
        new AgentSessionStartError({
          providerId: "claude",
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
      );
    }

    // Pump SDK messages → AgentEvents in a forked daemon. Sessions outlive the
    // start RPC; `close()` is what ends the pump (input close + abort, which
    // makes the SDK loop terminate). On the first message that has a
    // populated `session_id` we surface it as `SessionCursor` so MessageStore
    // can persist it for resume.
    let cursorAnnounced = false;
    const translateState = newTranslateState();
    const pump = Effect.tryPromise({
      try: async () => {
        for await (const msg of q) {
          if (!cursorAnnounced) {
            const sid = (msg as { session_id?: unknown }).session_id;
            if (typeof sid === "string" && sid.length > 0) {
              cursorAnnounced = true;
              events.unsafeOffer({
                _tag: "SessionCursor",
                cursor: sid,
                strategy: "claude-session-id",
              });
            }
          }
          const translated = translate(msg, translateState);
          for (const ev of translated) {
            events.unsafeOffer(ev);
          }
        }
      },
      catch: (cause) => cause,
    }).pipe(
      Effect.catchAll((cause) =>
        Effect.sync(() => {
          events.unsafeOffer({
            _tag: "Error",
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }),
      ),
      Effect.ensuring(events.end),
    );

    yield* Effect.forkDaemon(pump);

    const handle: ClaudeSessionHandle = {
      events: Mailbox.toStream(events),
      send: (text) =>
        Effect.sync(() => {
          inputChannel.push(userMessageOf(text, sessionId));
        }),
      interrupt: () =>
        Effect.tryPromise({
          try: () => q.interrupt(),
          catch: (cause) => cause,
        }).pipe(Effect.catchAll(() => Effect.void)),
      close: () =>
        Effect.sync(() => {
          inputChannel.close();
          abort.abort();
        }),
    };
    return handle;
  });
