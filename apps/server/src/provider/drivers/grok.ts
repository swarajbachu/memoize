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

const GROK_RPC_TRACE = process.env.MEMOIZE_DEBUG_GROK === "1";

/**
 * Detect fatal authorization failures from the grok agent's own stderr.
 * When the cached token is missing/expired/insufficient (SuperGrok Heavy
 * tier required), the agent prints:
 *   "worker quit with fatal: Transport channel closed, when Auth(AuthorizationRequired)"
 * and dies. We watch for this in real time so we can fail the in-flight
 * prompt *immediately* instead of waiting for the 5-minute timeout, and
 * we can surface a clean actionable message instead of the raw timeout.
 */
const isFatalAuthError = (text: string): boolean => {
  const t = text.toLowerCase();
  return (
    t.includes("authorizationrequired") ||
    t.includes("auth(authorizationrequired)") ||
    (t.includes("worker quit with fatal") && t.includes("auth")) ||
    (t.includes("transport channel closed") && t.includes("auth"))
  );
};

/**
 * Turn a raw stderr snippet (from the grok binary) into a user-friendly
 * error message. When we see the known fatal auth line we produce a clear,
 * actionable string instead of the confusing "timed out after 300000ms"
 * that the user was getting.
 */
const friendlyErrorFromStderr = (rawTail: string): string | null => {
  if (!isFatalAuthError(rawTail)) return null;
  return (
    "Grok authentication failed (AuthorizationRequired). " +
    "Your login may have expired or your account does not have the SuperGrok Heavy tier required for the coding agent. " +
    "Run `grok login` again, then retry the turn. If the problem persists, check your plan at https://x.ai/."
  );
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
    let inflight: Promise<void> = Promise.resolve();
    const pending = new Map<number, PendingResolver>();
    // Trailing window of grok's stderr — used to enrich error reports when
    // the JSON-RPC envelope itself is opaque ("Internal error" with no data).
    let stderrTail = "";

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
            // Reply immediately so the agent can continue instead of timing
            // out on an unhandled client capability.
            writeMessage({
              jsonrpc: "2.0",
              id: msg.id,
              error: {
                code: -32601,
                message: `Method not implemented by memoize ACP client: ${msg.method}`,
              },
            });
            return;
          }
          // For everything else (permission requests, etc.) we still just
          // warn and let the server time out or proceed.
          console.warn(
            `[grok.rpc] unhandled server→client request method=${msg.method} id=${msg.id}`,
          );
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
      process.stderr.write(`[grok.stderr] ${chunk}`);

      // Fast-path: if the agent itself reports a fatal auth failure
      // (token expired / wrong tier), kill the in-flight prompt right now
      // instead of letting the 5-minute timeout fire. This is what the
      // user meant by "not auto stopping".
      if (isFatalAuthError(chunk) || isFatalAuthError(stderrTail)) {
        if (currentPromptRpcId !== null) {
          rejectCurrentPrompt(
            "Grok authentication failed (AuthorizationRequired). " +
              "Your cached login may have expired or your account lacks the SuperGrok Heavy tier required to use the agent. " +
              "Run `grok login` again, then retry.",
          );
        }
        // Surface a clean error immediately so the UI can stop the spinner
        // and show the auth-classified error card with the "Open settings" button.
        if (!closed) {
          events.unsafeOffer({
            _tag: "Error",
            message:
              "Grok authentication failed (AuthorizationRequired). " +
              "Run `grok login` again or verify that your account has the SuperGrok Heavy plan.",
          });
        }
      }
    });

    child.on("error", (err) => {
      if (closed) return;
      events.unsafeOffer({ _tag: "Error", message: err.message });
    });

    child.on("close", (code, signal) => {
      rl.close();
      const trimmedStderr = stderrTail.trim();
      const friendly = friendlyErrorFromStderr(trimmedStderr);
      const exitDetail =
        friendly !== null
          ? friendly
          : trimmedStderr.length > 0
            ? `Grok ACP exited (code ${code ?? "null"}, signal ${signal ?? "null"}): ${trimmedStderr}`
            : `Grok ACP exited unexpectedly (code ${code ?? "null"}, signal ${signal ?? "null"}).`;
      for (const { reject, timer } of pending.values()) {
        clearTimeout(timer);
        reject(new Error(exitDetail));
      }
      pending.clear();
      if (!closed) {
        events.unsafeOffer({ _tag: "Error", message: exitDetail });
        events.unsafeOffer({ _tag: "Status", status: "idle" });
      }
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
          },
        })) as { authMethods?: ReadonlyArray<{ id?: unknown }> };

        const authIds = new Set(
          (init.authMethods ?? [])
            .map((m) => (typeof m?.id === "string" ? m.id : null))
            .filter((id): id is string => id !== null),
        );
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
        await request("authenticate", {
          methodId,
          _meta: { headless: true },
        });

        const sessionResult = (await request("session/new", {
          cwd,
          mcpServers: [],
        })) as { sessionId?: unknown };

        if (typeof sessionResult.sessionId !== "string") {
          throw new Error("Grok ACP session/new returned no sessionId.");
        }
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
      if (sid === null) return;
      // Plan-mode emulation: grok ACP has no native read-only switch, so
      // prepend a developer-instructions block while plan mode is active.
      const promptText = applyPlanModePrefix(currentMode, text);
      inflight = inflight
        .then(async () => {
          if (closed) return;
          if (GROK_RPC_TRACE) {
            process.stderr.write(
              `[grok.prompt] enqueue len=${promptText.length} mode=${currentMode}\n`,
            );
          }
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
            if (GROK_RPC_TRACE) {
              process.stderr.write(`[grok.prompt] completed\n`);
            }
          } catch (cause) {
            const reason = cause instanceof Error ? cause.message : String(cause);
            if (GROK_RPC_TRACE) {
              process.stderr.write(`[grok.prompt] failed: ${reason}\n`);
            }
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
      enqueuePrompt(input.initialPrompt);
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
