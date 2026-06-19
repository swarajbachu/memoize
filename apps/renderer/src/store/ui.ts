import { create } from "zustand";

import type { CodeAnnotation, FolderId, WorktreeId } from "@memoize/wire";

/**
 * Top-level renderer view. The settings page replaces the chat surface in the
 * main pane so users have a real settings page rather than a slide-in drawer.
 */
export type View = "chat" | "settings";

/**
 * Which sub-surface of the settings page is active. `general` / `providers` /
 * `workspace` are global; a `repository` section pins to a specific project
 * so its overrides + worktree list render in the right pane.
 */
export type SettingsSection =
  | { readonly kind: "general" }
  | { readonly kind: "providers" }
  | { readonly kind: "workspace" }
  | { readonly kind: "pokedex" }
  | { readonly kind: "browser" }
  | { readonly kind: "shortcuts" }
  | { readonly kind: "developer" }
  | { readonly kind: "repository"; readonly projectId: FolderId };

/**
 * Which surface the main pane is showing. The chat tab is always available;
 * the file tab only exists when `openFile !== null`. Opening a different file
 * replaces (never stacks) the file tab — see specs/0.02-MVP/features/file-viewer.md.
 */
export type MainTab = "chat" | "file" | "archives";

/**
 * Tabs in the right-hand workspace pane. Lifted from `RightPane`'s local
 * state so the native menu (Cmd+J → Toggle Terminal) can drive it.
 */
export type RightTab = "files" | "terminal" | "changes" | "pr" | "browser";

/**
 * Which body the file viewer is showing. `edit` is the CodeMirror editor;
 * `diff` is the side-by-side patch view (working tree vs HEAD) — wired up
 * for clicks from the Changes panel and from Edit/Write/MultiEdit tool
 * rows. Toggled in the toolbar; defaults set per entry point.
 */
export type FileView = "edit" | "diff";

/**
 * Discriminated by `kind`. `text` is the project-root-relative path the file
 * editor reads via `fs.readFile`; `image` is a raw URL the renderer renders
 * inline (currently used for `memoize://attachments/<id>` so screenshots
 * stay inside the app instead of bouncing to the OS handler).
 */
export type OpenFile =
  | {
      readonly kind: "text";
      readonly folderId: FolderId;
      readonly path: string;
      readonly name: string;
      /**
       * Worktree the file lives in. Persisted on the OpenFile so a save
       * still targets the right tree even if the user switches selected
       * sessions while the file is open. `null` means main checkout.
       */
      readonly worktreeId: WorktreeId | null;
      readonly view: FileView;
    }
  | {
      readonly kind: "image";
      readonly src: string;
      readonly name: string;
    }
  | {
      /**
       * A file outside any project folder (e.g. a plan or markdown file the
       * agent wrote elsewhere on disk). Read/written by absolute path via the
       * `fs.*ExternalFile` RPCs, which deliberately skip the workspace
       * sandbox. Edit-only — there's no git/folder context for a diff.
       */
      readonly kind: "external";
      readonly absPath: string;
      readonly name: string;
      readonly view: FileView;
    };

export type RevealedAnnotation = CodeAnnotation & {
  /**
   * Monotonic token so clicking the same annotation again still re-scrolls and
   * refreshes the editor highlight.
   */
  readonly revealToken: number;
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
  readonly revealedAnnotation: RevealedAnnotation | null;
  readonly setActiveMainTab: (tab: MainTab) => void;
  readonly openFileInTab: (
    file:
      | (Omit<Extract<OpenFile, { kind: "text" }>, "view"> & {
          view?: FileView;
        })
      | (Omit<Extract<OpenFile, { kind: "external" }>, "view"> & {
          view?: FileView;
        })
      | Extract<OpenFile, { kind: "image" }>,
  ) => void;
  readonly setOpenFileView: (view: FileView) => void;
  readonly closeFileTab: () => void;
  readonly setFileDirty: (dirty: boolean) => void;
  readonly setLeftSidebarOpen: (open: boolean) => void;
  readonly setRightSidebarOpen: (open: boolean) => void;
  readonly setFullScreen: (full: boolean) => void;
  readonly setActiveRightTab: (tab: RightTab) => void;
  readonly revealAnnotation: (annotation: CodeAnnotation) => void;
  readonly clearRevealedAnnotation: () => void;
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
  revealedAnnotation: null,
  setActiveMainTab: (tab) => set({ activeMainTab: tab }),
  openFileInTab: (file) =>
    set({
      openFile:
        file.kind === "image" ? file : { ...file, view: file.view ?? "edit" },
      activeMainTab: "file",
      fileDirty: false,
    }),
  setOpenFileView: (view) =>
    set((s) => {
      if (s.openFile === null || s.openFile.kind !== "text") return s;
      return { openFile: { ...s.openFile, view } };
    }),
  closeFileTab: () =>
    set({ openFile: null, activeMainTab: "chat", fileDirty: false }),
  setFileDirty: (dirty) => set({ fileDirty: dirty }),
  setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
  setFullScreen: (full) => set({ isFullScreen: full }),
  setActiveRightTab: (tab) => set({ activeRightTab: tab }),
  revealAnnotation: (annotation) =>
    set((s) => ({
      revealedAnnotation: {
        ...annotation,
        revealToken: (s.revealedAnnotation?.revealToken ?? 0) + 1,
      },
    })),
  clearRevealedAnnotation: () => set({ revealedAnnotation: null }),
}));
