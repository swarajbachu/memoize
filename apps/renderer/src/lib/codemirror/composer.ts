import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";

import { composerKeymap } from "./composer-keymap.ts";
import { composerTheme } from "./composer-theme.ts";

export type ComposerCallbacks = {
  /**
   * Called when the user submits (Enter, Cmd+Enter, etc.). Returns whether the
   * submit was handled — if `false`, default keybindings (e.g. inserting a
   * newline) take over. Useful for guards like "popover is open" where the
   * Enter should be swallowed by the popover instead of submitting.
   */
  readonly onSubmit: () => boolean;
  readonly onChange: (doc: string) => void;
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
    keymap.of([
      ...composerKeymap(callbacks),
      ...historyKeymap,
      // `defaultKeymap` last so our composer-specific bindings win on overlap.
      ...defaultKeymap,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) callbacks.onChange(u.state.doc.toString());
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
