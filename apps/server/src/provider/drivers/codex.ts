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
  type StartSessionInput,
} from "@forkzero/wire";

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
  readonly send: (text: string) => Effect.Effect<void>;
  readonly interrupt: () => Effect.Effect<void>;
  readonly close: () => Effect.Effect<void>;
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
  sessionId: AgentSessionId,
): Effect.Effect<CodexSessionHandle, AgentSessionStartError> =>
  Effect.gen(function* () {
    const events = yield* Mailbox.make<AgentEvent>();

    let codex: Codex;
    let thread: Thread;
    try {
      codex = new Codex({
        ...(apiKey !== null ? { apiKey } : {}),
      });
      thread = codex.startThread({
        workingDirectory: cwd,
        // Codex SDK exposes `approvalPolicy` but no callback — when set to
        // anything other than "never" it routes prompts to its own stdio,
        // which we can't bridge to forkzero's toast. Stay on "never" until
        // the SDK exposes a programmatic hook; Claude is the primary
        // permission path in Phase 4.
        sandboxMode: "read-only",
        approvalPolicy: "never",
        skipGitRepoCheck: true,
        ...(input.model !== undefined ? { model: input.model } : {}),
        // `input.agents` is deliberately ignored — the Codex SDK has no
        // sub-agents primitive. Cross-provider delegation is sketched in
        // specs/sub-agents/decisions/0012-codex-bridge-via-mcp.md and
        // lands as a follow-up PR.
      });
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

    // Per-turn abort + serialization. `currentAbort` is the abort controller
    // for whichever turn is in flight (null between turns); `pending` chains
    // sends so they run sequentially against the same thread.
    let currentAbort: AbortController | null = null;
    let pending: Promise<void> = Promise.resolve();
    let closed = false;

    const runTurn = async (text: string): Promise<void> => {
      if (closed) return;
      const abort = new AbortController();
      currentAbort = abort;
      try {
        const { events: turnEvents } = await thread.runStreamed(text, {
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

    const enqueueTurn = (text: string): void => {
      pending = pending.then(() => runTurn(text));
    };

    if (input.initialPrompt !== undefined && input.initialPrompt.length > 0) {
      enqueueTurn(input.initialPrompt);
    }

    const handle: CodexSessionHandle = {
      events: Mailbox.toStream(events),
      send: (text) =>
        Effect.sync(() => {
          enqueueTurn(text);
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
    };
    return handle;
  });
