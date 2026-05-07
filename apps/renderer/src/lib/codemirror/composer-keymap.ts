import { insertNewlineAndIndent } from "@codemirror/commands";
import type { KeyBinding } from "@codemirror/view";

import type { ComposerCallbacks } from "./composer.ts";

/**
 * Composer keymap.
 *
 *  - `Enter` submits (when `onSubmit` returns true).
 *  - `Shift+Enter` inserts a newline.
 *  - `Cmd+Enter` / `Ctrl+Enter` is a backstop submit — kept for muscle memory
 *    from the 0.02 textarea where it was the only submit chord.
 *
 * The `onSubmit` callback returns `false` when the host wants the keypress to
 * fall through (popover open, etc.). On `false` we let the default newline
 * binding take the Enter — same shape Slack/Discord composers use.
 */
export const composerKeymap = (
  callbacks: ComposerCallbacks,
): readonly KeyBinding[] => [
  {
    key: "Enter",
    preventDefault: true,
    run: () => callbacks.onSubmit(),
  },
  {
    key: "Shift-Enter",
    run: insertNewlineAndIndent,
  },
  {
    key: "Mod-Enter",
    preventDefault: true,
    run: () => {
      // Cmd+Enter ignores the host's submit-guard (popover open) since users
      // pressing it explicitly want to send.
      callbacks.onSubmit();
      return true;
    },
  },
  {
    key: "Shift-Tab",
    preventDefault: true,
    run: () => {
      // Shift+Tab toggles plan mode without leaving the composer. We
      // claim Shift+Tab unconditionally inside the composer because the
      // editor doesn't accept tabs anyway (single-line prose mode), so
      // there's nothing to outdent.
      const cb = callbacks.onTogglePlanMode;
      if (cb === undefined) return false;
      cb();
      return true;
    },
  },
];
