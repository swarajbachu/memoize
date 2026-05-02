# ADR 0004: Both spawn-CLI and SDK agent integration

**Status**: Accepted

**Date**: 2026-05-02

## Context

We can integrate agents two ways:
- **Spawn-CLI**: launch the user's installed `claude` / `codex` in a PTY. Trivial. UI is whatever the CLI shows.
- **SDK**: use the official client library. Structured events, custom UI, richer UX.

## Decision

Ship both. SDK is the headline experience; spawn-CLI is the always-works fallback.

## Why both

- SDK gives us the differentiated product (live tool-use timeline, permission prompts, resume)
- Spawn-CLI gives us coverage on day 1 — works for anything the user has installed, including agents we haven't written adapters for
- Spawn-CLI is essentially free once Phase 1 PTY is done

## Implementation note

Spawn-CLI is not implemented as an adapter — it's a special PTY launch. SDK adapters all conform to the `AgentAdapter` interface so they can be added without touching UI.
