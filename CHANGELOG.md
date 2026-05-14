# Changelog

All notable changes to memoize will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] — Unreleased

### Fixed
- Packaged macOS app failed to start Codex sessions with "Unable to locate Codex CLI binaries. Ensure @openai/codex is installed with optional dependencies." Same shape as the 0.1.1 Claude fix: we don't ship the SDK's bundled native CLI, so the SDK now receives `codexPathOverride` pointing at the user's installed `codex` binary (`which codex`, with the same `fix-path`-expanded PATH). Surfaces a clean "Codex CLI not found on PATH" message when the binary genuinely isn't installed.

## [0.1.1] — Unreleased

### Fixed
- Packaged macOS app could not start new Claude sessions ("Native CLI binary for darwin-arm64 not found"). GUI-launched apps inherit a minimal PATH, so `which claude` never found the user's installed Claude Code binary and the SDK fell back to a bundled native CLI we don't ship. The main process now expands PATH from the user's login shell (via `fix-path`) before the runtime boots, and the server fails with a clear "Claude Code CLI not found on PATH" message when the binary genuinely isn't installed.

## [0.1.0] — Unreleased

### Added
- First public macOS build: signed + notarized universal `.dmg` (Apple Silicon + Intel) distributed via GitHub Releases.
- In-app auto-update via `electron-updater` against the GitHub Releases feed.
- Tag-driven CI release workflow (`v*` tags publish a draft release with the `.dmg`, `latest-mac.yml`, and blockmap).

### Changed
- Locked the macOS app to the dark appearance variant so vibrancy no longer follows the user's system theme — fixes the "faded UI on a light-mode Mac" look.
- Rebranded from `forkzero` to `memoize` (app name, custom protocol scheme, package names).
