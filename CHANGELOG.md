# Changelog

All notable changes to memoize will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1]

### Added
- "Check for Updates…" menu item that reflects all 7 `electron-updater` states (idle / checking / available / downloading / ready / error / not-available), giving users a way back into the update flow after dismissing the toast. Sits in the macOS app menu and the top of Help on Windows/Linux. About panel gets version + copyright; Help menu gains "View Changelog" and "Report an Issue"; DevTools / Force Reload move into a `Developer ▸` submenu that only appears in dev builds. (#84)
- One-click Cursor sign-in. New `agent.startLogin` streaming RPC spawns `cursor-agent login`, extracts the OAuth URL, and emits `LoginEvent`s; the renderer card replaces the old copy-and-run flow with a button that opens the URL via `shell.openExternal`, shows progress, and refreshes availability on success. (#83)

### Fixed
- Auto-update downloads that stalled mid-way were silent — `electron-updater` fires no "stuck" event. Added a 60s download-stall watchdog with one-shot auto-retry that then surfaces a retryable `error` state; the update banner now renders the `error` state with a "Try again" button and un-dismisses itself when status flips to error. (#84)
- Cursor authentication detection was trusting the existence of `~/.local/share/cursor-agent/` as proof of login, but that directory is created on install and just holds the CLI bundle — so every fresh install was flagged as signed in. Now probes `cursor-agent status` and parses the output. The blanket "Requires Cursor Pro" badge was dropped since the CLI has no whoami; the ACP server enforces the real plan check at session start. ACP auth waterfall in the cursor driver now throws a clear "not signed in" error instead of silently retrying `cursor_login` and timing out. (#83)
- Folder picker hid every dotfile directory (`~/.claude`, `~/.config`, `~/.ssh`, …) on macOS because the Electron open dialog was missing `showHiddenFiles`, making any folder under a hidden parent unreachable. The picker also now defaults to the user's home directory instead of the process cwd, so it opens somewhere useful on first launch. (#82)
- Broken `github.com/forkzero/memoize` repository URL in the native menu. (#84)

## [0.2.0]

### Added
- xAI Grok provider via the Agent Client Protocol (ACP). Picker exposes Grok models alongside Claude/Codex; sessions stream through the shared ACP transport with the same permission/tool plumbing as the other ACP providers. (#64)
- Gemini CLI provider. Adds Google's `gemini` CLI as a first-class driver; ACP v2 response types and tool-call normalization land in the same pass so tool results render correctly in the timeline. (#67)
- Cursor Agent provider via ACP. (#69)
- opencode provider with dynamic model inventory + variants. Models are fetched at runtime from the opencode catalog instead of being hardcoded, and the picker surfaces per-model variants. (#75)
- Canonical tool translator for opencode. Provider-specific tool shapes are mapped to memoize's canonical schema, `ToolUse` events are deduplicated, and stale user-echo messages are dropped from the stream so the timeline matches what other providers produce. (#77)
- User-editable keybindings backed by an on-disk config store. Settings → Keyboard shortcuts now writes through to a JSON config file; rebinds persist across launches and survive app upgrades. (#71)
- Unified ACP translator + per-model capabilities + reliable interrupt. All ACP-based providers (Grok, Gemini, Cursor, opencode) share a single translator that normalizes streamed events into canonical timeline items; per-model capability metadata gates features like images/tools at the picker; interrupt now reliably halts in-flight ACP turns instead of leaving zombie streams. (#72)
- Rich model picker: search, recents, provider chips, collapsible accordion sections, and stable `Cmd+1`–`Cmd+9` shortcuts that always map to the same top-pinned slots regardless of filter state. (#80)
- Loading affordances during chat create + per-tab streaming. Creating a new chat now shows immediate feedback while the session boots, and streaming state is tracked per-tab so background tabs keep streaming while the foreground tab is interactive. (#66)

### Changed
- Settings redesigned with a minimal frame and a lime accent. Rows are tighter, section headers are quieter, and the new primary color flows through buttons, focus rings, and toggle states. (#73)
- Top bar gains glass workflow buttons and inline "Fix" actions when CI is failing — the buttons read the latest run status and offer a one-click flow to push a fix branch. (#74)
- README rewritten end-to-end as a full memoize project overview (what it is, providers, install, contributing). (#76)
- UI polish pass: empty-state model picker matches the populated state, and Read/Edit tool result visuals now render diffs and file context in line with the rest of the timeline. (#79)
- Provider diffs cleaned up in the renderer so per-provider streams normalize into the shared timeline without provider-specific branches in UI code. (#68)

### Fixed
- Sessions with NULL `chat_id` rows (left over from the 0.1.4 chats migration on some installs) are healed on startup and the column is now `NOT NULL` at the schema level, so the nested-tab UX can't fall back into a broken state. (#70)

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
