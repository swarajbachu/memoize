# Sub-agents — cost-saving delegation

MVP 0.01 ([../0.01-MVP/](../0.01-MVP/)) shipped a chat-first desktop app with
one model per session. MVP 0.02 ([../0.02-MVP/](../0.02-MVP/)) added a file
viewer and minimal editor on the side. This spec is a **feature PR**, not a
new MVP cut: it teaches the existing chat surface to delegate scoped sub-tasks
from the main agent to *cheaper* sub-agents — Opus 4.7 hands "find every API
endpoint" to Haiku 4.5, gets the summary back, and only the summary lands in
the main conversation.

The primitive is already in Anthropic's Agent SDK
([`agents` parameter](https://code.claude.com/docs/en/agent-sdk/subagents) +
the built-in `Agent` tool). The work here is wiring it through forkzero's
Effect provider stack and surfacing the nested calls in the chat UI.

## What lands in this PR

- **Sub-agent invocation through the Claude provider.** Pass an `agents` map
  into `StartSessionInput`; driver forwards it into the SDK. The main agent
  decides when to delegate based on each sub-agent's `description`.
- **Three seed sub-agents** shipped as defaults (toggleable in settings):
  - `research` — Haiku 4.5, read-only tools.
  - `file-edits` — Sonnet 4.6, file write tools.
  - `test-runner` — Haiku 4.5, Bash + read.
  - See [features/preset-library.md](features/preset-library.md).
- **Wrapper-row UI**: the parent's `Agent` tool call renders as a
  collapsible row that mirrors the existing tool-row design. Inside, every
  nested tool call uses the *same* `tool-row.tsx` component — no new card
  style, just one indent level. A `Prompt` sub-row sits at the top showing
  the task the parent passed; the sub-agent's closing text renders just
  before the wrapper closes.
- **Per-agent token accounting.** The SDK's `result.usage` is captured per
  agent and surfaced in a small footer (`Opus: 4.2k · Haiku (research):
  18k · saved ~$0.34`).
- **Resume parity.** Sub-agent transcripts persist into the session with
  `parent_item_id`, so closing/reopening the app still renders nested.
- **Permission interplay.** Sub-agent tool calls flow through the same
  `canUseTool` callback. The toast prepends `via research-assistant ·
  Haiku 4.5 ·` so the user sees who's asking. Sensitive-path checks
  (`.env`, `.ssh/`, `*.pem`) fire regardless of nesting.

## What's deliberately deferred

- **Cross-provider sub-agents** — Claude main → Codex sub (and vice versa).
  The SDK's `agents` parameter only spawns Claude sub-agents. Cross-provider
  needs a forkzero-internal MCP bridge tool. Sketched in
  [features/cross-provider.md](features/cross-provider.md), implemented in
  a follow-up PR.
- **User-defined sub-agents in settings UI.** This PR ships preset toggles
  + per-preset edits. Creating brand-new sub-agents from scratch in the UI
  comes after we see how the presets get used.
- **Filesystem-based agents** (`.claude/agents/*.md`). Claude Code parity
  is nice but not critical for forkzero's chat-first surface.
- **Multi-level nesting.** The SDK explicitly forbids sub-agents spawning
  their own sub-agents. Renderer assumes `depth ≤ 1`.
- **Background sub-agents** (SDK `background: true`). Useful for
  long-running research that the parent shouldn't block on, but the
  current chat UI assumes a single linear stream. Revisit after the basic
  case ships.

## Where to read

- [features/sub-agents.md](features/sub-agents.md) — feature deep dive
  (wire schema deltas, driver changes, persistence, UI wrapper, permissions,
  cost accounting)
- [features/preset-library.md](features/preset-library.md) — the three
  seed sub-agents
- [features/cross-provider.md](features/cross-provider.md) — Phase 2
  sketch for Claude ↔ Codex bridging
- [decisions/0010-sdk-native-agents-param.md](decisions/0010-sdk-native-agents-param.md)
  — why we lean on the SDK primitive instead of routing manually
- [decisions/0011-haiku-as-default-research.md](decisions/0011-haiku-as-default-research.md)
  — why Haiku 4.5 is the default research model
- [decisions/0012-codex-bridge-via-mcp.md](decisions/0012-codex-bridge-via-mcp.md)
  — how the cross-provider bridge will be shaped when we get there

## Status

📐 **Spec** — scoped, awaiting implementation.
