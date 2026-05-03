# Roadmap

Estimates assume a single developer, ~6 productive hours/day, with a capable LLM pair-programmer. **Add 30% to anything Effect-touching while learning** — these estimates already include that headroom.

## Phase 1 — Foundation (≈4 weeks)

Make the scaffold real. By the end you can pick a folder, run a real shell in it, and watch the git history update as you commit.

- Folder sidebar with `+` button and persistence
- Real PTY terminal per folder (one terminal per folder in this phase)
- Real `git log` + status pane
- Effect runtime + Layer architecture in both processes
- Typed IPC contracts in `packages/wire`

→ See [phases/01-foundation.md](phases/01-foundation.md)

## Phase 2 — Agents (≈4 weeks)

The headline. Run Claude Code / Codex as either a spawned CLI in the terminal (cheap fallback) or via SDK with a structured side panel showing tool calls and proposed edits.

- Detect installed `claude` / `codex` CLIs; one-click "run in this folder"
- Claude Code SDK adapter with streaming events
- Codex SDK adapter
- Tool-call timeline UI alongside the terminal
- Agent provider switcher per session

→ See [phases/02-agents.md](phases/02-agents.md)

## Phase 3 — Permissions & sessions (≈2 weeks)

Make agents trustworthy enough to leave running.

- Permission prompts: file write, command run, network access
- Per-session "always allow X" memory
- Session persistence + resume across app restart
- Agent run transcripts (NDJSON) for replay/audit

→ See [phases/03-permissions-and-sessions.md](phases/03-permissions-and-sessions.md)

## Phase 4 — Polish & distribution (≈3 weeks)

Make it shippable.

- Multiple terminals per folder (tabs)
- Git diff viewer (per commit, vs working tree)
- Branch indicator + switcher
- Themes + keybindings
- Auto-update via electron-updater
- macOS signing & notarization (Linux + Windows packaging follow)

→ See [phases/04-polish-and-distribution.md](phases/04-polish-and-distribution.md)

## Total

| Milestone | Calendar |
|---|---|
| Personal-use MVP (Phase 1) | ~4 weeks |
| Public alpha (Phases 1–2) | ~8 weeks |
| Public beta (Phases 1–3) | ~10 weeks |
| 1.0 (Phases 1–4) | **~3–4 months** |

## Beyond 1.0 (post-roadmap, designed for from day one)

The architecture (`apps/server` as a code-only app today, designed for extraction; transport-agnostic renderer) supports these without re-architecture. Each becomes a focused PR rather than a redesign.

| Milestone | What changes | Estimate |
|---|---|---|
| **Remote desktop access** | `apps/server/src/bin.ts` becomes a real WS server boot; Electron spawns it as a subprocess; renderer's transport seam picks WS when running outside Electron. SSH + port-forward enables remote use. | ~1 week |
| **CLI client** | New `apps/cli/` consuming `@forkzero/wire` over the WS transport. | ~1 week |
| **Multi-window / multi-renderer** | Multiple Electron renderers (or browser tabs) connected to one backend. Backend already supports it; just wire window management. | ~3 days |
| **Mobile client** | Native or web-based mobile app speaking WS to a desktop's server over LAN/tunnel. Re-uses `apps/renderer` as a packaging target where feasible. | TBD |

See [ADR 0007](decisions/0007-server-as-code-only-app.md) for the architectural rules that keep these costs bounded.
