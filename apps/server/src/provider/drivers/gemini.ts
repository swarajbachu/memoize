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
 * Live-only handle for one Gemini conversation. Mirrors the Grok/Codex/Claude
 * handle shape so `ProviderService` routes RPCs without caring which provider
 * backs the session.
 *
 * Google's `@google/gemini-cli` exposes an ACP server via
 * `gemini --experimental-acp` — the exact same JSON-RPC protocol Grok uses.
 * One persistent child per session (Claude-style), not one spawn per turn
 * (Codex-style). The conversation is identified by an ACP-minted `sessionId`
 * returned from `session/new`; we surface that as a
 * `SessionCursor { strategy: "grok-session-id" }` (intentional shared label —
 * the persistence shape is identical to Grok's; renaming the literal would
 * be a migration of its own).
 */
export interface GeminiSessionHandle {
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
   * No ACP `UserQuestion` primitive yet — match Grok and stay a no-op so
   * RPC routing remains uniform.
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
 * check both so either format works with Gemini's evolving ACP impl.
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
        : typeof u["kind"] === "string"
          ? (u["kind"] as string)
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
    if (u["cmd"] !== undefined) return { command: u["cmd"] };
    if (Array.isArray(u["locations"]) && u["locations"].length > 0) {
      const loc = (u["locations"] as Array<Record<string, unknown>>)[0];
      if (loc !== undefined && typeof loc["path"] === "string") return { path: loc["path"] };
    }
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

  const normalizeGeminiTool = (rawKind: string): string => {
    switch (rawKind) {
      case "read": return "Read";
      case "bash": return "Bash";
      case "edit": return "Edit";
      case "write": return "Write";
      case "grep": return "Grep";
      case "glob": return "Glob";
      case "search": return "WebSearch";
      case "fetch": return "WebFetch";
      default: return rawKind.charAt(0).toUpperCase() + rawKind.slice(1);
    }
  };

  const buildGeminiInput = (u: Record<string, unknown>, geminiKind: string | null): unknown => {
    const input: Record<string, unknown> = {};
    if (typeof u["title"] === "string") {
      input["description"] = u["title"];
    }
    switch (geminiKind) {
      case "read":
      case "edit":
      case "write": {
        const locations = u["locations"];
        if (Array.isArray(locations) && locations.length > 0) {
          const loc = locations[0];
          if (loc !== null && typeof loc === "object" && typeof (loc as Record<string, unknown>)["path"] === "string") {
            input["file_path"] = (loc as Record<string, unknown>)["path"];
          }
        }
        break;
      }
      case "bash": {
        if (typeof u["command"] === "string") input["command"] = u["command"];
        else if (typeof u["cmd"] === "string") input["command"] = u["cmd"];
        break;
      }
      case "grep":
      case "glob": {
        if (typeof u["pattern"] === "string") input["pattern"] = u["pattern"];
        if (typeof u["path"] === "string") input["path"] = u["path"];
        break;
      }
    }
    return Object.keys(input).length > 0 ? input : null;
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
    case "function_call":
    case "custom_tool_call":
    case "tool_search_call":
    case "local_shell_call":
    case "web_search_call":
    case "image_generation_call": {
      const geminiToolKind = typeof u["kind"] === "string" ? (u["kind"] as string) : null;
      if (geminiToolKind === "think") return [];
      const toolName = geminiToolKind !== null ? normalizeGeminiTool(geminiToolKind) : extractToolName();
      const input = geminiToolKind !== null ? buildGeminiInput(u, geminiToolKind) : extractInput();
      console.log(
        `[gemini.translate.tool] initCallId=${extractCallId()} tool=${toolName} input=${JSON.stringify(input).slice(0, 2048)}`,
      );
      return [
        {
          _tag: "ToolUse" as const,
          itemId: extractCallId(),
          tool: toolName,
          input,
        },
      ];
    }
    case "tool_call_update":
    case "available_commands_update":
      return [];
    case "tool_result":
    case "tool_output":
    case "function_call_output":
    case "custom_tool_call_output":
    case "tool_search_output": {
      console.log(
        `[gemini.translate.result] kind=${kind} raw=${JSON.stringify(u).slice(0, 4096)}`,
      );
      const isError = u["isError"] === true || u["is_error"] === true;
      const toolResult = {
        _tag: "ToolResult" as const,
        itemId: extractCallId(),
        output: extractOutput(),
        isError,
      };
      console.log(
        `[gemini.translate.result] → ToolResult itemId=${toolResult.itemId} output=${JSON.stringify(toolResult.output).slice(0, 2048)}`,
      );
      return [toolResult];
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
                  ? "Gemini agent reported an error with no detail."
                  : `Gemini agent error: ${serialized}`;
              } catch {
                return "Gemini agent reported an error.";
              }
            })();
      return [{ _tag: "Error", message }];
    }
    case "available_commands_update":
      return [];
    default:
      console.warn(
        `[gemini.translate] unknown sessionUpdate/type=${kind} payload=${((): string => {
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

const GEMINI_RPC_TRACE = process.env.MEMOIZE_DEBUG_GEMINI === "1";

const formatGeminiDiagnostics = (diagnostics: string): string => {
  const trimmed = diagnostics.trim();
  if (trimmed.length === 0) return trimmed;
  if (
    /Unknown arguments?:.*(?:experimental-acp|experimentalAcp|acp)/is.test(
      trimmed,
    )
  ) {
    return [
      "Installed Gemini CLI does not support ACP mode (`gemini --experimental-acp`).",
      "Upgrade Gemini CLI with `npm i -g @google/gemini-cli@latest`, then restart memoize.",
    ].join("\n");
  }
  return trimmed;
};

const formatRpcError = (
  err: JsonRpcError,
  diagnosticTail: string,
  rawEnvelope?: string,
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
    const trimmedDiagnostics = formatGeminiDiagnostics(diagnosticTail);
    if (trimmedDiagnostics.length > 0) parts.push(trimmedDiagnostics);
    else parts.push("Gemini ACP returned an error with no detail.");
  }
  if (typeof err.code === "number") parts.push(`(code ${err.code})`);
  const trimmedDiagnostics = formatGeminiDiagnostics(diagnosticTail);
  if (trimmedDiagnostics.length > 0 && parts.every((p) => p !== trimmedDiagnostics)) {
    parts.push(`Diagnostics:\n${trimmedDiagnostics}`);
  }
  if (rawEnvelope !== undefined && rawEnvelope.length > 0) {
    parts.push(`Raw JSON-RPC error:\n${rawEnvelope}`);
  }
  return parts.join(" — ");
};

/**
 * Spin up a Gemini conversation backed by a persistent ACP child process.
 * The handshake (`initialize` → `authenticate` → `session/new`) runs once
 * synchronously inside `start()`; auth or transport failures surface there
 * so the orchestrator can fail the session-create RPC cleanly.
 *
 * `apiKey` is forwarded as `GEMINI_API_KEY` on the child env. When null,
 * the CLI falls back to cached OAuth credentials under `~/.gemini/` (run
 * `gemini` interactively to sign in). We prefer the API-key auth method
 * when a key is set; otherwise `oauth-personal` / `cached_token`.
 */
export const startGeminiSession = (
  input: StartSessionInput,
  cwd: string,
  apiKey: string | null,
  geminiPath: string,
  sessionId: AgentSessionId,
  resumeCursor: string | null = null,
): Effect.Effect<GeminiSessionHandle, AgentSessionStartError, AttachmentService> =>
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
    let stderrTail = "";
    let stdoutNoiseTail = "";

    const diagnosticTail = (): string => {
      const parts: string[] = [];
      const trimmedStderr = stderrTail.trim();
      const trimmedStdout = stdoutNoiseTail.trim();
      if (trimmedStderr.length > 0) parts.push(`stderr:\n${trimmedStderr}`);
      if (trimmedStdout.length > 0) {
        parts.push(`non-JSON stdout:\n${trimmedStdout}`);
      }
      return parts.join("\n\n");
    };

    events.unsafeOffer({
      _tag: "Started",
      sessionId,
      providerId: "gemini",
      mode: "sdk",
    });

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(geminiPath, ["--experimental-acp"], {
        cwd,
        env: {
          ...process.env,
          ...(apiKey !== null ? { GEMINI_API_KEY: apiKey } : {}),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (cause) {
      yield* events.end;
      return yield* Effect.fail(
        new AgentSessionStartError({
          providerId: "gemini",
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
      if (GEMINI_RPC_TRACE) process.stderr.write(`[gemini.rpc.send] ${line}\n`);
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
          const diagnostics = formatGeminiDiagnostics(diagnosticTail());
          const detail = diagnostics.length > 0 ? ` — ${diagnostics}` : "";
          reject(
            new Error(
              `Gemini ACP ${method} timed out after ${timeoutMs}ms${detail}`,
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
      if (GEMINI_RPC_TRACE) process.stderr.write(`[gemini.rpc.recv] ${line}\n`);
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // Known issue: Gemini CLI sometimes emits plain text to stdout
        // alongside the JSON-RPC stream (google-gemini/gemini-cli#22647).
        // Log to stderr so the leak is visible during debugging, but don't
        // abort — assistant content rides typed `session/update` frames.
        stdoutNoiseTail = (stdoutNoiseTail + `${line}\n`).slice(-4096);
        process.stderr.write(`[gemini.stdout.nonjson] ${line}\n`);
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
            `[gemini.rpc] unhandled server→client request method=${msg.method} id=${msg.id}`,
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
        let rawEnvelope = "";
        try {
          rawEnvelope = JSON.stringify(msg.error, null, 2);
          process.stderr.write(
            `[gemini.rpc.error] method=${resolver.method} id=${id} ${rawEnvelope}\n`,
          );
        } catch {
          process.stderr.write(
            `[gemini.rpc.error] method=${resolver.method} id=${id} (unserialisable)\n`,
          );
        }
        const detail = formatRpcError(msg.error, diagnosticTail(), rawEnvelope);
        resolver.reject(new Error(`Gemini ${resolver.method} failed: ${detail}`));
      } else {
        resolver.resolve(msg.result ?? {});
      }
    });

    child.stderr.on("data", (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-4096);
      process.stderr.write(`[gemini.stderr] ${chunk}`);
    });

    child.on("error", (err) => {
      if (closed) return;
      events.unsafeOffer({ _tag: "Error", message: err.message });
    });

    child.on("close", (code, signal) => {
      rl.close();
      const diagnostics = formatGeminiDiagnostics(diagnosticTail());
      const exitDetail = diagnostics.length > 0
        ? `Gemini ACP exited (code ${code ?? "null"}, signal ${signal ?? "null"}): ${diagnostics}`
        : `Gemini ACP exited unexpectedly (code ${code ?? "null"}, signal ${signal ?? "null"}).`;
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
          apiKey !== null && authIds.has("gemini-api-key")
            ? "gemini-api-key"
            : authIds.has("oauth-personal")
              ? "oauth-personal"
              : authIds.has("cached_token")
                ? "cached_token"
                : null;
        if (methodId === null) {
          throw new Error(
            "Gemini ACP offered no usable auth method. Run `gemini` to sign in, or save a Gemini API key.",
          );
        }
        await request("authenticate", {
          methodId,
          _meta:
            methodId === "gemini-api-key" && apiKey !== null
              ? { "api-key": apiKey, headless: true }
              : { headless: true },
        });

        const sessionResult = (await request("session/new", {
          cwd,
          mcpServers: [],
        })) as { sessionId?: unknown };

        if (typeof sessionResult.sessionId !== "string") {
          throw new Error("Gemini ACP session/new returned no sessionId.");
        }
        return sessionResult.sessionId;
      },
      catch: (cause) =>
        new AgentSessionStartError({
          providerId: "gemini",
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

    if (resumeCursor !== null && resumeCursor !== acpSessionId) {
      console.warn(
        `[gemini] previous cursor ${resumeCursor} discarded — ACP session/load not wired; using new session ${acpSessionId}`,
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

    const handle: GeminiSessionHandle = {
      events: Mailbox.toStream(events),
      send: (text, attachmentRefs) =>
        Effect.sync(() => {
          if (attachmentRefs !== undefined && attachmentRefs.length > 0) {
            console.warn(
              `[gemini.attach] dropping ${attachmentRefs.length} attachment(s) — ACP image content shape not wired`,
            );
          }
          enqueuePrompt(text);
        }),
      interrupt: () =>
        Effect.sync(() => {
          const sid = acpSessionId;
          if (sid === null) return;
          // Best-effort cancel; do NOT SIGINT the child or the persistent
          // session dies for every subsequent send.
          notify("session/cancel", { sessionId: sid });
        }),
      close: () =>
        Effect.gen(function* () {
          closed = true;
          for (const { reject, timer } of pending.values()) {
            clearTimeout(timer);
            reject(new Error("Gemini session closed"));
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
