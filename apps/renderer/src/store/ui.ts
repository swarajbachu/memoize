import { create } from "zustand";

import type { FolderId, WorktreeId } from "@memoize/wire";

/**
 * Top-level renderer view. The settings page replaces the chat surface in the
 * main pane so users have a real settings page rather than a slide-in drawer.
 */
export type View = "chat" | "settings";

/**
 * Which sub-surface of the settings page is active. `general` / `models` /
 * `workspace` are global; a `repository` section pins to a specific project
 * so its overrides + worktree list render in the right pane.
 */
export type SettingsSection =
  | { readonly kind: "general" }
  | { readonly kind: "models" }
  | { readonly kind: "workspace" }
  | { readonly kind: "shortcuts" }
  | { readonly kind: "repository"; readonly projectId: FolderId };

/**
 * Which surface the main pane is showing. The chat tab is always available;
 * the file tab only exists when `openFile !== null`. Opening a different file
 * replaces (never stacks) the file tab — see specs/0.02-MVP/features/file-viewer.md.
 */
export type MainTab = "chat" | "file";

/**
 * Tabs in the right-hand workspace pane. Lifted from `RightPane`'s local
 * state so the native menu (Cmd+J → Toggle Terminal) can drive it.
 */
export type RightTab = "files" | "terminal" | "changes" | "pr";

export type OpenFile = {
  readonly folderId: FolderId;
  readonly path: string;
  readonly name: string;
  /**
   * Worktree the file lives in. Persisted on the OpenFile so a save still
   * targets the right tree even if the user switches selected sessions
   * while the file is open. `null` means main checkout.
   */
  readonly worktreeId: WorktreeId | null;
};

type UiState = {
  readonly view: View;
  readonly setView: (view: View) => void;
  readonly settingsSection: SettingsSection;
  readonly setSettingsSection: (section: SettingsSection) => void;
  readonly activeMainTab: MainTab;
  readonly openFile: OpenFile | null;
  readonly fileDirty: boolean;
  // 0.02 hard-codes false. The future settings-page autosave toggle flips
  // this to true and a debounced save kicks in inside FileEditor.
  readonly autosave: boolean;
  readonly leftSidebarOpen: boolean;
  readonly rightSidebarOpen: boolean;
  readonly isFullScreen: boolean;
  readonly activeRightTab: RightTab;
  readonly setActiveMainTab: (tab: MainTab) => void;
  readonly openFileInTab: (file: OpenFile) => void;
  readonly closeFileTab: () => void;
  readonly setFileDirty: (dirty: boolean) => void;
  readonly setLeftSidebarOpen: (open: boolean) => void;
  readonly setRightSidebarOpen: (open: boolean) => void;
  readonly setFullScreen: (full: boolean) => void;
  readonly setActiveRightTab: (tab: RightTab) => void;
};

export const useUiStore = create<UiState>((set) => ({
  view: "chat",
  setView: (view) => set({ view }),
  settingsSection: { kind: "general" },
  setSettingsSection: (section) => set({ settingsSection: section }),
  activeMainTab: "chat",
  openFile: null,
  fileDirty: false,
  autosave: false,
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  isFullScreen: false,
  activeRightTab: "files",
  setActiveMainTab: (tab) => set({ activeMainTab: tab }),
  openFileInTab: (file) =>
    set({ openFile: file, activeMainTab: "file", fileDirty: false }),
  closeFileTab: () =>
    set({ openFile: null, activeMainTab: "chat", fileDirty: false }),
  setFileDirty: (dirty) => set({ fileDirty: dirty }),
  setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
  setFullScreen: (full) => set({ isFullScreen: full }),
  setActiveRightTab: (tab) => set({ activeRightTab: tab }),
}));
