# ADR 0001: Electron over Tauri

**Status**: Accepted

**Date**: 2026-05-02

## Context

We need a desktop shell. The two reasonable choices in 2026 are Electron and Tauri.

## Decision

Use Electron.

## Consequences

**Pro**
- Already scaffolded; switching now wastes work
- Native node-pty and keytar bindings are well-trodden
- Easier to ship to Windows/Linux without a Rust toolchain

**Con**
- Larger install size (~150MB vs ~10MB)
- Higher idle memory

We accept these costs in v1. Revisit at 2.0 if install size becomes a complaint.
