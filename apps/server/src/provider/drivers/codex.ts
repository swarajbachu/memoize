import {
  Codex,
  type Thread,
  type ThreadEvent,
  type ThreadItem,
} from "@openai/codex-sdk";
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

// Codex SDK accepts only `local_image` input items — no PDFs or arbitrary
// documents. Match Claude's image set so a single composer attachment chip
// behaves consistently across providers; PDFs are silently dropped with a
// warn (PDF support would need its own SDK item type).
const SUPPORTED_CODEX_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/**
 * Live-only handle for one Codex SDK conversation. Mirrors `ClaudeSessionHandle`
 * — the orchestrator owns the sessionId → handle map and forwards RPCs here.
 *
 * Codex's Thread API is turn-scoped (each `runStreamed` is one turn) rather
 * than the streaming-input loop Claude uses. We model `send()` as "start a new
 * turn"; only one turn runs at a time per session, so a second `send()` while
 * a turn is in flight is queued behind the current one.
 */
export interface CodexSessionHandle {
  readonly events: Stream.Stream<AgentEvent>;
  readonly send: (
    text: string,
    attachments?: ReadonlyArray<AttachmentRef>,
  ) => Effect.Effect<void>;
  readonly interrupt: () => Effect.Effect<void>;
  readonly close: () => Effect.Effect<void>;
  /**
   * Plan mode and `AskUserQuestion` are Claude-only for now. Codex
   * sessions accept the calls but no-op so RPC routing stays uniform.
   */
  readonly setPermissionMode: (mode: PermissionMode) => Effect.Effect<void>;
  readonly answerQuestion: (
    itemId: AgentItemId,
    answers: ReadonlyArray<UserQuestionAnswer>,
  ) => Effect.Effect<void>;
}

let itemCounter = 0;
const nextItemId = (): AgentItemId =>
  `i_${Date.now()}_${++itemCounter}` as AgentItemId;

/**
 * Translate one Codex ThreadItem into zero-or-more wire AgentEvents. We only
 * surface the kinds that have a meaningful UI in Phase 2; reasoning, todo
 * lists, and web search show up as `AssistantMessage` summaries so the panel
 * isn't silent. Phase 3 will give them dedicated rows.
 */
const translateItem = (
  item: ThreadItem,
  phase: "started" | "completed",
): ReadonlyArray<AgentEvent> => {
  switch (item.type) {
    case "agent_message":
      // Only emit on completion to avoid double-rendering streaming partials.
      if (phase !== "completed") return [];
      return [
        {
          _tag: "AssistantMessage",
          itemId: nextItemId(),
          text: item.text,
        },
      ];
    case "reasoning":
      if (phase !== "completed") return [];
      return [
        {
          _tag: "AssistantMessage",
          itemId: nextItemId(),
          text: `(reasoning) ${item.text}`,
        },
      ];
    case "command_execution":
      if (phase === "started") {
        return [
          {
            _tag: "ToolUse",
            itemId: nextItemId(),
            tool: "command_execution",
            input: { command: item.command },
          },
        ];
      }
      return [
        {
          _tag: "ToolResult",
          itemId: nextItemId(),
          output: {
            command: item.command,
            exit_code: item.exit_code,
            output: item.aggregated_output,
          },
          isError: item.status === "failed",
        },
      ];
    case "file_change":
      if (phase !== "completed") return [];
      return [
        {
          _tag: "ToolUse",
          itemId: nextItemId(),
          tool: "file_change",
          input: { changes: item.changes },
        },
        {
          _tag: "ToolResult",
          itemId: nextItemId(),
          output: { changes: item.changes, status: item.status },
          isError: item.status === "failed",
        },
      ];
    case "mcp_tool_call":
      if (phase === "started") {
        return [
          {
            _tag: "ToolUse",
            itemId: nextItemId(),
            tool: `${item.server}/${item.tool}`,
            input: item.arguments,
          },
        ];
      }
      return [
        {
          _tag: "ToolResult",
          itemId: nextItemId(),
          output: item.result ?? item.error ?? null,
          isError: item.status === "failed",
        },
      ];
    case "web_search":
      if (phase !== "completed") return [];
      return [
        {
          _tag: "ToolUse",
          itemId: nextItemId(),
          tool: "web_search",
          input: { query: item.query },
        },
      ];
    case "todo_list":
      if (phase !== "completed") return [];
      return [
        {
          _tag: "AssistantMessage",
          itemId: nextItemId(),
          text:
            "todo:\n" +
            item.items
              .map((t) => `${t.completed ? "[x]" : "[ ]"} ${t.text}`)
              .join("\n"),
        },
      ];
    case "error":
      return [
        {
          _tag: "Error",
          message: item.message,
        },
      ];
    default:
      return [];
  }
};

const translateEvent = (ev: ThreadEvent): ReadonlyArray<AgentEvent> => {
  switch (ev.type) {
    case "thread.started":
      // Surface the codex thread id so MessageStore can persist it as the
      // session's resume cursor. Same shape Claude uses for its session_id.
      return [
        {
          _tag: "SessionCursor",
          cursor: ev.thread_id,
          strategy: "codex-thread-id",
        },
      ];
    case "turn.started":
      return [];
    case "item.started":
      return translateItem(ev.item, "started");
    case "item.updated":
      return [];
    case "item.completed":
      return translateItem(ev.item, "completed");
    case "turn.completed":
      // Turn ends but session stays open — don't emit Completed here.
      return [];
    case "turn.failed":
      return [{ _tag: "Error", message: ev.error.message }];
    case "error":
      return [{ _tag: "Error", message: ev.message }];
    default:
      return [];
  }
};

/**
 * Spin up a Codex conversation. Codex doesn't expose a streaming-input mode,
 * so each `send()` launches a fresh `runStreamed` turn against the same
 * Thread. A small queue serializes overlapping sends; `interrupt()` aborts
 * the in-flight turn but leaves the thread alive for subsequent sends.
 *
 * `apiKey` is read from the keychain by the caller and passed to the SDK
 * constructor. `null` is tolerated — the SDK will fall back to Codex CLI
 * default auth (`~/.codex/auth.json`).
 */
export const startCodexSession = (
  input: StartSessionInput,
  cwd: string,
  apiKey: string | null,
  codexPath: string | null,
  sessionId: AgentSessionId,
  resumeCursor: string | null = null,
): Effect.Effect<CodexSessionHandle, AgentSessionStartError, AttachmentService> =>
  Effect.gen(function* () {
    const attachments = yield* AttachmentService;
    const events = yield* Mailbox.make<AgentEvent>();

    let codex: Codex;
    let thread: Thread;
    try {
      codex = new Codex({
        ...(apiKey !== null ? { apiKey } : {}),
        // Point the SDK at the user's installed `codex` binary; the SDK's
        // bundled platform CLI ships as an optional native dep we don't
        // package. Without this override the SDK throws "Unable to locate
        // Codex CLI binaries" inside the .dmg.
        ...(codexPath !== null ? { codexPathOverride: codexPath } : {}),
      });
      const threadOptions = {
        workingDirectory: cwd,
        // Codex SDK exposes `approvalPolicy` but no callback — when set to
        // anything other than "never" it routes prompts to its own stdio,
        // which we can't bridge to memoize's toast. Stay on "never" until
        // the SDK exposes a programmatic hook; Claude is the primary
        // permission path in Phase 4.
        sandboxMode: "read-only" as const,
        approvalPolicy: "never" as const,
        skipGitRepoCheck: true,
        ...(input.model !== undefined ? { model: input.model } : {}),
        // `input.agents` is deliberately ignored — the Codex SDK has no
        // sub-agents primitive. Cross-provider delegation is sketched in
        // specs/sub-agents/decisions/0012-codex-bridge-via-mcp.md and
        // lands as a follow-up PR.
      };
      // Resume reattaches to a prior codex thread by id; the SDK reuses the
      // server-side conversation state but does not replay items, so the
      // renderer's persisted timeline remains the source of truth for what
      // happened before. Start vs resume is the only branch — turn shape
      // is identical from here on.
      thread =
        resumeCursor !== null
          ? codex.resumeThread(resumeCursor, threadOptions)
          : codex.startThread(threadOptions);
    } catch (cause) {
      yield* events.end;
      return yield* Effect.fail(
        new AgentSessionStartError({
          providerId: "codex",
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
      );
    }

    events.unsafeOffer({
      _tag: "Started",
      sessionId,
      providerId: "codex",
      mode: "sdk",
    });

    // On resume the SDK won't emit `thread.started` again — re-announce the
    // cursor so MessageStore reaffirms the persisted strategy. Idempotent on
    // the DB side: cursor + strategy stay unchanged.
    if (resumeCursor !== null) {
      events.unsafeOffer({
        _tag: "SessionCursor",
        cursor: resumeCursor,
        strategy: "codex-thread-id",
      });
    }

    // Resolve attachments to `local_image` paths once per send — codex's SDK
    // copies the file on each turn, so we don't need to keep handles open. PDFs
    // and other non-image refs are dropped with a warn (Codex SDK 0.128 only
    // accepts images). `pending-` ids are queued chips whose upload hadn't
    // finished by the time `send` fired; skip them rather than block the turn.
    const resolveImageInputs = async (
      refs: ReadonlyArray<AttachmentRef>,
    ): Promise<ReadonlyArray<{ readonly type: "local_image"; readonly path: string }>> => {
      const resolved = await Promise.all(
        refs.map(async (ref) => {
          if (ref.id.startsWith("pending-")) {
            console.warn(
              `[codex.attach] skipping pending attachment id=${ref.id} (upload didn't finish before send)`,
            );
            return null;
          }
          const normalizedMime =
            ref.mimeType.toLowerCase() === "image/jpg"
              ? "image/jpeg"
              : ref.mimeType.toLowerCase();
          if (!SUPPORTED_CODEX_IMAGE_MIME.has(normalizedMime)) {
            console.warn(
              `[codex.attach] dropping unsupported mime id=${ref.id} mime=${ref.mimeType} (codex accepts images only)`,
            );
            return null;
          }
          const meta = await Effect.runPromise(attachments.readPath(ref.id));
          if (meta === null) {
            console.warn(
              `[codex.attach] blob not found id=${ref.id} (db row missing or file deleted)`,
            );
            return null;
          }
          return { type: "local_image" as const, path: meta.path };
        }),
      );
      return resolved.filter(
        (item): item is { readonly type: "local_image"; readonly path: string } =>
          item !== null,
      );
    };

    // Per-turn abort + serialization. `currentAbort` is the abort controller
    // for whichever turn is in flight (null between turns); `pending` chains
    // sends so they run sequentially against the same thread.
    let currentAbort: AbortController | null = null;
    let pending: Promise<void> = Promise.resolve();
    let closed = false;

    const runTurn = async (
      text: string,
      attachmentRefs: ReadonlyArray<AttachmentRef>,
    ): Promise<void> => {
      if (closed) return;
      const abort = new AbortController();
      currentAbort = abort;
      try {
        const imageInputs = await resolveImageInputs(attachmentRefs);
        // SDK accepts `string | UserInput[]`. If we have no images, keep the
        // plain-string path so `codex --version`-style trivial turns serialize
        // the same as before; only build the structured array when needed.
        const turnInput =
          imageInputs.length === 0
            ? text
            : [{ type: "text" as const, text }, ...imageInputs];
        const { events: turnEvents } = await thread.runStreamed(turnInput, {
          signal: abort.signal,
        });
        for await (const ev of turnEvents) {
          for (const out of translateEvent(ev)) {
            events.unsafeOffer(out);
          }
        }
      } catch (cause) {
        if (!closed) {
          events.unsafeOffer({
            _tag: "Error",
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      } finally {
        if (currentAbort === abort) currentAbort = null;
      }
    };

    const enqueueTurn = (
      text: string,
      attachmentRefs: ReadonlyArray<AttachmentRef> = [],
    ): void => {
      pending = pending.then(() => runTurn(text, attachmentRefs));
    };

    if (input.initialPrompt !== undefined && input.initialPrompt.length > 0) {
      enqueueTurn(input.initialPrompt);
    }

    const handle: CodexSessionHandle = {
      events: Mailbox.toStream(events),
      send: (text, attachmentRefs) =>
        Effect.sync(() => {
          enqueueTurn(text, attachmentRefs ?? []);
        }),
      interrupt: () =>
        Effect.sync(() => {
          currentAbort?.abort();
        }),
      close: () =>
        Effect.gen(function* () {
          closed = true;
          currentAbort?.abort();
          yield* events.end;
        }),
      setPermissionMode: () => Effect.void,
      answerQuestion: () => Effect.void,
    };
    return handle;
  });
