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

let itemCounter = 0;
const nextItemId = (): AgentItemId =>
  `i_${Date.now()}_${++itemCounter}` as AgentItemId;

/**
 * Translate one ACP `session/update` payload into zero or more
 * `AgentEvent`s. The ACP v1 spec uses `"sessionUpdate"` as the
 * discriminator but the ResponseItem shape (v2+) uses `"type"` — we
 * check both so either format works.
 *
 * ACP v1 sessionUpdate values:
 *   agent_message_chunk, agent_thought_chunk, thinking_chunk,
 *   tool_call, tool_use, tool_result, tool_output,
 *   function_call, function_call_output,
 *   custom_tool_call, custom_tool_call_output,
 *   tool_search_call, tool_search_output,
 *   local_shell_call, web_search_call,
 *   error, agent_error
 *
 * Gemini-specific (nonstandard) type values:
 *   tool_call_update, available_commands_update
 *
 * ACP v2 ResponseItem type values (also accepted):
 *   message, function_call, custom_tool_call, tool_search_call,
 *   local_shell_call, web_search_call, image_generation_call,
 *   function_call_output, custom_tool_call_output, tool_search_output,
 *   compaction, context_compaction
 */
const translateSessionUpdate = (update: unknown): ReadonlyArray<AgentEvent> => {
  if (update === null || typeof update !== "object") return [];
  const u = update as Record<string, unknown>;
  const kind =
    typeof u["sessionUpdate"] === "string"
      ? (u["sessionUpdate"] as string)
      : typeof u["type"] === "string"
        ? (u["type"] as string)
        : null;
  if (kind === null) return [];

  const asText = (v: unknown): string | null => {
    if (typeof v === "string") return v;
    if (v !== null && typeof v === "object" && "text" in v) {
      const t = (v as { text: unknown }).text;
      return typeof t === "string" ? t : null;
    }
    return null;
  };

  const extractMessageText = (content: unknown): string | null => {
    if (!Array.isArray(content)) return asText(content);
    const parts: string[] = [];
    for (const item of content) {
      if (item !== null && typeof item === "object" && "text" in item) {
        const t = (item as Record<string, unknown>)["text"];
        if (typeof t === "string") parts.push(t);
      }
    }
    return parts.length > 0 ? parts.join("") : null;
  };

  const extractCallId = (): AgentItemId => {
    const raw =
      typeof u["toolCallId"] === "string"
        ? u["toolCallId"]
        : typeof u["call_id"] === "string"
          ? u["call_id"]
          : typeof u["id"] === "string"
            ? u["id"]
            : typeof (u as Record<string, unknown>)["callId"] === "string"
              ? (u as Record<string, unknown>)["callId"]
              : null;
    return raw !== null ? (raw as AgentItemId) : nextItemId();
  };

  const extractToolName = (): string => {
    return typeof u["tool"] === "string"
      ? (u["tool"] as string)
      : typeof u["name"] === "string"
        ? (u["name"] as string)
        : typeof u["execution"] === "string"
          ? (u["execution"] as string)
          : typeof u["command"] === "string"
            ? (u["command"] as string)
            : "tool";
  };

  const extractInput = (): unknown => {
    if (u["input"] !== undefined) return u["input"];
    if (u["arguments"] !== undefined) {
      const a = u["arguments"];
      if (typeof a === "string") {
        try {
          return JSON.parse(a);
        } catch {
          return a;
        }
      }
      return a;
    }
    if (u["command"] !== undefined) return { command: u["command"] };
    return null;
  };

  const extractOutput = (): unknown => {
    if (u["output"] !== undefined) {
      const o = u["output"];
      if (o !== null && typeof o === "object" && "content" in o) {
        return (o as Record<string, unknown>)["content"] ?? o;
      }
      return o;
    }
    if (u["content"] !== undefined) return u["content"];
    if (u["result"] !== undefined) return u["result"];
    return null;
  };

  switch (kind) {
    case "agent_message_chunk":
    case "message": {
      const text =
        kind === "message"
          ? extractMessageText(u["content"])
          : asText(u["content"]);
      if (text === null || text.length === 0) return [];
      return [
        {
          _tag: "AssistantMessage",
          itemId: nextItemId(),
          text,
        },
      ];
    }
    case "agent_thought_chunk":
    case "agent_reasoning_chunk":
    case "thinking_chunk":
    case "reasoning": {
      const text = asText(u["content"]);
      if (text === null || text.length === 0) return [];
      return [
        {
          _tag: "Thinking",
          itemId: nextItemId(),
          text,
          redacted: false,
        },
      ];
    }
    case "tool_call":
    case "tool_use":
    case "tool_call_update":
    case "function_call":
    case "custom_tool_call":
    case "tool_search_call":
    case "local_shell_call":
    case "web_search_call":
    case "image_generation_call": {
      if (GROK_RPC_TRACE) {
        process.stderr.write(
          `[grok.translate.tool] kind=${kind} payload=${JSON.stringify(u).slice(0, 4096)}\n`,
        );
      }
      const toolUse = {
        _tag: "ToolUse" as const,
        itemId: extractCallId(),
        tool: extractToolName(),
        input: extractInput(),
      };
      if (GROK_RPC_TRACE) {
        process.stderr.write(
          `[grok.translate.tool] → ToolUse itemId=${toolUse.itemId} tool=${toolUse.tool} input=${JSON.stringify(toolUse.input).slice(0, 2048)}\n`,
        );
      }
      return [toolUse];
    }
    case "tool_result":
    case "tool_output":
    case "function_call_output":
    case "custom_tool_call_output":
    case "tool_search_output": {
      if (GROK_RPC_TRACE) {
        process.stderr.write(
          `[grok.translate.result] kind=${kind} payload=${JSON.stringify(u).slice(0, 4096)}\n`,
        );
      }
      const isError = u["isError"] === true || u["is_error"] === true;
      const toolResult = {
        _tag: "ToolResult" as const,
        itemId: extractCallId(),
        output: extractOutput(),
        isError,
      };
      if (GROK_RPC_TRACE) {
        process.stderr.write(
          `[grok.translate.result] → ToolResult itemId=${toolResult.itemId} output=${JSON.stringify(toolResult.output).slice(0, 2048)}\n`,
        );
      }
      return [toolResult];
    }
    case "error":
    case "agent_error": {
      // Pull useful detail from multiple possible fields. ACP doesn't
      // pin the error payload shape, and grok itself sometimes nests the
      // real reason under `data`/`details`/`error`.
      const detail =
        typeof u["message"] === "string" && (u["message"] as string).length > 0
          ? (u["message"] as string)
          : typeof u["error"] === "string"
            ? (u["error"] as string)
            : typeof u["details"] === "string"
              ? (u["details"] as string)
              : typeof u["data"] === "string"
                ? (u["data"] as string)
                : null;
      const message =
        detail !== null && detail.length > 0
          ? detail
          : (() => {
              try {
                const serialized = JSON.stringify(u);
                return serialized === "{}"
                  ? "Grok agent reported an error with no detail."
                  : `Grok agent error: ${serialized}`;
              } catch {
                return "Grok agent reported an error.";
              }
            })();
      return [{ _tag: "Error", message }];
    }
    case "available_commands_update":
      return [];
    default:
      console.warn(
        `[grok.translate] unknown sessionUpdate/type=${kind} payload=${((): string => {
          try {
            const s = JSON.stringify(u).slice(0, 2048);
            return s.length > 0 ? s : "(empty)";
          } catch { return "(unserialisable)"; }
        })()}`,
      );
      return [];
  }
};

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
    ): Promise<unknown> => {
      const id = nextRpcId++;
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          const trimmedStderr = stderrTail.trim();
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
            for (const ev of translateSessionUpdate(update)) {
              events.unsafeOffer(ev);
            }
          }
          return;
        }
        if (msg.id !== undefined) {
          // Server→client request. Permission prompts likely land here once
          // ACP spec is verified; for now log and ignore so the turn either
          // proceeds or times out grok-side. Wiring to PermissionService is
          // an open follow-up.
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
    });

    child.on("error", (err) => {
      if (closed) return;
      events.unsafeOffer({ _tag: "Error", message: err.message });
    });

    child.on("close", (code, signal) => {
      rl.close();
      const trimmedStderr = stderrTail.trim();
      const exitDetail = trimmedStderr.length > 0
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
            fs: { readTextFile: true, writeTextFile: true },
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
      inflight = inflight
        .then(async () => {
          if (closed) return;
          try {
            await request(
              "session/prompt",
              {
                sessionId: sid,
                prompt: [{ type: "text", text }],
                // Server may ignore unknown keys; pass mode + model as
                // metadata so a future ACP rev can honour them without a
                // driver change.
                _meta: {
                  permissionMode: currentMode,
                  ...(input.model !== undefined ? { model: input.model } : {}),
                },
              },
              5 * 60_000,
            );
          } catch (cause) {
            if (!closed) {
              events.unsafeOffer({
                _tag: "Error",
                message: cause instanceof Error ? cause.message : String(cause),
              });
            }
          } finally {
            if (!closed) {
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
          // Best-effort cancel. We deliberately do NOT SIGINT the child —
          // that would kill the persistent agent and end every future send
          // for this session. If `session/cancel` isn't recognised the
          // server replies with an error we ignore.
          notify("session/cancel", { sessionId: sid });
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
