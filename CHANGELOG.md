# Changelog

All notable changes to memoize will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — Unreleased

### Added
- First public macOS build: signed + notarized universal `.dmg` (Apple Silicon + Intel) distributed via GitHub Releases.
- In-app auto-update via `electron-updater` against the GitHub Releases feed.
- Tag-driven CI release workflow (`v*` tags publish a draft release with the `.dmg`, `latest-mac.yml`, and blockmap).

### Changed
- Locked the macOS app to the dark appearance variant so vibrancy no longer follows the user's system theme — fixes the "faded UI on a light-mode Mac" look.
- Rebranded from `forkzero` to `memoize` (app name, custom protocol scheme, package names).
