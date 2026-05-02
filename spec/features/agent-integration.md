# Feature: Agent integration

Two modes per provider: spawn-CLI (always available if installed) and SDK (structured experience).

## Adapter contract

Every provider implements:

```ts
interface AgentAdapter {
  id: AgentId
  displayName: string
  detectAvailability(): Effect<AgentAvailability, never>
  startSession(input: StartSessionInput): Effect<SessionHandle, AgentError>
}

interface SessionHandle {
  sessionId: string
  events: Stream<AgentEvent, AgentError>
  send(text: string): Effect<void, AgentError>
  interrupt(): Effect<void>
  close(): Effect<void>
}
```

## Event normalization

All adapters emit the same `AgentEvent` union (see [phases/02-agents.md](../phases/02-agents.md)). UI is provider-agnostic.

## Provider notes

### Claude Code (`@anthropic-ai/claude-agent-sdk`)
- Native streaming events, native tool-use events — direct map
- Permission API → our `PermissionRequest` event
- Resume: supported via session id

### OpenAI Codex
- Translate streaming responses into `AssistantMessage`
- Tool use → map to `ToolUse` / `ToolResult`
- Resume: depends on SDK version; treat as best-effort

## Credentials

`keytar` keyed by `"forkzero:<provider>:apiKey"`. Never logged, never written to disk in plaintext.
