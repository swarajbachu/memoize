# Vision

## What forkzero is

A desktop app where coding agents are first-class citizens. The terminal is the main canvas. You add folders to a sidebar, open one, and either type into the terminal yourself or hand the keyboard to an agent. Git history of the open project is always visible alongside.

## What forkzero is not

- Not a full IDE. We do not own the editor surface — open files in your editor of choice.
- Not a chat app. Conversations happen inside terminals or agent panels, not in a separate "chat" UI.
- Not cloud. Everything runs on the user's machine; agent credentials stay local.
- Not multi-user / collaborative. Single-user desktop tool.

## Target user

A developer who:
- Already uses Claude Code / Codex CLI from a terminal
- Wants to run agents in parallel across multiple repos without juggling tmux panes
- Wants to see what the agent did (git diff, log) without leaving the app
- Is comfortable with the command line — we optimize for keyboard, not mouse

## Principles

1. **Terminal first.** Every feature must coexist with "I just want to type into a shell." Don't hide the prompt behind UI.
2. **Local by default.** No telemetry without an explicit opt-in. No cloud features in v1.
3. **Open formats.** Sessions, history, and config stored as files a user can read and back up.
4. **One way to do each thing.** Resist configuration sprawl; pick a default, document the why.
5. **Boring tech where possible.** Effect.ts is the one ambitious choice — everything else is the obvious option.

## Non-goals (v1)

- Plugin/extension system
- Multiple windows or detachable panes
- Remote / SSH workspaces
- Built-in code editor
- Cloud sync of sessions
