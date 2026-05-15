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
 * Live-only handle for one Cursor Agent conversation. Mirrors Grok's
 * `GrokSessionHandle` shape so `ProviderService` routes RPCs without caring
 * which provider backs the session.
 *
 * Cursor exposes itself as an ACP server via `cursor-agent acp` over
 * stdin/stdout JSON-RPC. One persistent child per session. The conversation
 * is identified by an ACP-minted `sessionId` returned from `session/new`;
 * we surface that as a `SessionCursor { strategy: "cursor-session-id" }`
 * so it round-trips through `MessageStore` for future resume support.
 */
export interface CursorSessionHandle {
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
   * Cursor's `cursor/ask_question` extension method isn't wired yet — match
   * Grok and stay a no-op so RPC routing remains uniform.
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
 * `AgentEvent`s. Cursor's ACP server emits the same shapes as Grok per the
 * ACP spec; the handler is a direct copy of grok.ts's translator.
 */
const translateSessionUpdate = (update: unknown): ReadonlyArray<AgentEvent> => {
  if (update === null || typeof update !== "object") return [];
  const u = update as Record<string, unknown>;
  const kind = typeof u["sessionUpdate"] === "string"
    ? (u["sessionUpdate"] as string)
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

  switch (kind) {
    case "agent_message_chunk": {
      const text = asText(u["content"]);
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
    case "thinking_chunk": {
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
    case "tool_use": {
      const id =
        typeof u["toolCallId"] === "string"
          ? ((u["toolCallId"] as string) as AgentItemId)
          : typeof u["id"] === "string"
            ? ((u["id"] as string) as AgentItemId)
            : nextItemId();
      const tool =
        typeof u["tool"] === "string"
          ? (u["tool"] as string)
          : typeof u["name"] === "string"
            ? (u["name"] as string)
            : "tool";
      const input = u["input"] ?? u["arguments"] ?? null;
      return [
        {
          _tag: "ToolUse",
          itemId: id,
          tool,
          input,
        },
      ];
    }
    case "tool_result":
    case "tool_output": {
      const id =
        typeof u["toolCallId"] === "string"
          ? ((u["toolCallId"] as string) as AgentItemId)
          : typeof u["id"] === "string"
            ? ((u["id"] as string) as AgentItemId)
            : nextItemId();
      const output = u["output"] ?? u["content"] ?? u["result"] ?? null;
      const isError = u["isError"] === true || u["is_error"] === true;
      return [
        {
          _tag: "ToolResult",
          itemId: id,
          output,
          isError,
        },
      ];
    }
    case "error":
    case "agent_error": {
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
                  ? "Cursor agent reported an error with no detail."
                  : `Cursor agent error: ${serialized}`;
              } catch {
                return "Cursor agent reported an error.";
              }
            })();
      return [{ _tag: "Error", message }];
    }
    default:
      console.warn(`[cursor.translate] unknown sessionUpdate=${kind}`);
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

const CURSOR_RPC_TRACE = process.env.MEMOIZE_DEBUG_CURSOR === "1";

/**
 * Build a human-readable error from a JSON-RPC error envelope. ACP servers
 * commonly stash the real failure in `error.data`; `stderrTail` is the
 * trailing chunk of cursor-agent's stderr captured during this session, used
 * when the JSON-RPC envelope itself is empty.
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
    else parts.push("Cursor ACP returned an error with no detail.");
  }
  if (typeof err.code === "number") parts.push(`(code ${err.code})`);
  return parts.join(" — ");
};

/**
 * Spin up a Cursor Agent conversation backed by a persistent ACP child
 * process. The handshake (`initialize` → `authenticate` → `session/new`)
 * runs once synchronously inside `start()`; auth or transport failures
 * surface there so the orchestrator can fail the session-create RPC
 * cleanly.
 *
 * `apiKey` is forwarded as `CURSOR_API_KEY` on the child env. When null the
 * child reads cached credentials from `cursor-agent login` (browser-OAuth
 * flow). `cursor_login` auth method is preferred when a key is set;
 * otherwise `cached_token`.
 */
export const startCursorSession = (
  input: StartSessionInput,
  cwd: string,
  apiKey: string | null,
  cursorPath: string,
  sessionId: AgentSessionId,
  resumeCursor: string | null = null,
): Effect.Effect<CursorSessionHandle, AgentSessionStartError, AttachmentService> =>
  Effect.gen(function* () {
    yield* AttachmentService;
    const events = yield* Mailbox.make<AgentEvent>();

    let currentMode: PermissionMode = input.permissionMode ?? "default";
    let acpSessionId: string | null = null;
    let nextRpcId = 1;
    let closed = false;
    let inflight: Promise<void> = Promise.resolve();
    const pending = new Map<number, PendingResolver>();
    let stderrTail = "";

    events.unsafeOffer({
      _tag: "Started",
      sessionId,
      providerId: "cursor",
      mode: "sdk",
    });

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(cursorPath, ["acp"], {
        cwd,
        env: {
          ...process.env,
          ...(apiKey !== null ? { CURSOR_API_KEY: apiKey } : {}),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (cause) {
      yield* events.end;
      return yield* Effect.fail(
        new AgentSessionStartError({
          providerId: "cursor",
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
      if (CURSOR_RPC_TRACE) process.stderr.write(`[cursor.rpc.send] ${line}\n`);
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
              `Cursor ACP ${method} timed out after ${timeoutMs}ms${detail}`,
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
      if (CURSOR_RPC_TRACE) process.stderr.write(`[cursor.rpc.recv] ${line}\n`);
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        return;
      }
      if (parsed === null || typeof parsed !== "object") return;
      const msg = parsed as JsonRpcMessage;

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
          console.warn(
            `[cursor.rpc] unhandled server→client request method=${msg.method} id=${msg.id}`,
          );
          return;
        }
        return;
      }

      const id = typeof msg.id === "number" ? msg.id : null;
      if (id === null) return;
      const resolver = pending.get(id);
      if (resolver === undefined) return;
      pending.delete(id);
      clearTimeout(resolver.timer);
      if (msg.error !== undefined) {
        try {
          process.stderr.write(
            `[cursor.rpc.error] method=${resolver.method} id=${id} ${JSON.stringify(msg.error)}\n`,
          );
        } catch {
          process.stderr.write(
            `[cursor.rpc.error] method=${resolver.method} id=${id} (unserialisable)\n`,
          );
        }
        const detail = formatRpcError(msg.error, stderrTail);
        resolver.reject(new Error(`Cursor ${resolver.method} failed: ${detail}`));
      } else {
        resolver.resolve(msg.result ?? {});
      }
    });

    child.stderr.on("data", (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-4096);
      process.stderr.write(`[cursor.stderr] ${chunk}`);
    });

    child.on("error", (err) => {
      if (closed) return;
      events.unsafeOffer({ _tag: "Error", message: err.message });
    });

    child.on("close", (code, signal) => {
      rl.close();
      const trimmedStderr = stderrTail.trim();
      const exitDetail = trimmedStderr.length > 0
        ? `Cursor ACP exited (code ${code ?? "null"}, signal ${signal ?? "null"}): ${trimmedStderr}`
        : `Cursor ACP exited unexpectedly (code ${code ?? "null"}, signal ${signal ?? "null"}).`;
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
        // Cursor advertises `cursor_login` for OAuth-style credentials and
        // `cached_token` once a prior `cursor-agent login` has stored one.
        // When an API key is set we prefer `cursor_login` (the CLI handles
        // the key/token translation server-side); otherwise fall back to
        // the cached token. If neither is available, fail with a clear
        // message so the user knows what to run.
        const methodId =
          apiKey !== null && authIds.has("cursor_login")
            ? "cursor_login"
            : authIds.has("cached_token")
              ? "cached_token"
              : authIds.has("cursor_login")
                ? "cursor_login"
                : null;
        if (methodId === null) {
          throw new Error(
            "Cursor ACP offered no usable auth method. Run `cursor-agent login`, or set CURSOR_API_KEY.",
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
          throw new Error("Cursor ACP session/new returned no sessionId.");
        }
        return sessionResult.sessionId;
      },
      catch: (cause) =>
        new AgentSessionStartError({
          providerId: "cursor",
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
      strategy: "cursor-session-id",
    });

    if (resumeCursor !== null && resumeCursor !== acpSessionId) {
      console.warn(
        `[cursor] previous cursor ${resumeCursor} discarded — ACP session/load not wired; using new session ${acpSessionId}`,
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

    const handle: CursorSessionHandle = {
      events: Mailbox.toStream(events),
      send: (text, attachmentRefs) =>
        Effect.sync(() => {
          if (attachmentRefs !== undefined && attachmentRefs.length > 0) {
            console.warn(
              `[cursor.attach] dropping ${attachmentRefs.length} attachment(s) — ACP image content shape not wired`,
            );
          }
          enqueuePrompt(text);
        }),
      interrupt: () =>
        Effect.sync(() => {
          const sid = acpSessionId;
          if (sid === null) return;
          notify("session/cancel", { sessionId: sid });
        }),
      close: () =>
        Effect.gen(function* () {
          closed = true;
          for (const { reject, timer } of pending.values()) {
            clearTimeout(timer);
            reject(new Error("Cursor session closed"));
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
