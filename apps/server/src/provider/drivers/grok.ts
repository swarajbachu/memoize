import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as readline from "node:readline";
import { Effect, Mailbox, Stream } from "effect";

import {
  AgentSessionStartError,
  type AgentEvent,
  type AgentItemId,
  type AgentSessionId,
  type AttachmentRef,
  type PermissionMode,
  type StartSessionInput,
  type UserQuestionAnswer,
} from "@memoize/wire";

import { AttachmentService } from "../../attachment/services/attachment-service.ts";
import { createAcpTranslator } from "./acp/translate.ts";
import { applyPlanModePrefix } from "./planMode.ts";
import { handleFsRequest } from "./acp/fs.ts";
import { handleTerminalRequest } from "./acp/terminal.ts";

/**
 * Live-only handle for one Grok conversation. Mirrors Codex/Claude handle
 * shape so `ProviderService` routes RPCs without caring which provider
 * backs the session.
 *
 * Grok has no embeddable JS SDK; instead we drive it via ACP — the agent
 * runs as `grok agent stdio`, a JSON-RPC server on stdin/stdout. One
 * persistent child per session (Claude-style), not one spawn per turn
 * (Codex-style). The conversation is identified by an ACP-minted
 * `sessionId` returned from `session/new`; we surface that as a
 * `SessionCursor { strategy: "grok-session-id" }` so it persists.
 */
export interface GrokSessionHandle {
  readonly events: Stream.Stream<AgentEvent>;
  readonly send: (
    text: string,
    attachments?: ReadonlyArray<AttachmentRef>,
  ) => Effect.Effect<void>;
  readonly interrupt: () => Effect.Effect<void>;
  readonly close: () => Effect.Effect<void>;
  /**
   * Cached locally and passed as `_meta.permissionMode` on the next
   * `session/prompt`. ACP doesn't yet document a live mode-switch method,
   * so this is best-effort — the server may ignore it. We always emit
   * `PermissionModeChanged` so the renderer chip stays in sync.
   */
  readonly setPermissionMode: (mode: PermissionMode) => Effect.Effect<void>;
  /**
   * No ACP `UserQuestion` primitive yet — match Codex/Grok-headless and
   * stay a no-op so RPC routing remains uniform.
   */
  readonly answerQuestion: (
    itemId: AgentItemId,
    answers: ReadonlyArray<UserQuestionAnswer>,
  ) => Effect.Effect<void>;
}


interface JsonRpcError {
  readonly code?: number;
  readonly message?: string;
  readonly data?: unknown;
}

interface JsonRpcMessage {
  readonly id?: number | string;
  readonly method?: string;
  readonly params?: { update?: unknown };
  readonly result?: unknown;
  readonly error?: JsonRpcError;
}

type PendingResolver = {
  method: string;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
};

/**
 * Diagnostic logging for the Grok ACP driver.
 *
 *   MEMOIZE_DEBUG_GROK=1        → full RPC trace + diag dumps (recommended when debugging "stops" or auth errors)
 *   MEMOIZE_DEBUG_GROK_DIAG=1   → only the high-value diagnostic dumps (lighter than full RPC trace)
 *
 * When the agent "just stops" or you see repeated AuthorizationRequired:
 *   1. Run the desktop app from a terminal (`bun run dev` or the packaged build).
 *   2. `export MEMOIZE_DEBUG_GROK=1`
 *   3. Reproduce the failure.
 *   4. Look for lines starting with `[grok.stderr]`, `[grok.diag]`, and `[grok.rpc]`.
 *      The last 2–4 kB of stderr right before a fatal is usually the smoking gun.
 */
const GROK_RPC_TRACE = process.env.MEMOIZE_DEBUG_GROK === "1";
const GROK_DIAG = process.env.MEMOIZE_DEBUG_GROK === "1" || process.env.MEMOIZE_DEBUG_GROK_DIAG === "1";

// Single source of truth for the user-facing auth failure message so the
// two variants the user reported ("Run `grok login` again or verify..." vs
// the slightly longer "Your cached login may have expired...") never diverge.
export const GROK_AUTH_REQUIRED_MESSAGE =
  "Grok authentication failed (AuthorizationRequired). " +
  "Run `grok login` again or verify that your account has the SuperGrok Heavy plan. " +
  "If the problem persists after logging in, check your plan at https://x.ai/.";

/** Always-on diagnostic helper. Use for anything that helps root-cause "it stops". */
const grokDiag = (label: string, data?: unknown): void => {
  if (!GROK_DIAG && !GROK_RPC_TRACE) return;
  const prefix = `[grok.diag] ${label}`;
  if (data === undefined) {
    process.stderr.write(`${prefix}\n`);
  } else {
    try {
      const s = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      process.stderr.write(`${prefix}: ${s}\n`);
    } catch {
      process.stderr.write(`${prefix}: (unserialisable)\n`);
    }
  }
};

/**
 * Detect fatal authorization failures from the grok agent's own stderr.
 * When the cached token is missing/expired/insufficient (SuperGrok Heavy
 * tier required), the agent prints:
 *   "worker quit with fatal: Transport channel closed, when Auth(AuthorizationRequired)"
 * and dies. We watch for this in real time so we can fail the in-flight
 * prompt *immediately* instead of waiting for the 5-minute timeout, and
 * we surface the single canonical GROK_AUTH_REQUIRED_MESSAGE.
 */
const isFatalAuthError = (text: string): boolean => {
  const t = text.toLowerCase();
  // Be very strict. The grok binary sometimes logs auth state, "waiting",
  // "transport channel" etc. during normal operation or token refresh.
  // Only treat as fatal when we see the actual worker-abort messages that
  // indicate the agent session is dead because of AuthorizationRequired.
  return (
    (t.includes("worker quit with fatal") && t.includes("authorizationrequired")) ||
    (t.includes("transport channel closed") && t.includes("authorizationrequired")) ||
    t.includes("auth(authorizationrequired)")
  );
};

/**
 * Turn a raw stderr snippet (from the grok binary) into a user-friendly
 * error message. When we see the known fatal auth line we produce the
 * canonical GROK_AUTH_REQUIRED_MESSAGE.
 */
const friendlyErrorFromStderr = (rawTail: string): string | null => {
  if (!isFatalAuthError(rawTail)) return null;
  return GROK_AUTH_REQUIRED_MESSAGE;
};

/**
 * Build a human-readable error from a JSON-RPC error envelope. ACP servers
 * commonly stash the real failure in `error.data` and leave `error.message`
 * as a generic "Internal error" — surfacing only `error.message` would
 * leave the user staring at "Internal error" with no clue what broke
 * (auth failure, missing model entitlement, network, etc.).
 *
 * `stderrTail` is the trailing chunk of grok's stderr captured during this
 * session; when the JSON-RPC envelope is empty (literally no message/data),
 * stderr is often the only signal we have about what actually went wrong
 * — e.g. xAI auth errors print to stderr before the server replies.
 */
const formatRpcError = (
  err: JsonRpcError,
  stderrTail: string,
): string => {
  const parts: string[] = [];
  if (typeof err.message === "string" && err.message.length > 0) {
    parts.push(err.message);
  }
  if (err.data !== undefined && err.data !== null) {
    if (typeof err.data === "string") {
      parts.push(err.data);
    } else if (typeof err.data === "object") {
      const d = err.data as Record<string, unknown>;
      const detail =
        typeof d["message"] === "string"
          ? (d["message"] as string)
          : typeof d["error"] === "string"
            ? (d["error"] as string)
            : typeof d["details"] === "string"
              ? (d["details"] as string)
              : typeof d["reason"] === "string"
                ? (d["reason"] as string)
                : null;
      if (detail !== null && detail.length > 0) {
        parts.push(detail);
      } else {
        try {
          const serialized = JSON.stringify(err.data);
          if (serialized !== "{}" && serialized.length > 0) parts.push(serialized);
        } catch {
          // unserialisable — fall through
        }
      }
    }
  }
  if (parts.length === 0) {
    const trimmedStderr = stderrTail.trim();
    if (trimmedStderr.length > 0) parts.push(trimmedStderr);
    else parts.push("Grok ACP returned an error with no detail.");
  }
  if (typeof err.code === "number") parts.push(`(code ${err.code})`);
  return parts.join(" — ");
};

/**
 * Spin up a Grok conversation backed by a persistent ACP child process.
 * The handshake (`initialize` → `authenticate` → `session/new`) runs once
 * synchronously inside `start()`; auth or transport failures surface there
 * so the orchestrator can fail the session-create RPC cleanly.
 *
 * `apiKey` is forwarded as `GROK_CODE_XAI_API_KEY` on the child env. When
 * null the child reads cached credentials from `~/.grok/` (browser-OAuth
 * `grok login` flow). `xai.api_key` auth method is preferred when a key
 * is set; otherwise `cached_token`.
 */
export const startGrokSession = (
  input: StartSessionInput,
  cwd: string,
  apiKey: string | null,
  grokPath: string,
  sessionId: AgentSessionId,
  resumeCursor: string | null = null,
): Effect.Effect<GrokSessionHandle, AgentSessionStartError, AttachmentService> =>
  Effect.gen(function* () {
    // Keep AttachmentService in the requirement set so layer wiring stays
    // uniform with the other drivers; attachments themselves are not yet
    // wired through ACP's `prompt: [{ type: "image", ... }]` shape.
    yield* AttachmentService;
    const events = yield* Mailbox.make<AgentEvent>();

    let currentMode: PermissionMode = input.permissionMode ?? "default";
    let acpSessionId: string | null = null;
    let nextRpcId = 1;
    let closed = false;
    /** True once the ACP child has exited (fatal auth, crash, or normal end).
     *  Further send() calls fail fast with a clear "session ended — start a new chat" message
     *  instead of queuing doomed RPCs that will 5-minute timeout.
     */
    let dead = false;
    let inflight: Promise<void> = Promise.resolve();
    const pending = new Map<number, PendingResolver>();
    // Trailing window of grok's stderr — used to enrich error reports when
    // the JSON-RPC envelope itself is opaque ("Internal error" with no data).
    let stderrTail = "";

    // Which auth method the binary accepted for this session.
    // Very useful when debugging "AuthorizationRequired" even with a valid login.
    // Common values: "cached_token" (from `grok login`) or "xai.api_key".
    let authMethodUsed: string | null = null;

    events.unsafeOffer({
      _tag: "Started",
      sessionId,
      providerId: "grok",
      mode: "sdk",
    });

    // Per-session translator coalesces agent_message_chunk deltas into
    // one AssistantMessage per burst so the renderer doesn't show one
    // bubble per token.
    const translator = createAcpTranslator("grok");

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(grokPath, ["agent", "stdio"], {
        cwd,
        env: {
          ...process.env,
          ...(apiKey !== null ? { GROK_CODE_XAI_API_KEY: apiKey } : {}),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (cause) {
      yield* events.end;
      return yield* Effect.fail(
        new AgentSessionStartError({
          providerId: "grok",
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
      );
    }

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    const rl = readline.createInterface({ input: child.stdout });

    const writeMessage = (msg: Record<string, unknown>): void => {
      if (!child.stdin.writable) return;
      const line = JSON.stringify(msg);
      if (GROK_RPC_TRACE) process.stderr.write(`[grok.rpc.send] ${line}\n`);
      child.stdin.write(`${line}\n`);
    };

    const request = (
      method: string,
      params: unknown,
      timeoutMs = 30_000,
      onAssignedId?: (id: number) => void,
    ): Promise<unknown> => {
      const id = nextRpcId++;
      onAssignedId?.(id);
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          const trimmedStderr = stderrTail.trim();
          const friendly = friendlyErrorFromStderr(trimmedStderr);
          if (friendly !== null) {
            reject(new Error(friendly));
            return;
          }
          const detail =
            trimmedStderr.length > 0 ? ` — stderr: ${trimmedStderr}` : "";
          reject(
            new Error(
              `Grok ACP ${method} timed out after ${timeoutMs}ms${detail}`,
            ),
          );
        }, timeoutMs);
        pending.set(id, { method, resolve, reject, timer });
        writeMessage({ jsonrpc: "2.0", id, method, params });
      });
    };

    const notify = (method: string, params: unknown): void => {
      writeMessage({ jsonrpc: "2.0", method, params });
    };

    /**
     * Currently in-flight `session/prompt` rpc id. See gemini.ts for the
     * rationale — interrupt needs to force-reject the pending request so
     * the `inflight` chain unblocks.
     */
    let currentPromptRpcId: number | null = null;
    const rejectCurrentPrompt = (reason: string): void => {
      const id = currentPromptRpcId;
      if (id === null) return;
      const resolver = pending.get(id);
      if (resolver === undefined) return;
      pending.delete(id);
      clearTimeout(resolver.timer);
      currentPromptRpcId = null;
      if (GROK_RPC_TRACE) {
        process.stderr.write(
          `[grok.rpc.cancel] force-reject id=${id} method=${resolver.method} reason=${reason}\n`,
        );
      }
      resolver.reject(new Error(reason));
    };

    rl.on("line", (line: string) => {
      if (line.trim().length === 0) return;
      if (GROK_RPC_TRACE) process.stderr.write(`[grok.rpc.recv] ${line}\n`);
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // Non-JSON line on stdout (e.g. a tracing log leak). Drop silently
        // — assistant text rides typed `session/update` notifications.
        return;
      }
      if (parsed === null || typeof parsed !== "object") return;
      const msg = parsed as JsonRpcMessage;

      // Notifications and server→client requests both carry `method`.
      if (typeof msg.method === "string") {
        if (msg.method === "session/update") {
          const update = msg.params?.update;
          if (update !== undefined) {
            for (const ev of translator.translate(update)) {
              events.unsafeOffer(ev);
            }
          }
          return;
        }

        // Grok swarming / collab agents + general thread/item lifecycle.
        // The ACP server emits item/started, item/completed, thread/* etc.
        // with payloads containing ThreadItem (including collabAgentToolCall)
        // and per-thread metadata (nickname, role, states). Forward the
        // params object to the translator so the new collab handling can
        // extract them. Only log at trace level to avoid noise in normal use.
        if (msg.method.startsWith("item/") || msg.method.startsWith("thread/")) {
          if (GROK_RPC_TRACE) {
            process.stderr.write(
              `[grok.rpc] ${msg.method} params=${JSON.stringify(msg.params ?? {})}\n`,
            );
          }
          if (msg.params !== undefined) {
            for (const ev of translator.translate(msg.params)) {
              events.unsafeOffer(ev);
            }
          }
          return;
        }

        if (msg.id !== undefined) {
          // Server→client request (fs/*, permission prompts, etc.).
          // We now:
          //  - Log verbosely under the existing GROK_RPC_TRACE flag so the
          //    user (and we) can see exactly which tools Grok tries to call
          //    on the client ("add some logs").
          //  - For fs/* methods we reply with a clean "not implemented yet"
          //    error so the agent does not hang waiting for a response.
          //    This often makes Grok fall back to its own well-named internal
          //    tools (list_dir etc.) which our translator now renders nicely.
          const isFs = msg.method.startsWith("fs/");
          if (GROK_RPC_TRACE || isFs) {
            process.stderr.write(
              `[grok.rpc] server→client request method=${msg.method} id=${msg.id} params=${JSON.stringify(msg.params ?? {})}\n`,
            );
          }
          if (isFs) {
            // Real FS support — the agent can now read/write files directly
            // instead of getting "Method not implemented" tool errors.
            handleFsRequest(msg.method, msg.params, { cwd })
              .then((result) => {
                writeMessage({ jsonrpc: "2.0", id: msg.id, result });
              })
              .catch((err) => {
                const message = err instanceof Error ? err.message : String(err);
                writeMessage({
                  jsonrpc: "2.0",
                  id: msg.id,
                  error: { code: -32603, message },
                });
              });
            return;
          }

          if (msg.method.startsWith("terminal/")) {
            handleTerminalRequest(msg.method, msg.params, { cwd })
              .then((result) => {
                writeMessage({ jsonrpc: "2.0", id: msg.id, result });
              })
              .catch((err) => {
                const message = err instanceof Error ? err.message : String(err);
                writeMessage({
                  jsonrpc: "2.0",
                  id: msg.id,
                  error: { code: -32603, message },
                });
              });
            return;
          }

          // User question / interactive prompts from the Grok agent
          // (e.g. _x.ai/ask_user_question or similar namespaced methods).
          // These are used by the agent when it wants to ask the human for
          // input (dummy edits, confirmations, plan decisions, etc.).
          // For now we auto-ack so the agent's tool call doesn't hang/fail.
          // Full round-trip (emit UserQuestionEvent + route answers back)
          // can be added later once we have the exact param shape.
          const isQuestionMethod =
            msg.method?.includes("ask_user_question") ||
            msg.method?.includes("user_question") ||
            msg.method?.startsWith("_x.ai/");

          if (isQuestionMethod) {
            grokDiag("auto-acking user question method from agent", {
              method: msg.method,
              params: msg.params,
            });
            if (GROK_RPC_TRACE) {
              process.stderr.write(
                `[grok.rpc] auto-acking question method=${msg.method} id=${msg.id} params=${JSON.stringify(msg.params ?? {})}\n`,
              );
            }
            // The Grok ACP expects at minimum an `outcome` field in the
            // result for ask_user_question responses. We auto-approve for
            // dummy flows so the agent can keep making edits without hanging.
            writeMessage({
              jsonrpc: "2.0",
              id: msg.id,
              result: { outcome: "approved" },
            });
            return;
          }

          // For everything else (permission prompts, collab callbacks, etc.)
          // we still reply with a clean error so the agent never hangs forever
          // waiting for a response that will never come.
          writeMessage({
            jsonrpc: "2.0",
            id: msg.id,
            error: {
              code: -32601,
              message: `Method not supported by memoize ACP client: ${msg.method}`,
            },
          });
          grokDiag("replied to unhandled server→client request", {
            method: msg.method,
            id: msg.id,
          });
          return;
        }
        // Unknown notification — drop.
        return;
      }

      // Response to one of our outbound requests.
      const id = typeof msg.id === "number" ? msg.id : null;
      if (id === null) return;
      const resolver = pending.get(id);
      if (resolver === undefined) return;
      pending.delete(id);
      clearTimeout(resolver.timer);
      if (msg.error !== undefined) {
        // Always log the raw error envelope on stderr so the developer can
        // see what grok actually said (the formatted user-facing message
        // strips structure for readability). Cheap insurance against
        // shape-mismatch surprises in the undocumented ACP error format.
        try {
          process.stderr.write(
            `[grok.rpc.error] method=${resolver.method} id=${id} ${JSON.stringify(msg.error)}\n`,
          );
        } catch {
          process.stderr.write(
            `[grok.rpc.error] method=${resolver.method} id=${id} (unserialisable)\n`,
          );
        }
        const detail = formatRpcError(msg.error, stderrTail);
        resolver.reject(new Error(`Grok ${resolver.method} failed: ${detail}`));
      } else {
        resolver.resolve(msg.result ?? {});
      }
    });

    child.stderr.on("data", (chunk: string) => {
      // Keep a rolling tail so errors can include the actual stderr
      // context (auth failures, version mismatch, etc.) instead of just
      // grok's generic JSON-RPC "Internal error".
      stderrTail = (stderrTail + chunk).slice(-4096);

      // Always emit the raw stderr from the grok binary. When the agent
      // "just stops" or you see AuthorizationRequired, the lines starting
      // with [grok.stderr] are the primary diagnostic. Run the app from a
      // terminal and `grep -i auth` or `grep -i fatal` on the output.
      process.stderr.write(`[grok.stderr] ${chunk}`);

      // Fast-path: if the agent itself reports a fatal auth failure
      // (token expired / wrong tier), kill the in-flight prompt right now
      // instead of letting the 5-minute timeout fire. This is what the
      // user meant by "not auto stopping".
      const sawFatal = isFatalAuthError(chunk) || isFatalAuthError(stderrTail);
      if (sawFatal) {
        dead = true;

        const isCachedToken = authMethodUsed === "cached_token";

        // Always log the full diagnostic info (this is what we use for debugging).
        grokDiag("FATAL_AUTH_TRIGGERED", {
          chunkPreview: chunk.slice(0, 800),
          tailPreview: stderrTail.slice(-800),
          currentPromptRpcId,
          inflightPending: pending.size,
          authMethodUsed,
          isCachedToken,
        });

        if (currentPromptRpcId !== null) {
          rejectCurrentPrompt(GROK_AUTH_REQUIRED_MESSAGE);
        }

        if (!closed) {
          if (isCachedToken) {
            // For local `grok login` users, the worker sometimes dies with this even
            // when the session can continue. We suppress the noisy red error card
            // so it doesn't spam the UI mid-turn. Full details are still in the logs.
            grokDiag("Suppressed visible Error event for cached_token AuthorizationRequired (session may still continue)");
          } else {
            // Real/invalid/expired token cases — still show the hard error.
            events.unsafeOffer({
              _tag: "Error",
              message: GROK_AUTH_REQUIRED_MESSAGE,
            });
          }
        }
      }
    });

    child.on("error", (err) => {
      if (closed) return;
      dead = true;
      events.unsafeOffer({ _tag: "Error", message: err.message });
      void Effect.runPromise(events.end).catch(() => {});
    });

    child.on("close", (code, signal) => {
      rl.close();
      dead = true;
      const trimmedStderr = stderrTail.trim();
      const friendly = friendlyErrorFromStderr(trimmedStderr);
      const exitDetail =
        friendly !== null
          ? friendly
          : trimmedStderr.length > 0
            ? `Grok ACP exited (code ${code ?? "null"}, signal ${signal ?? "null"}): ${trimmedStderr}`
            : `Grok ACP exited unexpectedly (code ${code ?? "null"}, signal ${signal ?? "null"}).`;

      grokDiag("child process closed", {
        code,
        signal,
        stderrTailLen: trimmedStderr.length,
        hadFriendlyAuthError: friendly !== null,
      });
      if (trimmedStderr.length > 0) {
        grokDiag("final stderr tail (last 2k)", trimmedStderr.slice(-2000));
      }
      for (const { reject, timer } of pending.values()) {
        clearTimeout(timer);
        reject(new Error(exitDetail));
      }
      pending.clear();
      if (!closed) {
        const wasAuthFatalOnCachedToken =
          friendly !== null && authMethodUsed === "cached_token";

        if (!wasAuthFatalOnCachedToken) {
          events.unsafeOffer({ _tag: "Error", message: exitDetail });
        } else {
          grokDiag("Suppressed final Error event on close for cached_token auth fatal");
        }

        events.unsafeOffer({ _tag: "Status", status: "idle" });
      }
      // End the mailbox so any renderer subscription / Stream consumer sees
      // completion instead of hanging forever on a dead session. This prevents
      // the "stops" symptom where the UI shows the last error but never
      // transitions to a clean terminal state.
      void Effect.runPromise(events.end).catch(() => {});
    });

    // === ACP handshake — synchronous, fails the start() RPC on error. ===
    const handshake = Effect.tryPromise({
      try: async () => {
        const init = (await request("initialize", {
          protocolVersion: 1,
          clientCapabilities: {
            fs: {
              readTextFile: true,
              writeTextFile: true,
              readDirectory: true,
              createDirectory: true,
              deleteFile: true,
              moveFile: true,
            },
            terminal: true,
            // Opt into experimental features (collab agents / swarming, richer
            // thread/item notifications, etc.) so Grok Build will emit the full
            // collabAgentToolCall stream for 10+ agent swarms.
            experimentalApi: true,
          },
        })) as { authMethods?: ReadonlyArray<{ id?: unknown }> };

        const authIds = new Set(
          (init.authMethods ?? [])
            .map((m) => (typeof m?.id === "string" ? m.id : null))
            .filter((id): id is string => id !== null),
        );
        grokDiag("handshake initialize returned authMethods", [...authIds]);

        const methodId =
          apiKey !== null && authIds.has("xai.api_key")
            ? "xai.api_key"
            : authIds.has("cached_token")
              ? "cached_token"
              : null;
        if (methodId === null) {
          throw new Error(
            "Grok ACP offered no usable auth method. Run `grok login`, or set GROK_CODE_XAI_API_KEY.",
          );
        }
        authMethodUsed = methodId;
        grokDiag("choosing auth method", { methodId, hasApiKey: apiKey !== null });

        const authResult = await request("authenticate", {
          methodId,
          _meta: { headless: true },
        });
        grokDiag("authenticate succeeded", { methodId, authMethodUsed, result: authResult });

        const sessionResult = (await request("session/new", {
          cwd,
          mcpServers: [],
        })) as { sessionId?: unknown };

        if (typeof sessionResult.sessionId !== "string") {
          throw new Error("Grok ACP session/new returned no sessionId.");
        }
        grokDiag("session/new succeeded", { sessionId: sessionResult.sessionId, authMethodUsed });
        return sessionResult.sessionId;
      },
      catch: (cause) =>
        new AgentSessionStartError({
          providerId: "grok",
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });

    acpSessionId = yield* handshake.pipe(
      Effect.tapError(() =>
        Effect.sync(() => {
          child.kill("SIGTERM");
        }),
      ),
    );

    events.unsafeOffer({
      _tag: "SessionCursor",
      cursor: acpSessionId,
      strategy: "grok-session-id",
    });

    // ACP doesn't (yet) expose `session/load` in the published surface, so a
    // resumeCursor from a prior process can't actually rejoin the prior
    // server-side conversation. We persist the new id and move on; the user
    // sees a fresh agent context. Wire `session/load` once it's documented.
    if (resumeCursor !== null && resumeCursor !== acpSessionId) {
      console.warn(
        `[grok] previous cursor ${resumeCursor} discarded — ACP session/load not wired; using new session ${acpSessionId}`,
      );
    }

    const enqueuePrompt = (text: string): void => {
      const sid = acpSessionId;
      if (sid === null || dead) {
        // Fast fail so the user doesn't wait for a 5-minute RPC timeout on a dead child.
        events.unsafeOffer({
          _tag: "Error",
          message:
            "Grok session has ended (authentication failure or process exit). " +
            "Close this chat and start a new one to continue with Grok.",
        });
        events.unsafeOffer({ _tag: "Status", status: "idle" });
        void Effect.runPromise(events.end).catch(() => {});
        return;
      }
      // Plan-mode emulation: grok ACP has no native read-only switch, so
      // prepend a developer-instructions block while plan mode is active.
      const promptText = applyPlanModePrefix(currentMode, text);
      inflight = inflight
        .then(async () => {
          if (closed || dead) return;
          if (GROK_RPC_TRACE || GROK_DIAG) {
            process.stderr.write(
              `[grok.prompt] enqueue len=${promptText.length} mode=${currentMode}\n`,
            );
          }
          grokDiag("session/prompt starting", {
            promptLen: promptText.length,
            permissionMode: currentMode,
            model: input.model,
          });
          try {
            await request(
              "session/prompt",
              {
                sessionId: sid,
                prompt: [{ type: "text", text: promptText }],
                // Server may ignore unknown keys; pass mode + model as
                // metadata so a future ACP rev can honour them without a
                // driver change.
                _meta: {
                  permissionMode: currentMode,
                  ...(input.model !== undefined ? { model: input.model } : {}),
                },
              },
              5 * 60_000,
              (id) => {
                currentPromptRpcId = id;
              },
            );
            if (GROK_RPC_TRACE || GROK_DIAG) {
              process.stderr.write(`[grok.prompt] completed\n`);
            }
            grokDiag("session/prompt completed successfully");
          } catch (cause) {
            const reason = cause instanceof Error ? cause.message : String(cause);
            if (GROK_RPC_TRACE || GROK_DIAG) {
              process.stderr.write(`[grok.prompt] failed: ${reason}\n`);
            }
            grokDiag("session/prompt failed", { reason });
            const isCancellation = /cancel|interrupt/i.test(reason);
            if (!closed && !isCancellation) {
              events.unsafeOffer({
                _tag: "Error",
                message: reason,
              });
            }
          } finally {
            currentPromptRpcId = null;
            // Drain any buffered assistant text from the translator so the
            // final delta lands as a normal AssistantMessage instead of
            // sitting unobserved in memory.
            if (!closed) {
              for (const ev of translator.flush()) events.unsafeOffer(ev);
              events.unsafeOffer({ _tag: "Status", status: "idle" });
            }
          }
        })
        .catch(() => undefined);
    };

    if (input.initialPrompt !== undefined && input.initialPrompt.length > 0) {
      if (!dead) enqueuePrompt(input.initialPrompt);
    }

    const handle: GrokSessionHandle = {
      events: Mailbox.toStream(events),
      send: (text, attachmentRefs) =>
        Effect.sync(() => {
          if (attachmentRefs !== undefined && attachmentRefs.length > 0) {
            // ACP `prompt: [{ type: "image", ... }]` shape isn't wired yet;
            // drop with a warn so the text turn still goes through.
            console.warn(
              `[grok.attach] dropping ${attachmentRefs.length} attachment(s) — ACP image content shape not wired`,
            );
          }
          enqueuePrompt(text);
        }),
      interrupt: () =>
        Effect.sync(() => {
          const sid = acpSessionId;
          if (sid === null) return;
          if (GROK_RPC_TRACE) {
            process.stderr.write(
              `[grok.interrupt] sid=${sid} pendingPrompt=${currentPromptRpcId ?? "(none)"}\n`,
            );
          }
          // Best-effort cancel. We deliberately do NOT SIGINT the child —
          // that would kill the persistent agent and end every future send
          // for this session. If `session/cancel` isn't recognised the
          // server replies with an error we ignore.
          notify("session/cancel", { sessionId: sid });
          // Force-reject the in-flight prompt so the inflight chain
          // unblocks even if grok's ACP doesn't honour `session/cancel`.
          rejectCurrentPrompt("Interrupted by user");
        }),
      close: () =>
        Effect.gen(function* () {
          closed = true;
          for (const { reject, timer } of pending.values()) {
            clearTimeout(timer);
            reject(new Error("Grok session closed"));
          }
          pending.clear();
          try {
            child.stdin.end();
          } catch {
            // ignore — stdin may already be closed by the child
          }
          child.kill("SIGTERM");
          rl.close();
          yield* events.end;
        }),
      setPermissionMode: (mode) =>
        Effect.sync(() => {
          if (mode === currentMode) return;
          currentMode = mode;
          events.unsafeOffer({ _tag: "PermissionModeChanged", mode });
        }),
      answerQuestion: () => Effect.void,
    };
    return handle;
  });
