# ADR 0003: Bun + Turbo monorepo

**Status**: Accepted

**Date**: 2026-05-02

## Context

We need a package manager and task runner. Already on Bun + Turbo from the scaffold.

## Decision

Keep it.

## Notes

- Bun's install speed is real and matters for CI
- Some Electron native modules need `npm rebuild` semantics — Bun handles this in 1.3+
- Turbo for task graph + cache; no Nx
- If Bun bites us on a native module, fall back to pnpm for that workspace
