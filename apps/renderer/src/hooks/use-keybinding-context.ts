import { useEffect } from "react";

import { create } from "zustand";

import { useUiStore } from "../store/ui";

/**
 * Boolean variables that `when` clauses can reference. The when-clause
 * parser is permissive (any identifier is legal); the editor surfaces a
 * warning when a rule references something outside `KNOWN_WHEN_IDENTIFIERS`,
 * but evaluation just treats unknowns as `false`.
 *
 * Components push into this store when they gain / lose focus:
 *   - Composer's CodeMirror view sets `composerFocus`.
 *   - File-editor CodeMirror view sets `editorFocus`.
 *   - Terminal pane sets `terminalFocus` on xterm focus.
 *
 * Surface state (settings page open, sidebars) mirrors `useUiStore` via
 * `useSyncWhenContextFromUi` so we have one place to read at match time.
 */
interface KeybindingContextState {
  readonly composerFocus: boolean;
  readonly editorFocus: boolean;
  readonly terminalFocus: boolean;
  readonly settingsOpen: boolean;
  readonly leftSidebarOpen: boolean;
  readonly rightSidebarOpen: boolean;
  readonly setComposerFocus: (v: boolean) => void;
  readonly setEditorFocus: (v: boolean) => void;
  readonly setTerminalFocus: (v: boolean) => void;
  readonly setSettingsOpen: (v: boolean) => void;
  readonly setLeftSidebarOpen: (v: boolean) => void;
  readonly setRightSidebarOpen: (v: boolean) => void;
}

export const useKeybindingContext = create<KeybindingContextState>((set) => ({
  composerFocus: false,
  editorFocus: false,
  terminalFocus: false,
  settingsOpen: false,
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  setComposerFocus: (v) => set({ composerFocus: v }),
  setEditorFocus: (v) => set({ editorFocus: v }),
  setTerminalFocus: (v) => set({ terminalFocus: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setLeftSidebarOpen: (v) => set({ leftSidebarOpen: v }),
  setRightSidebarOpen: (v) => set({ rightSidebarOpen: v }),
}));

/**
 * Snapshot the current context as the flat `Record<string, boolean>` the
 * when-clause evaluator wants. Called from the dispatch hook per keydown
 * — cheap enough to avoid memoising.
 */
export function readWhenContext(): Readonly<Record<string, boolean>> {
  const s = useKeybindingContext.getState();
  return {
    composerFocus: s.composerFocus,
    editorFocus: s.editorFocus,
    terminalFocus: s.terminalFocus,
    settingsOpen: s.settingsOpen,
    leftSidebarOpen: s.leftSidebarOpen,
    rightSidebarOpen: s.rightSidebarOpen,
  };
}

/**
 * Bridge surface state from the UI store into the when-clause context.
 * Mount once at the app root. Cheaper than scattering subscriptions
 * across the focus-tracking components — they only push the things they
 * uniquely know (their own focus).
 */
export function useSyncWhenContextFromUi(): void {
  const view = useUiStore((s) => s.view);
  const leftSidebarOpen = useUiStore((s) => s.leftSidebarOpen);
  const rightSidebarOpen = useUiStore((s) => s.rightSidebarOpen);

  useEffect(() => {
    useKeybindingContext.getState().setSettingsOpen(view === "settings");
  }, [view]);

  useEffect(() => {
    useKeybindingContext.getState().setLeftSidebarOpen(leftSidebarOpen);
  }, [leftSidebarOpen]);

  useEffect(() => {
    useKeybindingContext.getState().setRightSidebarOpen(rightSidebarOpen);
  }, [rightSidebarOpen]);
}
