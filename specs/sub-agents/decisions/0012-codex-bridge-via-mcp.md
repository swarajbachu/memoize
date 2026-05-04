# 0012 — Cross-provider sub-agents go through a custom MCP bridge tool

Status: Accepted (2026-05-04)

## Context

Phase 1 of the sub-agents feature ([../features/sub-agents.md](../features/sub-agents.md))
uses Anthropic's Agent SDK `agents` parameter, which only spawns Claude
sub-agents. Phase 2 ([../features/cross-provider.md](../features/cross-provider.md))
needs the *cross-provider* case: a Claude main agent delegating to a
Codex (GPT-5) sub-agent and vice versa.

The two SDKs (`@anthropic-ai/claude-agent-sdk` and the OpenAI / Codex
Responses SDK) don't know about each other. There's no `model: "gpt-5"`
shortcut in a Claude `AgentDefinition`. Whatever we build has to live
between the two SDKs.

## Options

### Option 1 — Fork or wrap the Claude SDK to accept Codex sub-agents

Patch the SDK so an `AgentDefinition` with a Codex model id routes to
our Codex driver internally.

**Pros**

- Same `agents` API users already know.
- No new tool-call layer.

**Cons**

- We'd be maintaining a fork of `@anthropic-ai/claude-agent-sdk` for
  every release.
- The SDK's internals (how it builds tool_use blocks, correlates ids,
  manages context windows) aren't a stable contract — they change
  between versions.
- Doesn't help the reverse direction (Codex main → Claude sub).

### Option 2 — Custom MCP tool that wraps the cross-provider call

Both Claude and Codex SDKs accept MCP servers via standard config. We
register an in-process MCP server (no socket — `@modelcontextprotocol/sdk`
supports in-memory transports) that exposes:

- `forkzero.delegate-codex(agent_name, prompt, model?)` → invoked by
  Claude main sessions.
- `forkzero.delegate-claude(agent_name, prompt, model?)` → invoked by
  Codex main sessions.

The bridge tool's implementation:

1. Looks up the named cross-provider preset.
2. Spins up a sub-session via the *other* provider's existing driver.
3. Streams events back into the parent's event stream, retagging them
   with the parent's `Agent` tool_use id as `parentItemId`.
4. Returns the sub-agent's final text as the MCP tool's `text` content.

**Pros**

- Both SDKs already speak MCP. Zero forking.
- Each provider's driver stays unchanged — the bridge is a separate
  module.
- Works in both directions (Claude → Codex and Codex → Claude) with
  the same code shape.
- Phase 1's wire schema (`parentItemId`, `SubagentSummary`,
  `UsageDelta`) is enough — bridge events look like any other
  sub-agent's events to the renderer.
- The MCP tool is the right abstraction philosophically: we're saying
  "this tool spawns and consults a different agent." MCP exists for
  exactly this kind of "tool that wraps an external capability."

**Cons**

- Slightly more work than a same-provider sub-agent, since we run our
  own MCP server.
- The MCP roundtrip adds a small latency (~10ms in-process).
- Permission semantics need careful thought: which provider's
  `canUseTool` decides for the sub-agent's tool calls? (Answer: the
  target provider's. See the cross-provider feature doc.)

### Option 3 — Hand-roll a router in the wire layer

Same shape as ADR 0010 Option 2: forkzero-side intent classifier picks
a provider, makes a separate `query()` call, splices the result back.

Already rejected for same-provider in ADR 0010. The reasoning is
*stronger* for cross-provider: now we'd be re-implementing context
isolation, tool-call correlation, *and* cross-SDK message format
translation. No.

## Decision

**Custom MCP bridge tool (Option 2).**

Both SDKs natively support MCP. The bridge stays small (one module,
`apps/server/src/provider/mcp/forkzero-bridge.ts`) and forkzero stays
out of the SDKs' guts. The same code path works in both directions.

## Consequences

- New module: `apps/server/src/provider/mcp/forkzero-bridge.ts`
  exposes the in-memory MCP server. Registered with whichever
  provider's driver is the *main* agent for a session.
- Cross-provider preset entries in `apps/renderer/src/lib/subagent-presets.ts`
  (e.g. `codex-research`, `claude-summarize`).
- Wire schema gains one new event: `CrossProviderInvocation` so the
  renderer can show the wrapper-row badge as `Agent → Codex (gpt-5-mini)`.
  All other Phase 1 events (`parentItemId`, `SubagentSummary`,
  `UsageDelta`) are reused as-is.
- The Codex driver gains the same `SENSITIVE_PATTERNS` regex as the
  Claude driver — sensitive-path checks must fire on both sides of
  the bridge.
- Settings page (Phase 1 ships the same-provider section) gains a
  separate **"Cross-provider"** section in Phase 2.
- We accept that the bridge's permission decisions for sub-agent tool
  calls flow through the *target* provider's policy (the Codex driver
  decides for Codex sub-agent tool calls). Provider-specific
  semantics — `Bash` vs `shell`, etc. — make this the right cut.
- Implementation does **not** ship in the Phase 1 PR. The Phase 1 wire
  schema is designed so Phase 2 is purely additive.
