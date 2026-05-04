# 0009 — CodeMirror 6 over Monaco for the in-app editor

Status: Accepted (2026-05-04)

## Context

MVP 0.02 introduces an in-app file editor in the main pane. The choice of
editor library is mostly irreversible — once language packs, themes, and
extension hooks are wired through, swapping out the editor means rebuilding
all of it. We need to pick a library that fits the actual scope of the
work, not the maximum theoretical scope.

The user's stated direction:

- "I don't want to build a full editor … stay minimal, but still support
  some changes."
- Future direction: select a few lines, press `Cmd+K`, type a free-form
  instruction ("change this to use the Tailwind variable"), and have only
  those lines edited — without spinning up a full agent session.
- `Cmd+S` may eventually format the file.

So the bar is: minimal today, extensible at the selection / decoration
layer tomorrow.

## Options

### Option A — Monaco

- The literal VS Code editor as a library (`@monaco-editor/react` wraps
  it for React).
- Pros: maximum fidelity, IntelliSense, command palette, multi-cursor,
  diff editor built-in.
- Cons: ~3 MB+ bundle, web-worker-based language services that conflict
  with Electron renderer CSP unless carefully configured, heavy mental
  model for adding custom commands. Designed for IDE-grade workloads —
  overkill for a chat-first app where the editor is one surface among
  many.

### Option B — CodeMirror 6

- A modular editor split into composable extensions (state, view, history,
  language packs, themes).
- Pros: ~150 KB core + ~10–30 KB per language pack, ESM-native, plays
  well with Vite + Electron without workers, extension model is exactly
  the abstraction the future `Cmd+K`-on-selection feature wants
  (selections + decorations + transactions are first-class).
- Cons: less out-of-the-box than Monaco — no built-in command palette,
  no built-in diff editor, IntelliSense is BYO via LSP (which we are
  not adding).

### Option C — Plain `<textarea>` + Shiki highlighting overlay

- Pros: smallest possible footprint, zero new deps (Shiki already used
  for chat code blocks).
- Cons: no real selection model, no decorations, no extension points.
  The future `Cmd+K`-on-selection feature would have nowhere to land —
  we'd be reaching for CodeMirror anyway in 0.03.

## Decision

**CodeMirror 6.**

It is the only option that's both minimal *now* (sub-200 KB after
language packs) and structured the way the future Cmd+K-on-selection
work needs to work (selection, decorations, and content-changing
transactions are core APIs). Monaco is the right choice for an IDE,
not for forkzero. A `<textarea>` would force a rewrite as soon as we
add the first interesting editor command.

## Consequences

- Add `codemirror`, `@codemirror/state`, `@codemirror/view`,
  `@codemirror/commands`, `@codemirror/language`, plus
  `@codemirror/lang-{javascript,markdown,json,html,css,python,rust,go}`
  to `apps/renderer/package.json`.
- Theme: start with `@codemirror/theme-one-dark` or a 4-line custom
  theme matched to the existing zinc-950 chrome.
- The editor host is split (`lib/codemirror/setup.ts` +
  `lib/codemirror/languages.ts` + `components/file-editor.tsx`) so the
  future inline-AI command extension lives in one new file rather than
  reshaping the React tree.
- We do **not** ship LSP integration or IntelliSense in 0.02. If forkzero
  later wants completions, the path is `@codemirror/autocomplete` plus
  a forkzero-specific completion source (likely backed by the agent),
  not pulling in Monaco.
