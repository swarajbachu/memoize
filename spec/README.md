# forkzero — specification

forkzero is a terminal-first desktop app for running coding agents. This directory holds the living specification: vision, architecture, phase roadmap, per-feature designs, and the architecture decision record.

## How to read this

Start at the top, descend as needed:

1. **[vision.md](vision.md)** — why forkzero exists and who it's for
2. **[architecture.md](architecture.md)** — the stack and how pieces fit together
3. **[roadmap.md](roadmap.md)** — phase-by-phase plan with effort estimates
4. **[phases/](phases/)** — detailed scope, acceptance criteria, and contracts per phase
5. **[features/](features/)** — deep dives per feature surface
6. **[decisions/](decisions/)** — Architecture Decision Records (ADRs) capturing why we chose X over Y

## How to contribute to the spec

- Spec files are normative. Code that contradicts the spec is a bug — fix one or the other intentionally.
- New features start as a doc in `spec/features/` before code lands.
- Significant changes to architecture get an ADR in `spec/decisions/` (next number, never reuse).
- Phase docs are immutable once a phase ships — write a new phase doc instead of editing history.

## Status legend

- 📐 **Spec** — written but not built
- 🚧 **Building** — in active implementation
- ✅ **Shipped** — in `main`, verified end-to-end
- ⏸️ **Paused** — out of scope for current phase
