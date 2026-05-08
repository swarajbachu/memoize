import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";

import { memoizeTheme } from "./theme.ts";

// One compartment for the language extension so opening a different file
// reconfigures it via a single transaction instead of rebuilding the view.
export const languageCompartment = new Compartment();

export type CreateEditorParams = {
  parent: HTMLElement;
  doc: string;
  language: Extension | null;
  onSave: () => void;
  onChange: (doc: string) => void;
};

export const createEditor = ({
  parent,
  doc,
  language,
  onSave,
  onChange,
}: CreateEditorParams): EditorView =>
  new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter(),
        history(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              onSave();
              return true;
            },
          },
        ]),
        memoizeTheme,
        languageCompartment.of(language ?? []),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
      ],
    }),
  });
