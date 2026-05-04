# ADR 0002: Effect.ts from day one

**Status**: Accepted

**Date**: 2026-05-02

## Context

Effect.ts offers typed errors, structured concurrency, dependency injection via Layers, and Schema for runtime validation. It also has a steep learning curve.

## Decision

Adopt Effect from day 1 across both processes (main + renderer).

## Why now and not later

- Retrofitting a plain-TS app to Effect is mostly a rewrite of effectful code paths
- The learning happens regardless; better to amortize over the whole project than spike later
- The app's core complexity — PTY lifecycles, agent streams, IPC — is exactly what Effect is for

## Constraints

- Renderer's Effect runtime stays light (no long fibers; mostly request/response)
- React components do not import Effect directly; they read from Zustand stores fed by Effect
- One `Effect.runFork` per process at boot; no scattered runs

## Cost

Estimates in [roadmap.md](../roadmap.md) include +30% for Effect learning across all phases.
