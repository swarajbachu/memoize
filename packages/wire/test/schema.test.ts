import { describe, expect, it } from "bun:test";
import { Schema } from "effect";

import { AgentEvent, Chat, Message, Session } from "../src/index.ts";

/**
 * These guard the renderer↔server wire contract: every payload that crosses
 * the RPC boundary is encoded to plain JSON on one side and decoded on the
 * other. A round-trip (decode∘encode) that isn't the identity, or a schema
 * that silently accepts malformed input, is a contract break.
 */

const roundTrip = <A, I>(schema: Schema.Schema<A, I>, encoded: I): void => {
  const decoded = Schema.decodeUnknownSync(schema)(encoded);
  const reEncoded = Schema.encodeSync(schema)(decoded);
  expect(reEncoded).toEqual(encoded);
};

describe("AgentEvent round-trips", () => {
  const cases: ReadonlyArray<{ name: string; encoded: unknown }> = [
    {
      name: "Started",
      encoded: { _tag: "Started", sessionId: "s1", providerId: "claude", mode: "sdk" },
    },
    {
      name: "Status",
      encoded: { _tag: "Status", status: "running" },
    },
    {
      name: "AssistantMessage",
      encoded: { _tag: "AssistantMessage", itemId: "i1", text: "hello" },
    },
    {
      name: "Thinking",
      encoded: { _tag: "Thinking", itemId: "i2", text: "hmm", redacted: false },
    },
    {
      name: "ToolUse (unknown input survives)",
      encoded: {
        _tag: "ToolUse",
        itemId: "i3",
        tool: "Edit",
        input: { file_path: "/a.ts", old_string: "x", new_string: "y" },
      },
    },
    {
      name: "ToolResult",
      encoded: { _tag: "ToolResult", itemId: "i4", output: "done", isError: false },
    },
    {
      name: "Error",
      encoded: { _tag: "Error", message: "boom" },
    },
    {
      name: "UsageDelta",
      encoded: {
        _tag: "UsageDelta",
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        model: "claude-opus-4-8",
      },
    },
    {
      name: "Completed",
      encoded: { _tag: "Completed", reason: "ended" },
    },
  ];

  for (const c of cases) {
    it(`round-trips ${c.name}`, () => {
      roundTrip(AgentEvent, c.encoded as never);
    });
  }

  it("rejects an event with no _tag", () => {
    expect(() => Schema.decodeUnknownSync(AgentEvent)({ text: "no tag" })).toThrow();
  });

  it("rejects an unknown _tag", () => {
    expect(() =>
      Schema.decodeUnknownSync(AgentEvent)({ _tag: "Nonsense" }),
    ).toThrow();
  });

  it("rejects a known event missing a required field", () => {
    expect(() =>
      Schema.decodeUnknownSync(AgentEvent)({ _tag: "ToolResult", itemId: "i", output: "o" }),
    ).toThrow(); // isError missing
  });

  it("rejects an invalid enum literal", () => {
    expect(() =>
      Schema.decodeUnknownSync(AgentEvent)({ _tag: "Status", status: "spinning" }),
    ).toThrow();
  });
});

describe("Session round-trip", () => {
  const encoded = {
    id: "sess1",
    projectId: "proj1",
    title: "My session",
    providerId: "claude",
    model: "claude-opus-4-8",
    status: "idle" as const,
    archivedAt: null,
    cursor: null,
    resumeStrategy: "none" as const,
    runtimeMode: "approval-required" as const,
    worktreeId: null,
    chatId: "chat1",
    forkedFromSessionId: null,
    forkedFromMessageId: null,
    permissionMode: "default" as const,
    toolSearch: false,
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
  };

  it("decodes dates and re-encodes them as ISO strings", () => {
    const session = Schema.decodeUnknownSync(Session)(encoded);
    expect(session.createdAt).toBeInstanceOf(Date);
    expect(Schema.encodeSync(Session)(session)).toEqual(encoded);
  });

  it("round-trips an archived session", () => {
    roundTrip(Session, {
      ...encoded,
      archivedAt: "2026-06-17T12:00:00.000Z",
      cursor: "claude-session-abc",
      resumeStrategy: "claude-session-id" as const,
    });
  });

  it("rejects an unknown status literal", () => {
    expect(() =>
      Schema.decodeUnknownSync(Session)({ ...encoded, status: "zombie" }),
    ).toThrow();
  });
});

describe("Message round-trip", () => {
  const base = {
    id: "msg1",
    sessionId: "sess1",
    createdAt: "2026-06-17T00:00:00.000Z",
  };

  it("round-trips a user message", () => {
    roundTrip(Message, {
      ...base,
      role: "user" as const,
      content: { _tag: "user", text: "hi" },
    });
  });

  it("round-trips a tool_use message with unknown input", () => {
    roundTrip(Message, {
      ...base,
      role: "assistant" as const,
      content: {
        _tag: "tool_use",
        itemId: "i1",
        tool: "Bash",
        input: { command: "ls" },
      },
    });
  });

  it("rejects an unknown content _tag", () => {
    expect(() =>
      Schema.decodeUnknownSync(Message)({
        ...base,
        role: "user",
        content: { _tag: "telepathy", text: "hi" },
      }),
    ).toThrow();
  });
});

describe("Chat round-trip", () => {
  it("round-trips a chat row", () => {
    roundTrip(Chat, {
      id: "chat1",
      projectId: "proj1",
      worktreeId: null,
      title: "Chat",
      activeSessionId: "sess1",
      archivedAt: null,
      createdAt: "2026-06-17T00:00:00.000Z",
      updatedAt: "2026-06-17T00:00:00.000Z",
    });
  });
});
