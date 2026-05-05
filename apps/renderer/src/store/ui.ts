import { create } from "zustand";

import type { FolderId } from "@forkzero/wire";

/**
 * Top-level renderer view. The settings page replaces the chat surface in the
 * main pane so users have a real settings page rather than a slide-in drawer.
 */
export type View = "chat" | "settings";

/**
 * Which surface the main pane is showing. The chat tab is always available;
 * the file tab only exists when `openFile !== null`. Opening a different file
 * replaces (never stacks) the file tab — see specs/0.02-MVP/features/file-viewer.md.
 */
export type MainTab = "chat" | "file";

export type OpenFile = {
  readonly folderId: FolderId;
  readonly path: string;
  readonly name: string;
};

type UiState = {
  readonly view: View;
  readonly setView: (view: View) => void;
  readonly activeMainTab: MainTab;
  readonly openFile: OpenFile | null;
  readonly fileDirty: boolean;
  // 0.02 hard-codes false. The future settings-page autosave toggle flips
  // this to true and a debounced save kicks in inside FileEditor.
  readonly autosave: boolean;
  readonly rightSidebarOpen: boolean;
  readonly setActiveMainTab: (tab: MainTab) => void;
  readonly openFileInTab: (file: OpenFile) => void;
  readonly closeFileTab: () => void;
  readonly setFileDirty: (dirty: boolean) => void;
  readonly setRightSidebarOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  view: "chat",
  setView: (view) => set({ view }),
  activeMainTab: "chat",
  openFile: null,
  fileDirty: false,
  autosave: false,
  rightSidebarOpen: true,
  setActiveMainTab: (tab) => set({ activeMainTab: tab }),
  openFileInTab: (file) =>
    set({ openFile: file, activeMainTab: "file", fileDirty: false }),
  closeFileTab: () =>
    set({ openFile: null, activeMainTab: "chat", fileDirty: false }),
  setFileDirty: (dirty) => set({ fileDirty: dirty }),
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
}));
