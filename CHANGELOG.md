# Changelog

All notable changes to memoize will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] — Unreleased

### Fixed
- Codex sessions on older `codex` CLIs failed with "Codex Exec exited with code 2: error: unexpected argument '--experimental-json' found". codex-sdk@0.128 hard-codes that flag; pre-0.128 binaries reject it. We now probe `codex --version` before starting and refuse with a clean "upgrade Codex" message when the installed CLI is below the SDK's minimum (currently 0.128.0).

### Added
- Codex session resume. The driver captures the codex thread id from `thread.started` and persists it as the session's resume cursor; `Codex.resumeThread(id, opts)` reattaches on next start. Codex doesn't replay prior items on resume — the renderer's persisted timeline remains the source of truth for what came before. Wire schema gained a `"codex-thread-id"` resume strategy alongside the existing `"claude-session-id"`.
- Codex image attachments. Image refs (`png`, `jpeg`, `gif`, `webp`) attached to a turn are forwarded to `runStreamed` as `local_image` items pointing at the on-disk blob; non-image refs are dropped with a warn. `AttachmentService` gained a `readPath` method so the driver can hand the SDK a file path instead of re-encoding bytes.
- Codex plan mode. The chat-header chip flipped the wire but the codex driver was hardcoded to read-only — now `plan` → codex `sandboxMode: "read-only"` and `default` / `acceptEdits` → `workspace-write`. Live toggle is implemented as `codex.resumeThread(currentId, newOptions)` since the SDK has no live sandbox-update API; the rebuild is chained onto the per-thread send queue so a toggle mid-turn doesn't race an in-flight `runStreamed`.

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
