import { describe, expect, it } from "bun:test";

import type { AgentEvent } from "@memoize/wire";

import {
  createAcpTranslator,
  translateAcpSessionUpdate,
} from "../src/provider/drivers/acp/translate.ts";

// Narrowing helpers — the translator returns the AgentEvent union; tests below
// assert on concrete variants, so pull the tag out and cast for convenience.
const tags = (events: ReadonlyArray<AgentEvent>): string[] =>
  events.map((e) => e._tag);

const only = <T extends AgentEvent["_tag"]>(
  events: ReadonlyArray<AgentEvent>,
  tag: T,
): Extract<AgentEvent, { _tag: T }> => {
  expect(tags(events)).toEqual([tag]);
  return events[0] as Extract<AgentEvent, { _tag: T }>;
};

describe("translateAcpSessionUpdate — tool-call normalization", () => {
  it("maps Grok read_file → canonical Read with file_path", () => {
    const ev = only(
      translateAcpSessionUpdate(
        {
          sessionUpdate: "tool_call",
          kind: "read_file",
          toolCallId: "tc1",
          locations: [{ path: "/repo/a.ts" }],
        },
        "grok",
      ),
      "ToolUse",
    );
    expect(ev).toEqual({
      _tag: "ToolUse",
      itemId: "tc1",
      tool: "Read",
      input: { file_path: "/repo/a.ts" },
    });
  });

  it("recovers a Grok SearchReplace envelope into a canonical Edit", () => {
    const ev = only(
      translateAcpSessionUpdate(
        {
          sessionUpdate: "tool_call",
          kind: "search_replace",
          toolCallId: "tc2",
          content: [
            {
              type: "SearchReplace",
              EditsApplied: {
                absolute_path: "/repo/a.ts",
                old_string: "foo",
                new_string: "bar",
              },
            },
          ],
        },
        "grok",
      ),
      "ToolUse",
    );
    expect(ev.tool).toBe("Edit");
    expect(ev.input).toEqual({
      file_path: "/repo/a.ts",
      old_string: "foo",
      new_string: "bar",
    });
  });

  it("maps a Gemini diff block → canonical Edit", () => {
    const ev = only(
      translateAcpSessionUpdate(
        {
          sessionUpdate: "tool_call",
          kind: "edit",
          toolCallId: "tc3",
          content: [
            { type: "diff", path: "/repo/b.ts", oldText: "a", newText: "b" },
          ],
        },
        "gemini",
      ),
      "ToolUse",
    );
    expect(ev.tool).toBe("Edit");
    expect(ev.input).toEqual({
      file_path: "/repo/b.ts",
      old_string: "a",
      new_string: "b",
    });
  });

  it("maps a Bash command and folds title into description", () => {
    const ev = only(
      translateAcpSessionUpdate(
        {
          sessionUpdate: "tool_call",
          kind: "bash",
          toolCallId: "tc4",
          command: "ls -la",
          title: "List files",
        },
        "grok",
      ),
      "ToolUse",
    );
    expect(ev.tool).toBe("Bash");
    expect(ev.input).toEqual({ command: "ls -la", description: "List files" });
  });

  it("normalizes unknown tool kinds into a Title Case label", () => {
    const ev = only(
      translateAcpSessionUpdate(
        { sessionUpdate: "tool_call", kind: "list_dir", toolCallId: "tc5" },
        "grok",
      ),
      "ToolUse",
    );
    expect(ev.tool).toBe("ListDir");
  });

  it("uses the call id from any of the accepted id fields", () => {
    const ev = only(
      translateAcpSessionUpdate(
        { sessionUpdate: "tool_call", kind: "read", call_id: "snake_id" },
        "grok",
      ),
      "ToolUse",
    );
    expect(ev.itemId).toBe("snake_id");
  });
});

describe("translateAcpSessionUpdate — result normalization", () => {
  it("decodes Grok byte-array stdout into UTF-8 text", () => {
    const ev = only(
      translateAcpSessionUpdate(
        {
          sessionUpdate: "tool_result",
          toolCallId: "g1",
          output: { stdout: [72, 105], stderr: [] }, // "Hi"
        },
        "grok",
      ),
      "ToolResult",
    );
    expect(ev.output).toBe("Hi");
    expect(ev.isError).toBe(false);
  });

  it("strips Grok N→ line markers from FileContent results", () => {
    const ev = only(
      translateAcpSessionUpdate(
        {
          sessionUpdate: "tool_result",
          toolCallId: "r1",
          output: { type: "ReadFile", FileContent: { content: "1→hello\n2→world" } },
        },
        "grok",
      ),
      "ToolResult",
    );
    expect(ev.output).toBe("hello\nworld");
  });

  it("flattens nested MCP content blocks to a plain string", () => {
    const ev = only(
      translateAcpSessionUpdate(
        {
          sessionUpdate: "tool_result",
          toolCallId: "m1",
          content: [{ type: "content", content: { type: "text", text: "body" } }],
        },
        "grok",
      ),
      "ToolResult",
    );
    expect(ev.output).toBe("body");
  });

  it("maps is_error / failed status onto isError", () => {
    const ev = only(
      translateAcpSessionUpdate(
        {
          sessionUpdate: "tool_result",
          toolCallId: "e1",
          is_error: true,
          output: "boom",
        },
        "grok",
      ),
      "ToolResult",
    );
    expect(ev.isError).toBe(true);
    expect(ev.output).toBe("boom");
  });
});

describe("createAcpTranslator — assistant + thinking coalescing", () => {
  it("buffers agent_message_chunk deltas and flushes one AssistantMessage", () => {
    const t = createAcpTranslator("grok");
    expect(t.translate({ sessionUpdate: "agent_message_chunk", content: "Hello " })).toEqual(
      [],
    );
    expect(t.translate({ sessionUpdate: "agent_message_chunk", content: "world" })).toEqual(
      [],
    );
    const flushed = only(t.flush(), "AssistantMessage");
    expect(flushed.text).toBe("Hello world");
  });

  it("flushes buffered text before the next non-text event, preserving order", () => {
    const t = createAcpTranslator("grok");
    t.translate({ sessionUpdate: "agent_message_chunk", content: "intro" });
    const out = t.translate({
      sessionUpdate: "tool_call",
      kind: "read",
      toolCallId: "x1",
      locations: [{ path: "/a.ts" }],
    });
    expect(tags(out)).toEqual(["AssistantMessage", "ToolUse"]);
    expect((out[0] as Extract<AgentEvent, { _tag: "AssistantMessage" }>).text).toBe(
      "intro",
    );
  });

  it("coalesces thinking chunks into one Thinking event", () => {
    const t = createAcpTranslator("gemini");
    expect(t.translate({ sessionUpdate: "agent_thought_chunk", content: "think " })).toEqual(
      [],
    );
    expect(t.translate({ sessionUpdate: "agent_thought_chunk", content: "more" })).toEqual(
      [],
    );
    const ev = only(t.flush(), "Thinking");
    expect(ev.text).toBe("think more");
    expect(ev.redacted).toBe(false);
  });

  it("strips Grok's echoed-prompt prefix from the first thinking chunk", () => {
    const t = createAcpTranslator("grok");
    t.translate({
      sessionUpdate: "agent_thought_chunk",
      content: 'The user says: "do X" Now I need to plan the real approach here',
    });
    const ev = only(t.flush(), "Thinking");
    expect(ev.text).not.toContain("The user says");
    expect(ev.text).toContain("Now I need to plan");
  });
});

describe("createAcpTranslator — tool_call_update dedup & re-emit", () => {
  it("skips a tool_call_update whose input is unchanged", () => {
    const t = createAcpTranslator("cursor");
    const first = t.translate({
      sessionUpdate: "tool_call",
      kind: "read",
      toolCallId: "d1",
      locations: [{ path: "/a.ts" }],
    });
    expect(tags(first)).toEqual(["ToolUse"]);
    // Same locations, no content, no terminal status → nothing new to emit.
    const second = t.translate({
      sessionUpdate: "tool_call_update",
      toolCallId: "d1",
      locations: [{ path: "/a.ts" }],
    });
    expect(second).toEqual([]);
  });

  it("re-emits ToolUse when a diff first appears on an Edit update", () => {
    const t = createAcpTranslator("cursor");
    t.translate({
      sessionUpdate: "tool_call",
      kind: "edit",
      toolCallId: "e1",
      locations: [{ path: "/c.ts" }],
    });
    const update = t.translate({
      sessionUpdate: "tool_call_update",
      toolCallId: "e1",
      content: [{ type: "diff", path: "/c.ts", oldText: "x", newText: "y" }],
    });
    const ev = only(update, "ToolUse");
    expect(ev.tool).toBe("Edit");
    expect(ev.input).toEqual({
      file_path: "/c.ts",
      old_string: "x",
      new_string: "y",
    });
  });

  it("remembers the tool name across update frames that omit kind (Cursor)", () => {
    const t = createAcpTranslator("cursor");
    t.translate({
      sessionUpdate: "tool_call",
      kind: "read",
      toolCallId: "c1",
      rawInput: { path: "/repo/x.ts" },
    });
    const result = t.translate({
      sessionUpdate: "tool_call_update",
      toolCallId: "c1",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "file body" } }],
    });
    const ev = only(result, "ToolResult");
    expect(ev.output).toBe("file body");
    expect(ev.isError).toBe(false);
  });

  it("emits ToolResult once when status flips to completed even without content", () => {
    const t = createAcpTranslator("grok");
    t.translate({
      sessionUpdate: "tool_call",
      kind: "bash",
      toolCallId: "b1",
      command: "true",
    });
    const done = t.translate({
      sessionUpdate: "tool_call_update",
      toolCallId: "b1",
      status: "completed",
    });
    expect(tags(done)).toEqual(["ToolResult"]);
    // A late duplicate terminal update must not stack a second result row.
    const late = t.translate({
      sessionUpdate: "tool_call_update",
      toolCallId: "b1",
      status: "completed",
    });
    expect(late).toEqual([]);
  });
});

describe("createAcpTranslator — per-provider quirks & errors", () => {
  it("skips Gemini's internal `think` tool call (surfaced via thinking chunks)", () => {
    expect(
      translateAcpSessionUpdate(
        { sessionUpdate: "tool_call", kind: "think", toolCallId: "t1" },
        "gemini",
      ),
    ).toEqual([]);
  });

  it("ignores transient Grok auth-noise error frames", () => {
    expect(
      translateAcpSessionUpdate(
        { sessionUpdate: "error", message: "Auth(AuthorizationRequired)" },
        "grok",
      ),
    ).toEqual([]);
  });

  it("surfaces a real error frame as an Error event", () => {
    const ev = only(
      translateAcpSessionUpdate(
        { sessionUpdate: "error", message: "disk full" },
        "gemini",
      ),
      "Error",
    );
    expect(ev.message).toBe("disk full");
  });

  it("returns no events for unknown / ignored update kinds", () => {
    expect(
      translateAcpSessionUpdate({ sessionUpdate: "current_mode_update" }, "cursor"),
    ).toEqual([]);
    expect(translateAcpSessionUpdate(null, "grok")).toEqual([]);
    expect(translateAcpSessionUpdate({ noKindHere: true }, "grok")).toEqual([]);
  });
});
