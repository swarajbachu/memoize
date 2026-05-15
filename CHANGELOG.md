# Changelog

All notable changes to memoize will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4]

### Added
- Native macOS menu bar with keyboard shortcuts: new chat (⌘N), open project (⌘O), settings (⌘,), toggle sidebars (⌘B / ⌘⌥B), toggle terminal (⌘J), focus composer (⌘L). Bindings are listed in Settings → Keyboard shortcuts (single source of truth in `lib/shortcuts.ts`) and surfaced inline on the relevant button tooltips. (#59)
- In-app update toast. Drives `electron-updater` manually instead of `checkForUpdatesAndNotify`; the bottom-right toast offers Later / Install on quit / Update now, downloads only after the user picks, and auto-installs once the download lands. Lifecycle events flow through a new `window.memoize.updates` bridge and shared `UpdateStatus` in `@memoize/wire`. (#61)
- Cross-provider switching on fresh chats. `ModelPicker` lets you pick a model from the other provider as long as the chat has no user message yet; a new `session.setProvider` RPC mirrors `setWorktree`'s fresh-session gate. The teardown path was split so `setModel` / `setProvider` / `resumeSession` only interrupt the provider event-pump fiber, keeping the renderer's `messages.stream` and `session.streamStatus` subscriptions alive across the swap. (#60)
- Codex app-server slash commands. (#62)
- Nested-tab chat UX. Sidebar rows become "chats" (a new container table); the tab strip in the main pane shows that chat's sessions as peer tabs, "+" adds a session to the active chat, and ⌘W closes the active tab via Electron menu → IPC and archives the session (auto-spawning a fresh one if it was the last). Migration 0011 backfills one chat per existing top-level session and rehomes v3 children. Adds `forked_from_session_id` / `forked_from_message_id` columns for a future fork-from-message feature. (#63)
- Codex session resume. The driver captures the codex thread id from `thread.started` and persists it as the session's resume cursor; `Codex.resumeThread(id, opts)` reattaches on next start. Codex doesn't replay prior items on resume — the renderer's persisted timeline remains the source of truth for what came before. Wire schema gained a `"codex-thread-id"` resume strategy alongside the existing `"claude-session-id"`. (#57)
- Codex image attachments. Image refs (`png`, `jpeg`, `gif`, `webp`) attached to a turn are forwarded to `runStreamed` as `local_image` items pointing at the on-disk blob; non-image refs are dropped with a warn. `AttachmentService` gained a `readPath` method so the driver can hand the SDK a file path instead of re-encoding bytes. (#57)
- Codex plan mode. The chat-header chip flipped the wire but the codex driver was hardcoded to read-only — now `plan` → codex `sandboxMode: "read-only"` and `default` / `acceptEdits` → `workspace-write`. Live toggle is implemented as `codex.resumeThread(currentId, newOptions)` since the SDK has no live sandbox-update API; the rebuild is chained onto the per-thread send queue so a toggle mid-turn doesn't race an in-flight `runStreamed`. (#57)
- Codex CLI upgrade banner. Provider availability probe now reports `cliVersionStatus` ("ok" | "outdated" | "unknown") plus a per-provider upgrade command; an inline banner above the composer prompts the user to upgrade when the installed codex CLI is below the SDK's pinned floor (currently 0.128.0). (#57)

### Changed
- Cleaner alert surfaces across `Alert`, `ErrorBubble`, `ToolErrorRow`, `CliUpgradeBanner`, `FileEditor` conflict banner, `TerminalBlock` / `PreBlock` errors, and `ErrorPill`. New dedicated tokens (`--alert-error-bg`, `--alert-warning-bg`, `--alert-info-bg`, `--alert-success-bg`) replace the loud red/yellow/amber borders + washes with soft warm-tinted card surfaces. (#58)
- Tooltip popups restyled with a frosted-glass look (translucent fill + backdrop blur). (#59)

### Fixed
- Codex CLI 0.130+ rejected `gpt-5-codex` (and bare `gpt-5`) for ChatGPT-account users; sessions died at start with a 400. Picker now uses current codex model names (`gpt-5.4` default, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.3-codex-spark`) and `resolveModelSlug` aliases stale slugs through to `gpt-5.4` at both renderer load and codex driver boundaries, so an in-flight resume can't punch the bad slug through. (#58)
- Codex turn end no longer left the renderer composer stuck in "loading". `turn.completed` / `turn.failed` and the `runTurn` catch now emit `Status: idle`. (#57)
- Codex sessions on older `codex` CLIs failed with "Codex Exec exited with code 2: error: unexpected argument '--experimental-json' found". codex-sdk@0.128 hard-codes that flag; pre-0.128 binaries reject it. The server now probes `codex --version` before starting and the renderer's `CliUpgradeBanner` surfaces a friendly upgrade card; if the user sends anyway, the SDK trace is intercepted and replaced with a single-sentence chat error. (#57)

### Known limitations (Codex SDK 0.128)
- No interactive permission prompts on Codex. The SDK exposes `approvalPolicy` as static config but no JS callback to bridge approvals into memoize's toast, so codex sessions stay on `approvalPolicy: "never"` regardless of mode. Plan-mode (read-only) is the only user-facing lever; default/acceptEdits both run with full workspace-write and no prompts.
- No cross-provider sub-agents on Codex. `input.agents` is still ignored — Codex SDK has no `mcpServers` config, so the cross-provider bridge sketched in `specs/sub-agents/decisions/0012-codex-bridge-via-mcp.md` lands as a follow-up PR.

## [0.1.2]

### Fixed
- Packaged macOS app failed to start Codex sessions with "Unable to locate Codex CLI binaries. Ensure @openai/codex is installed with optional dependencies." Same shape as the 0.1.1 Claude fix: we don't ship the SDK's bundled native CLI, so the SDK now receives `codexPathOverride` pointing at the user's installed `codex` binary (`which codex`, with the same `fix-path`-expanded PATH). Surfaces a clean "Codex CLI not found on PATH" message when the binary genuinely isn't installed.

## [0.1.1]

### Fixed
- Packaged macOS app could not start new Claude sessions ("Native CLI binary for darwin-arm64 not found"). GUI-launched apps inherit a minimal PATH, so `which claude` never found the user's installed Claude Code binary and the SDK fell back to a bundled native CLI we don't ship. The main process now expands PATH from the user's login shell (via `fix-path`) before the runtime boots, and the server fails with a clear "Claude Code CLI not found on PATH" message when the binary genuinely isn't installed.

## [0.1.0]

### Added
- First public macOS build: signed + notarized universal `.dmg` (Apple Silicon + Intel) distributed via GitHub Releases.
- In-app auto-update via `electron-updater` against the GitHub Releases feed.
- Tag-driven CI release workflow (`v*` tags publish a draft release with the `.dmg`, `latest-mac.yml`, and blockmap).

### Changed
- Locked the macOS app to the dark appearance variant so vibrancy no longer follows the user's system theme — fixes the "faded UI on a light-mode Mac" look.
- Rebranded from `forkzero` to `memoize` (app name, custom protocol scheme, package names).
