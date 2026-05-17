import type { AgentEvent, AgentItemId } from "@memoize/wire";

/**
 * Shared translator for Agent Client Protocol (ACP) `session/update` frames.
 * Lifted out of grok.ts / gemini.ts / cursor.ts which each carried a near-
 * identical copy. The renderer expects every provider's tool calls to look
 * like Claude's (see the "Normalized Tool-Call Contract" doc-block above
 * `ToolUseEvent` in `packages/wire/src/agent.ts`), so this translator
 * coerces ACP frames into that shape.
 *
 * Per-provider quirks (Gemini's `kind === "think"` skip, etc.) live in a
 * single `provider` switch instead of three forks of the same function.
 *
 * Set `MEMOIZE_DEBUG_ACP=1` to trace every translator decision to stderr
 * (kind, status, what events were emitted). Pair with `MEMOIZE_DEBUG_<P>`
 * (GEMINI/GROK/CURSOR) for raw JSON-RPC frame logs in the drivers.
 */

export type AcpProviderTag = "grok" | "gemini" | "cursor";

const ACP_TRACE = process.env.MEMOIZE_DEBUG_ACP === "1";

const trace = (provider: AcpProviderTag, msg: string): void => {
  if (!ACP_TRACE) return;
  process.stderr.write(`[acp.${provider}] ${msg}\n`);
};

const safePreview = (v: unknown, max = 240): string => {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (s === undefined) return "undefined";
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  } catch {
    return "(unserialisable)";
  }
};

let itemCounter = 0;
const nextItemId = (): AgentItemId =>
  `i_acp_${Date.now()}_${++itemCounter}` as AgentItemId;

const tryParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

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

const extractCallId = (u: Record<string, unknown>): AgentItemId => {
  const raw =
    typeof u["toolCallId"] === "string"
      ? u["toolCallId"]
      : typeof u["call_id"] === "string"
        ? u["call_id"]
        : typeof u["callId"] === "string"
          ? u["callId"]
          : typeof u["id"] === "string"
            ? u["id"]
            : null;
  return raw !== null ? (raw as AgentItemId) : nextItemId();
};

/**
 * Convert a snake_case or camelCase identifier into a nice TitleCase label
 * suitable for display in the UI (e.g. "list_dir" → "List Dir",
 * "readFile" → "Read File"). Used both for unknown tool normalization and
 * as the fallback label in the renderer when we still don't have an exact
 * mapping.
 */
const toNiceToolLabel = (raw: string): string => {
  if (!raw) return "Tool";
  // Split on underscores or camelCase boundaries
  const words = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(" ");
};

/**
 * Map an ACP `kind` (or tool name) string to the Claude-canonical tool name
 * the renderer's ToolRow switch + iconForTool expect. We now handle the
 * full set of common Grok / ACP FS & shell tools so "list_dir", "read_file"
 * etc. stop showing up as the generic "tool" / "Other" rows the user saw.
 */
const normalizeAcpKind = (rawKind: string): string => {
  const k = rawKind.toLowerCase();
  switch (k) {
    case "read":
    case "read_file":
    case "readfile":
      return "Read";
    case "bash":
    case "execute":
    case "run_command":
    case "run_terminal_cmd":
    case "shell":
    case "shell_command":
    case "terminal":
      return "Bash";
    case "edit":
    case "edit_file":
    case "editfile":
      return "Edit";
    case "write":
    case "write_file":
    case "writefile":
      return "Write";
    case "grep":
    case "search":
    case "search_files":
    case "searchfiles":
      return "Grep";
    case "glob":
    case "glob_files":
    case "globfiles":
      return "Glob";
    case "websearch":
    case "web_search":
      return "WebSearch";
    case "webfetch":
    case "web_fetch":
    case "fetch":
    case "fetch_url":
      return "WebFetch";
    case "list_dir":
    case "listdir":
    case "list_directory":
    case "directory":
      return "ListDir";
    case "multi_edit":
    case "multiedit":
      return "MultiEdit";
    case "todo_write":
    case "todowrite":
      return "TodoWrite";
    default:
      // Fall back to a clean Title Case label (handles the rest of Grok's
      // native tools gracefully even if we haven't wired a dedicated case
      // in the renderer yet).
      return toNiceToolLabel(rawKind);
  }
};

const firstLocationPath = (u: Record<string, unknown>): string | null => {
  const locations = u["locations"];
  if (!Array.isArray(locations) || locations.length === 0) return null;
  const loc = locations[0];
  if (loc === null || typeof loc !== "object") return null;
  const p = (loc as Record<string, unknown>)["path"];
  return typeof p === "string" ? p : null;
};

/**
 * Walk an ACP `tool_call.content` array (or single block) and pluck the
 * first `diff` block if present. Gemini's ACP emits these for `edit` calls:
 *   `{ type: "diff", path, oldText, newText }`
 * (older variants spell them `old_text` / `new_text`).
 */
const extractDiffBlock = (
  content: unknown,
): { path?: string; oldText: string; newText: string } | null => {
  const items = Array.isArray(content) ? content : [content];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    if (b["type"] !== "diff") continue;
    const oldText =
      typeof b["oldText"] === "string"
        ? (b["oldText"] as string)
        : typeof b["old_text"] === "string"
          ? (b["old_text"] as string)
          : null;
    const newText =
      typeof b["newText"] === "string"
        ? (b["newText"] as string)
        : typeof b["new_text"] === "string"
          ? (b["new_text"] as string)
          : null;
    if (oldText === null || newText === null) continue;
    const path = typeof b["path"] === "string" ? (b["path"] as string) : undefined;
    return { path, oldText, newText };
  }
  return null;
};

/**
 * Build a canonical `input` object for the given tool name. ACP frames put
 * the same info in several different fields depending on provider/version,
 * so we look in each common spelling. The keys we emit match the
 * "Normalized Tool-Call Contract" enumerated next to `ToolUseEvent`.
 */
const buildCanonicalInput = (
  toolName: string,
  u: Record<string, unknown>,
): unknown => {
  const title = typeof u["title"] === "string" ? (u["title"] as string) : null;

  switch (toolName) {
    case "Edit":
    case "MultiEdit": {
      const diff = extractDiffBlock(u["content"]);
      if (diff !== null) {
        return {
          file_path: diff.path ?? firstLocationPath(u) ?? "",
          old_string: diff.oldText,
          new_string: diff.newText,
        };
      }
      const file_path = firstLocationPath(u);
      if (file_path !== null) return { file_path };
      break;
    }
    case "Write": {
      const file_path = firstLocationPath(u);
      const content =
        typeof u["content"] === "string"
          ? (u["content"] as string)
          : extractMessageText(u["content"]);
      const out: Record<string, unknown> = {};
      if (file_path !== null) out["file_path"] = file_path;
      if (content !== null) out["content"] = content;
      return Object.keys(out).length > 0 ? out : null;
    }
    case "Read": {
      const file_path = firstLocationPath(u);
      if (file_path !== null) {
        const out: Record<string, unknown> = { file_path };
        if (typeof u["offset"] === "number") out["offset"] = u["offset"];
        if (typeof u["limit"] === "number") out["limit"] = u["limit"];
        return out;
      }
      break;
    }
    case "Bash": {
      const command =
        typeof u["command"] === "string"
          ? (u["command"] as string)
          : typeof u["cmd"] === "string"
            ? (u["cmd"] as string)
            : null;
      if (command !== null) {
        const out: Record<string, unknown> = { command };
        if (title !== null) out["description"] = title;
        return out;
      }
      break;
    }
    case "Grep":
    case "Glob": {
      const out: Record<string, unknown> = {};
      if (typeof u["pattern"] === "string") out["pattern"] = u["pattern"];
      if (typeof u["path"] === "string") out["path"] = u["path"];
      if (typeof u["glob"] === "string") out["glob"] = u["glob"];
      if (Object.keys(out).length > 0) return out;
      break;
    }
    case "WebSearch": {
      const query =
        typeof u["query"] === "string"
          ? (u["query"] as string)
          : typeof u["q"] === "string"
            ? (u["q"] as string)
            : title;
      if (query !== null) return { query };
      break;
    }
    case "WebFetch": {
      const url = typeof u["url"] === "string" ? (u["url"] as string) : null;
      if (url !== null) {
        const out: Record<string, unknown> = { url };
        if (title !== null) out["prompt"] = title;
        return out;
      }
      break;
    }
  }

  // Generic fallback — preserve whatever the provider sent so the renderer
  // can still render *something* even for tool names we don't recognize.
  if (u["input"] !== undefined) return u["input"];
  if (u["arguments"] !== undefined) {
    const a = u["arguments"];
    return typeof a === "string" ? tryParseJson(a) : a;
  }
  if (u["command"] !== undefined) return { command: u["command"] };
  const file_path = firstLocationPath(u);
  if (file_path !== null) return { file_path };
  return title !== null ? { description: title } : null;
};

const extractToolName = (u: Record<string, unknown>): string => {
  // Direct fields first (most ACP implementations put the kind here)
  const kind = typeof u["kind"] === "string" ? (u["kind"] as string) : null;
  if (kind !== null && kind.length > 0) return normalizeAcpKind(kind);

  if (typeof u["tool"] === "string" && u["tool"].length > 0) return u["tool"] as string;
  if (typeof u["name"] === "string" && u["name"].length > 0) return u["name"] as string;
  if (typeof u["execution"] === "string" && u["execution"].length > 0) return u["execution"] as string;
  if (typeof u["command"] === "string" && u["command"].length > 0) return u["command"] as string;

  // Grok (and some other agents) sometimes nest the tool identity under
  // toolCall / tool_call / toolInfo. Look one level deeper so we don't
  // fall back to the useless generic "tool" label the user reported.
  const nestedCandidates = [
    u["toolCall"],
    u["tool_call"],
    u["toolInfo"],
    u["tool_info"],
    u["call"],
  ];
  for (const cand of nestedCandidates) {
    if (cand && typeof cand === "object") {
      const c = cand as Record<string, unknown>;
      const nestedKind = typeof c["kind"] === "string" ? (c["kind"] as string) : null;
      if (nestedKind && nestedKind.length > 0) return normalizeAcpKind(nestedKind);
      const nestedName =
        (typeof c["name"] === "string" && c["name"]) ||
        (typeof c["tool"] === "string" && c["tool"]) ||
        (typeof c["command"] === "string" && c["command"]);
      if (nestedName && typeof nestedName === "string" && nestedName.length > 0) {
        return normalizeAcpKind(nestedName);
      }
    }
  }

  // Last-ditch: sometimes the title/description of the call *is* the tool
  // (e.g. Grok sends title: "list_dir" with no kind). Use it.
  const title = typeof u["title"] === "string" ? (u["title"] as string) : null;
  if (title && title.length > 0 && title.length < 40) {
    // Heuristic: if it looks like a tool identifier, normalize it.
    if (/^[a-z0-9_]+$/i.test(title)) return normalizeAcpKind(title);
  }

  // Give the caller a chance to log the raw payload under debug before we
  // return the ultimate fallback.
  return "tool";
};

const extractOutput = (u: Record<string, unknown>): unknown => {
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

const extractErrorDetail = (u: Record<string, unknown>): string | null => {
  const fields = ["message", "error", "details", "data"] as const;
  for (const f of fields) {
    const v = u[f];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
};

const safeStringify = (u: Record<string, unknown>): string => {
  try {
    return JSON.stringify(u);
  } catch {
    return "(unserialisable)";
  }
};

/**
 * When extractToolName still returns the generic fallback "tool", dump the
 * full raw ACP update under the existing ACP debug flag so we can quickly
 * add the missing mapping on the next Grok (or Gemini/Cursor) release.
 * This directly implements the user's request for "add some logs".
 */
const logUnknownToolIfNeeded = (
  provider: AcpProviderTag,
  u: Record<string, unknown>,
  toolName: string,
  phase: string,
): void => {
  if (toolName !== "tool") return;
  if (!ACP_TRACE) return;
  trace(
    provider,
    `unknown tool ${phase} — raw payload=${safePreview(u, 800)}`,
  );
};

/**
 * Whether the update kind contributes to an in-flight assistant message
 * burst. ACP streams text as many tiny `agent_message_chunk` frames
 * (sometimes mid-token, like `monore` + `po`); the renderer would render
 * each as its own bubble unless we coalesce. Anything else flushes the
 * buffer.
 */
const isAssistantTextChunk = (kind: string): boolean =>
  kind === "agent_message_chunk" || kind === "message";

/**
 * Whether the update kind is a streaming thinking/reasoning delta.
 * Grok (and other ACP agents) emit one token per `agent_thought_chunk` /
 * `thinking_chunk`. Without coalescing we would emit a separate Thinking
 * row for every word — exactly the bug the user reported.
 */
const isThinkingChunk = (kind: string): boolean =>
  kind === "agent_thought_chunk" ||
  kind === "agent_reasoning_chunk" ||
  kind === "thinking_chunk" ||
  kind === "reasoning";

interface AcpTranslator {
  /**
   * Translate one ACP `session/update` payload. May return zero events
   * (chunk got buffered for coalescing) or multiple (a flush of buffered
   * assistant text plus the new event).
   */
  translate(update: unknown): ReadonlyArray<AgentEvent>;
  /**
   * Drain any buffered assistant text as a final `AssistantMessage` event.
   * Call when the turn ends (`stopReason`) or the session closes so the
   * last burst doesn't sit silently in memory.
   */
  flush(): ReadonlyArray<AgentEvent>;
}

/**
 * Per-tool-call state we keep so we can dedupe events. ACP servers re-send
 * `tool_call_update` frames for the same id as a call progresses (pending →
 * in_progress → completed); without dedupe each update becomes its own row
 * in the renderer.
 */
interface ToolCallState {
  /** What we last emitted as `ToolUse.input` — used to skip identical re-emits. */
  lastInputJson: string | null;
  /** True once we've emitted a `ToolResult` for this call. */
  resultEmitted: boolean;
  /** True once we've emitted a `ToolUse` for this call. */
  useEmitted: boolean;
}

/**
 * Create a per-session translator. Stateful because:
 *   1. ACP's `agent_message_chunk` is a delta protocol — we buffer
 *      consecutive chunks into one logical `AssistantMessage` event.
 *   2. `tool_call_update` is also a delta protocol — we dedupe so the
 *      renderer doesn't show a stack of "Read foo.ts" rows for one read.
 */
export const createAcpTranslator = (provider: AcpProviderTag): AcpTranslator => {
  // Buffer for the in-flight assistant message text. Reset to "" after
  // each flush.
  let assistantBuffer = "";
  let assistantItemId: AgentItemId | null = null;

  // Parallel buffer for thinking/reasoning chunks (Grok agent streams these
  // one token at a time). We coalesce them into a single Thinking event so
  // the UI shows one nice collapsible "Thinking" row instead of 20 one-word
  // rows.
  let thinkingBuffer = "";
  let thinkingItemId: AgentItemId | null = null;

  const toolStates = new Map<string, ToolCallState>();

  const flushAssistant = (): ReadonlyArray<AgentEvent> => {
    if (assistantBuffer.length === 0) return [];
    const ev: AgentEvent = {
      _tag: "AssistantMessage",
      itemId: assistantItemId ?? nextItemId(),
      text: assistantBuffer,
    };
    trace(
      provider,
      `flush AssistantMessage itemId=${ev.itemId} len=${assistantBuffer.length} preview=${safePreview(assistantBuffer)}`,
    );
    assistantBuffer = "";
    assistantItemId = null;
    return [ev];
  };

  const flushThinking = (): ReadonlyArray<AgentEvent> => {
    if (thinkingBuffer.length === 0) return [];
    const ev: AgentEvent = {
      _tag: "Thinking",
      itemId: thinkingItemId ?? nextItemId(),
      text: thinkingBuffer,
      redacted: false,
    };
    trace(
      provider,
      `flush Thinking itemId=${ev.itemId} len=${thinkingBuffer.length} preview=${safePreview(thinkingBuffer)}`,
    );
    thinkingBuffer = "";
    thinkingItemId = null;
    return [ev];
  };

  /**
   * Drain any pending thinking + assistant text. Order: thinking first
   * (the model usually emits reasoning before its final answer), then the
   * assistant message. Used both on explicit flush() and before every
   * non-streaming event.
   */
  const flushPending = (): ReadonlyArray<AgentEvent> => {
    const t = flushThinking();
    const a = flushAssistant();
    return t.length === 0 ? a : a.length === 0 ? t : [...t, ...a];
  };

  const getOrInitToolState = (id: string): ToolCallState => {
    let s = toolStates.get(id);
    if (s === undefined) {
      s = { lastInputJson: null, resultEmitted: false, useEmitted: false };
      toolStates.set(id, s);
    }
    return s;
  };

  const translateOne = (update: unknown): ReadonlyArray<AgentEvent> => {
    if (update === null || typeof update !== "object") return [];
    const u = update as Record<string, unknown>;
    const kind =
      typeof u["sessionUpdate"] === "string"
        ? (u["sessionUpdate"] as string)
        : typeof u["type"] === "string"
          ? (u["type"] as string)
          : null;
    if (kind === null) return [];

    // 1. Thinking / reasoning delta — buffer (coalesce) exactly like assistant
    //    text. This is the fix for the "Thinking The user is asking if I can..."
    //    word-by-word explosion the user reported with Grok.
    if (isThinkingChunk(kind)) {
      const text = asText(u["content"]);
      if (text === null || text.length === 0) return [];
      if (thinkingItemId === null) thinkingItemId = nextItemId();
      thinkingBuffer += text;
      trace(provider, `buffer thinking chunk len=${text.length} totalLen=${thinkingBuffer.length}`);
      return [];
    }

    // 2. Assistant text delta — buffer, don't emit yet.
    if (isAssistantTextChunk(kind)) {
      const text =
        kind === "message"
          ? extractMessageText(u["content"])
          : asText(u["content"]);
      if (text === null || text.length === 0) return [];
      if (assistantItemId === null) assistantItemId = nextItemId();
      assistantBuffer += text;
      trace(provider, `buffer message chunk len=${text.length} totalLen=${assistantBuffer.length}`);
      return [];
    }

    // 3. Any other event: flush both pending thinking + assistant text first
    //    so the timeline order stays correct ("reasoning burst → next tool /
    //    final answer").
    const flushed = flushPending();

    const tail = ((): ReadonlyArray<AgentEvent> => {
      switch (kind) {
        case "agent_thought_chunk":
        case "agent_reasoning_chunk":
        case "thinking_chunk":
        case "reasoning": {
          const text = asText(u["content"]);
          if (text === null || text.length === 0) return [];
          trace(provider, `emit Thinking len=${text.length}`);
          return [
            { _tag: "Thinking", itemId: nextItemId(), text, redacted: false },
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
          const rawKind =
            typeof u["kind"] === "string" ? (u["kind"] as string) : null;
          // Gemini emits a `think` tool call to advertise an internal
          // thought — we already surface those via `thinking_chunk`,
          // so don't double-render as a tool row.
          if (provider === "gemini" && rawKind === "think") {
            trace(provider, `skip think tool_call`);
            return [];
          }

          const callId = extractCallId(u);
          const toolName = extractToolName(u);
          logUnknownToolIfNeeded(provider, u, toolName, "tool_call");
          const input = buildCanonicalInput(toolName, u);
          const inputJson = safeStringify({ input });
          const state = getOrInitToolState(callId);
          // Dedupe: if we already emitted ToolUse with this exact input,
          // skip. Happens when an ACP server sends the same `tool_call`
          // twice (some implementations do for pending/in_progress).
          if (state.useEmitted && state.lastInputJson === inputJson) {
            trace(
              provider,
              `skip duplicate tool_call id=${callId} tool=${toolName}`,
            );
            return [];
          }
          state.useEmitted = true;
          state.lastInputJson = inputJson;
          trace(
            provider,
            `emit ToolUse id=${callId} tool=${toolName} input=${safePreview(input)}`,
          );
          return [
            {
              _tag: "ToolUse",
              itemId: callId,
              tool: toolName,
              input,
            },
          ];
        }

        // ACP sends `tool_call_update` frames to amend an in-flight call.
        // Three shapes we care about:
        //   - completed Read/Bash/Search → content carries result text
        //   - completed Edit → content carries a `diff` block (input)
        //   - status/title bump only → no new info
        // Dedupe carefully so progress updates don't stack rows in the
        // renderer: re-emit ToolUse only if the input meaningfully
        // changed (e.g. a diff arrived), and emit ToolResult once.
        case "tool_call_update": {
          const rawKind =
            typeof u["kind"] === "string" ? (u["kind"] as string) : null;
          if (provider === "gemini" && rawKind === "think") return [];
          const callId = extractCallId(u);
          const toolName = extractToolName(u);
          logUnknownToolIfNeeded(provider, u, toolName, "tool_call_update");
          const input = buildCanonicalInput(toolName, u);
          const state = getOrInitToolState(callId);
          const events: AgentEvent[] = [];

          // Re-emit ToolUse only when input changed substantively —
          // typically when a diff block first appears for an Edit. If the
          // input is identical to what we last emitted, skip.
          if (input !== null) {
            const inputJson = safeStringify({ input });
            if (state.lastInputJson !== inputJson) {
              state.lastInputJson = inputJson;
              state.useEmitted = true;
              trace(
                provider,
                `emit ToolUse(update) id=${callId} tool=${toolName} input=${safePreview(input)}`,
              );
              events.push({
                _tag: "ToolUse",
                itemId: callId,
                tool: toolName,
                input,
              });
            } else {
              trace(
                provider,
                `skip duplicate tool_call_update id=${callId} tool=${toolName}`,
              );
            }
          }

          const content = u["content"];
          const hasContent =
            content !== undefined &&
            Array.isArray(content) &&
            (content as ReadonlyArray<unknown>).length > 0;
          const isDiffOnly =
            hasContent && extractDiffBlock(content) !== null;
          const status = typeof u["status"] === "string" ? u["status"] : null;
          const completed = status === "completed" || status === "failed";

          // Emit a ToolResult at most once per call. Triggers:
          //   - Non-diff content arrived (the actual result payload)
          //   - Status flipped to completed/failed (terminal — even if
          //     there's no content, the renderer needs to know the call
          //     finished so spinners stop).
          if (!state.resultEmitted && ((hasContent && !isDiffOnly) || completed)) {
            state.resultEmitted = true;
            const output = extractOutput(u);
            const isError =
              u["isError"] === true ||
              u["is_error"] === true ||
              status === "failed";
            trace(
              provider,
              `emit ToolResult id=${callId} tool=${toolName} status=${status ?? "(none)"} isError=${isError} output=${safePreview(output)}`,
            );
            events.push({
              _tag: "ToolResult",
              itemId: callId,
              output,
              isError,
            });
          } else if (state.resultEmitted) {
            trace(
              provider,
              `skip late tool_call_update id=${callId} (result already emitted)`,
            );
          }

          return events;
        }

        case "tool_result":
        case "tool_output":
        case "function_call_output":
        case "custom_tool_call_output":
        case "tool_search_output": {
          const callId = extractCallId(u);
          const state = getOrInitToolState(callId);
          if (state.resultEmitted) {
            trace(
              provider,
              `skip duplicate ${kind} id=${callId} (result already emitted)`,
            );
            return [];
          }
          state.resultEmitted = true;
          const isError = u["isError"] === true || u["is_error"] === true;
          const output = extractOutput(u);
          trace(
            provider,
            `emit ToolResult(${kind}) id=${callId} isError=${isError} output=${safePreview(output)}`,
          );
          return [
            {
              _tag: "ToolResult",
              itemId: callId,
              output,
              isError,
            },
          ];
        }

        case "error":
        case "agent_error": {
          const detail = extractErrorDetail(u);
          const providerLabel =
            provider === "grok"
              ? "Grok"
              : provider === "cursor"
                ? "Cursor"
                : "Gemini";
          const message =
            detail !== null
              ? detail
              : (() => {
                  const serialized = safeStringify(u);
                  return serialized === "{}"
                    ? `${providerLabel} agent reported an error with no detail.`
                    : `${providerLabel} agent error: ${serialized}`;
                })();
          return [{ _tag: "Error", message }];
        }

        case "available_commands_update":
        case "current_mode_update":
          return [];

        // --- Grok agent swarming (collab agents) support ---
        // The Grok Build ACP emits collabAgentToolCall ThreadItems (via session/update
        // or wrapped in item_started / item_completed notifications) when the main
        // agent uses spawnAgent / sendInput / closeAgent etc. to orchestrate 10+
        // parallel sub-agents. We surface them as first-class ToolUse rows so the
        // swarm activity is visible immediately; richer SwarmRow UI comes later.
        case "collabAgentToolCall":
        case "item_started":
        case "item_completed": {
          // The payload may be the collab item directly or wrapped: { item: ThreadItem, threadId, ... }
          const maybeItem = (u as Record<string, unknown>)["item"];
          const candidate = (maybeItem && typeof maybeItem === "object" ? maybeItem : u) as Record<string, unknown>;
          if (candidate["type"] !== "collabAgentToolCall") {
            // Not a collab item (some other item_started for plan / command etc.) — fall through
            // but still avoid the generic "unknown" trace for item_* wrappers we don't care about.
            if (kind === "item_started" || kind === "item_completed") return [];
            return [];
          }

          const collab = candidate;
          const tool = typeof collab["tool"] === "string" ? (collab["tool"] as string) : "unknown";
          const callId = extractCallId(collab);
          const status = typeof collab["status"] === "string" ? (collab["status"] as string) : null;
          const receiverThreadIds = Array.isArray(collab["receiverThreadIds"])
            ? (collab["receiverThreadIds"] as string[])
            : [];
          const prompt = typeof collab["prompt"] === "string" ? (collab["prompt"] as string) : null;
          const model = typeof collab["model"] === "string" ? (collab["model"] as string) : null;
          const agentsStates = (collab["agentsStates"] ?? {}) as Record<string, unknown>;

          // Nice label for the tool row (SpawnAgent becomes "Spawn Agent", sendInput becomes "Collab Send Input")
          const toolName =
            tool === "spawnAgent"
              ? "SpawnAgent"
              : `Collab${tool.charAt(0).toUpperCase()}${tool.slice(1)}`;

          const input: Record<string, unknown> = {
            tool,
            ...(prompt ? { prompt } : {}),
            ...(model ? { model } : {}),
            receiverThreadIds,
            agentsStates,
          };
          if (status) input["status"] = status;

          const state = getOrInitToolState(callId);
          const isTerminal = status === "completed" || status === "failed";

          // Emit (or re-emit with richer input) on first sight and on terminal transitions
          // so the renderer row can show a final result panel with the ending agentsStates.
          if (!state.useEmitted || isTerminal) {
            state.useEmitted = true;
            state.lastInputJson = JSON.stringify(input);
            trace(
              provider,
              `emit CollabToolUse id=${callId} tool=${toolName} receivers=${receiverThreadIds.length} status=${status ?? ""}`,
            );
            const events: AgentEvent[] = [
              {
                _tag: "ToolUse",
                itemId: callId,
                tool: toolName,
                input,
              },
            ];
            if (isTerminal) {
              // Surface a clean result so the row collapses / shows "done" state.
              events.push({
                _tag: "ToolResult",
                itemId: callId,
                output: { status, agentsStates },
                isError: status === "failed",
              });
              state.resultEmitted = true;
            }
            return events;
          }

          // Intermediate state updates (agentsStates changing while running) — we can
          // optionally emit a non-intrusive result or just trace. For v1 we stay silent
          // to avoid spamming the timeline; the live states live in the initial row's input.
          trace(provider, `skip duplicate collab update id=${callId} tool=${tool}`);
          return [];
        }

        default:
          trace(provider, `unknown kind=${kind} payload=${safePreview(u)}`);
          return [];
      }
    })();

    return flushed.length === 0 ? tail : [...flushed, ...tail];
  };

  return {
    translate: translateOne,
    flush: flushPending,
  };
};

/**
 * Convenience wrapper for callers that don't need stateful coalescing
 * (e.g. unit tests). Equivalent to calling `createAcpTranslator(...).
 * translate(update)` once then flushing — useful when each update is a
 * one-off and you want any buffered text emitted immediately.
 */
export const translateAcpSessionUpdate = (
  update: unknown,
  provider: AcpProviderTag,
): ReadonlyArray<AgentEvent> => {
  const t = createAcpTranslator(provider);
  return [...t.translate(update), ...t.flush()];
};
