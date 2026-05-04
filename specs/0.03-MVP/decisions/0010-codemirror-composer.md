# 0010 — CodeMirror 6 for the chat composer (with atomic widget chips)

Status: Accepted (2026-05-04)

## Context

MVP 0.03 introduces inline atomic chips inside the chat composer:
file mentions, directory mentions, image attachments, and skill
invocations all render as `[icon | label]` blocks that the cursor
treats as one position and that backspace removes whole.

A plain `<textarea>` cannot render inline non-editable atoms — text
inside a textarea is a flat character stream with no DOM hooks for
widgets. To deliver the chip UX, the composer needs a real
text-editing surface.

ADR 0009 (file viewer/editor, MVP 0.02) already chose CodeMirror 6 for
the in-app file editor on the strength of its extension model. That
choice is now load-bearing for 0.03 too: if the composer picks a
different editor, forkzero pays for two editor mental models, two
selection systems, and two extension surfaces — and the future Cmd+K
inline-AI command in 0.02's roadmap has to be implemented twice.

## Options

### Option A — CodeMirror 6 with a "prose" preset

- Same dependency forkzero already accepts in ADR 0009.
- Atomic widget decorations (`Decoration.replace({ widget, atomic: true })`
  combined with `EditorView.atomicRanges`) are the chip primitive.
- Selection, cursor stepping, copy/paste, undo, IME, and accessibility
  are CodeMirror's responsibility.
- Slash and file triggers, paste/drop image handling, and the Enter
  keymap are all composable extensions — single mental model.
- The future Cmd+K-on-selection extension carries forward from the file
  editor with no additional work.
- "Prose preset" is a small custom config: no gutter, no line numbers,
  soft-wrap on, auto-grow with min/max heights, placeholder via the
  `placeholder` extension.

### Option B — A new rich-text framework (Lexical, Tiptap/ProseMirror, Slate)

- Purpose-built for chip-style inline tokens with first-class APIs.
- Cost: a new top-level dependency (Lexical ≈ 80 KB, Tiptap+ProseMirror
  ≈ 130 KB) plus a parallel selection / decoration mental model
  alongside the CodeMirror surface in the file editor.
- The Cmd+K-on-selection feature (carried forward from 0.02) would have
  to be implemented twice — once for the editor (CodeMirror), once for
  the composer (Lexical/Tiptap).

### Option C — Hand-rolled `contenteditable`

- Smallest possible dependency footprint.
- Hand-rolling selection, cursor stepping over widget elements, paste
  sanitization, IME composition, undo/redo, and accessibility for a
  rich editor is a known sinkhole. Every browser version reveals new
  edge cases.
- Even the proposed v1 chip behaviors (backspace whole, arrow-step,
  atomic copy) would consume substantial composer budget, leaving the
  popovers and queue tray to a later phase.

## Decision

**Option A: CodeMirror 6 with a prose preset and atomic widget
decorations for chips.**

It is the only option that:

- Adds zero new dependencies.
- Lets the file editor and the composer share one selection /
  decoration / transaction model (so future editor work, including
  Cmd+K-on-selection, lands in both surfaces from one extension).
- Has a chip primitive (`Decoration.replace` + `atomicRanges`) that
  matches the screenshot UX exactly.
- Trades only the "prose-feel" defaults — and those are addressable
  with a small extension config.

## Consequences

- The composer host is split, mirroring the 0.02 file editor split:

  ```
  apps/renderer/src/lib/codemirror/composer.ts            EditorView factory + prose preset
  apps/renderer/src/lib/codemirror/composer-chips.ts      WidgetType + atomicRange decoration
  apps/renderer/src/lib/codemirror/composer-triggers.ts   `/` and `@` detection extensions
  apps/renderer/src/lib/codemirror/composer-keymap.ts     Enter / Shift-Enter / Cmd-Enter
  apps/renderer/src/components/chat-composer.tsx          React lifecycle, popover wiring
  ```

  This separation gives slash commands, file tagging, paste/drop image
  handling, and the queue tray each a single new file rather than a
  monolithic rewrite.

- The chip DOM is a minimal `<span class="fz-chip">[icon][divider][label]</span>`
  rendered by a `WidgetType`. Styling is Tailwind-only; no icons live
  in the widget itself — the React layer renders the icon SVG into the
  widget's host `span` so Material Icon Theme (added in 0.02) and
  lucide icons stay in React, not in CodeMirror.

- Document serialization is one direction at submit time: the composer
  walks the document, treating each chip range as a typed segment and
  the rest as text. The plain-text token form (`@<relPath>`,
  `[image: <name>]`, `/<skill-name>`) is what gets persisted in the
  message row's `text` field; the chip metadata (refs, ids) lives in
  parallel arrays on `ComposerInput`.

- We do **not** introduce a markdown or rich-text formatting layer in
  the composer. The editor is for prose with chips, not bold/italic.
  If future polish wants `**bold**` rendering inside the composer, it
  comes as another extension; today's scope ends at chips.

- Bundle impact: zero new dependencies (CodeMirror and lucide packages are
  already in `apps/renderer/package.json` from ADR 0009). The composer
  extensions add ~10 KB of forkzero-authored code.
