import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";

import { addChipEffect, chipExtensions, type ChipMeta } from "./composer-chips.ts";
import { composerKeymap } from "./composer-keymap.ts";
import { composerTheme } from "./composer-theme.ts";
import {
  composerTriggerPlugin,
  type ActiveTrigger,
} from "./composer-triggers.ts";

export type ComposerCallbacks = {
  /**
   * Called when the user submits (Enter, Cmd+Enter, etc.). Returns whether the
   * submit was handled — if `false`, default keybindings (e.g. inserting a
   * newline) take over. Useful for guards like "popover is open" where the
   * Enter should be swallowed by the popover instead of submitting.
   */
  readonly onSubmit: () => boolean;
  readonly onChange: (doc: string) => void;
  readonly onTrigger: (trigger: ActiveTrigger | null) => void;
  /**
   * Called when one or more files are dropped onto the editor surface.
   * CodeMirror's default drop handler treats file drops as text paste —
   * we override that so image attachments take the same code path as
   * paperclip / paste.
   */
  readonly onFilesDropped: (files: ReadonlyArray<File>) => void;
};

export type ComposerCreateParams = {
  readonly parent: HTMLElement;
  readonly initialDoc?: string;
  readonly placeholderText: string;
  readonly callbacks: ComposerCallbacks;
};

/**
 * Build the prose-mode composer view. No gutter, no line numbers, no fold
 * markers; soft-wrap on; the auto-grow is handled in CSS via `min-height` /
 * `max-height` on the container so the view itself stays simple.
 *
 * The returned view's DOM is mounted into `parent`. Tear down with
 * `view.destroy()` when the composer unmounts.
 */
export const createComposerView = ({
  parent,
  initialDoc = "",
  placeholderText,
  callbacks,
}: ComposerCreateParams): EditorView => {
  const extensions: Extension[] = [
    history(),
    placeholder(placeholderText),
    EditorView.lineWrapping,
    composerTheme,
    ...chipExtensions,
    composerTriggerPlugin(callbacks.onTrigger),
    keymap.of([
      ...composerKeymap(callbacks),
      ...historyKeymap,
      // `defaultKeymap` last so our composer-specific bindings win on overlap.
      ...defaultKeymap,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) callbacks.onChange(u.state.doc.toString());
    }),
    // File drops: CodeMirror's default handler tries to paste the dropped
    // payload as text. For image drops that turns into a `file://...`
    // URL string in the doc — confusing and useless. Catch the drop here
    // and forward to the host so it can run the same upload pipeline as
    // paperclip / paste. Returning true tells CM we handled it.
    EditorView.domEventHandlers({
      dragover: (event) => {
        if (event.dataTransfer?.types.includes("Files") === true) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          return true;
        }
        return false;
      },
      drop: (event) => {
        const files = event.dataTransfer?.files;
        if (files === undefined || files.length === 0) return false;
        event.preventDefault();
        callbacks.onFilesDropped(Array.from(files));
        return true;
      },
    }),
  ];

  return new EditorView({
    parent,
    state: EditorState.create({
      doc: initialDoc,
      extensions,
    }),
  });
};

/** Replace the entire document — used by submit + `/clear`. */
export const setComposerDoc = (view: EditorView, doc: string): void => {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: doc },
    selection: { anchor: doc.length },
  });
};

export const composerDoc = (view: EditorView): string =>
  view.state.doc.toString();

/**
 * Replace `[from, to)` in the document with `tokenText` and register a chip
 * over the inserted range. Used by the slash + file popovers when the user
 * confirms a suggestion. A trailing space is inserted after the chip so the
 * cursor lands ready for the next word — matches the spec's `@chat-comp` →
 * inserts chip and the trigger literal is consumed behaviour.
 */
export const replaceWithChip = (
  view: EditorView,
  from: number,
  to: number,
  tokenText: string,
  meta: ChipMeta,
): void => {
  const insertText = tokenText + " ";
  const chipFrom = from;
  const chipTo = from + tokenText.length;
  view.dispatch({
    changes: { from, to, insert: insertText },
    selection: { anchor: from + insertText.length },
    effects: addChipEffect.of({ from: chipFrom, to: chipTo, meta }),
  });
  view.focus();
};

export type { ActiveTrigger } from "./composer-triggers.ts";
