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
 * Translate one SDKMessage into zero-or-more wire AgentEvents. Phase 2 keeps
 * the mapping shallow — assistant text + tool_use + tool_result + result.
 * Other SDK message kinds (status, hooks, plugin install, …) are ignored;
 * Phase 3 will surface a richer subset.
 */
const translate = (msg: SDKMessage): ReadonlyArray<AgentEvent> => {
  if (msg.type === "assistant") {
    const out: AgentEvent[] = [];
    const content = msg.message.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text" && typeof block.text === "string") {
          out.push({
            _tag: "AssistantMessage",
            itemId: nextItemId(),
            text: block.text,
          });
        } else if (block.type === "tool_use") {
          out.push({
            _tag: "ToolUse",
            itemId: nextItemId(),
            tool: block.name,
            input: block.input,
          });
        }
      }
    }
    return out;
  }
  if (msg.type === "user") {
    // Tool results come back as user messages with tool_result content blocks.
    const out: AgentEvent[] = [];
    const content = msg.message.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "tool_result") {
          out.push({
            _tag: "ToolResult",
            itemId: nextItemId(),
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
 * across modules.
 */
export type RequestPermission = (
  sessionId: AgentSessionId,
  kind: PermissionKind,
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
export const startClaudeSession = (
  input: StartSessionInput,
  cwd: string,
  apiKey: string | null,
  claudeExecutablePath: string | null,
  sessionId: AgentSessionId,
  requestPermission: RequestPermission,
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
      env: env as Options["env"],
      // Bridge the SDK's permission callback to the server-side
      // `PermissionService`. The renderer's toast eventually fulfills the
      // promise this awaits.
      canUseTool: async (toolName, toolInput) => {
        const kind = kindForTool(toolName, toolInput);
        events.unsafeOffer({
          _tag: "PermissionRequest",
          itemId: nextItemId(),
          kind: toolName,
          details: toolInput,
        });
        const decision = await requestPermission(sessionId, kind);
        if (decision._tag === "Deny") {
          return {
            behavior: "deny",
            message: "User denied this tool call.",
          };
        }
        // AllowOnce / AllowForSession / AlwaysAllow → allow. The session
        // scope is enforced server-side: a second request with the same
        // (sessionId, kindKey) short-circuits to AllowOnce without
        // prompting.
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
          const translated = translate(msg);
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
