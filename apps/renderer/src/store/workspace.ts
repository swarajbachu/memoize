import { Effect } from "effect";
import { create } from "zustand";

import type { Folder, FolderId } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

type WorkspaceState = {
  folders: ReadonlyArray<Folder>;
  selectedFolderId: FolderId | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: () => Promise<void>;
  remove: (folderId: FolderId) => Promise<void>;
  select: (folderId: FolderId) => Promise<void>;
};

const persistSelection = async (folderId: FolderId | null): Promise<void> => {
  try {
    const client = await getRpcClient();
    await Effect.runPromise(client.workspace.setSelected({ folderId }));
  } catch {
    // best-effort persistence; the in-memory store already updated
  }
};

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  folders: [],
  selectedFolderId: null,
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const client = await getRpcClient();
      const [folders, persisted] = await Promise.all([
        Effect.runPromise(client.workspace.list({})),
        Effect.runPromise(client.workspace.getSelected({})),
      ]);
      // Prefer the persisted selection if its folder still exists; otherwise
      // pick the first folder so the UI is never in a "have folders, none
      // selected" limbo on cold start.
      const selected =
        persisted !== null && folders.some((f) => f.id === persisted)
          ? persisted
          : (folders[0]?.id ?? null);
      set({ folders, selectedFolderId: selected, loading: false });
      // If we fell back to first-folder, persist that so the next launch
      // restores the same one without re-running the fallback.
      if (selected !== persisted) await persistSelection(selected);
    } catch (err) {
      set({ error: formatError(err), loading: false });
    }
  },
  add: async () => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      const path = await Effect.runPromise(client.workspace.pickFolder({}));
      if (path === null) return;
      const folder = await Effect.runPromise(client.workspace.add({ path }));
      set((s) => ({
        folders: [...s.folders, folder],
        selectedFolderId: folder.id,
      }));
      await persistSelection(folder.id);
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  remove: async (folderId) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.workspace.remove({ folderId }));
      const nextSelected = (() => {
        const s = get();
        const folders = s.folders.filter((f) => f.id !== folderId);
        const selectedFolderId =
          s.selectedFolderId === folderId
            ? (folders[0]?.id ?? null)
            : s.selectedFolderId;
        set({ folders, selectedFolderId });
        return { selectedFolderId, changed: s.selectedFolderId === folderId };
      })();
      if (nextSelected.changed) await persistSelection(nextSelected.selectedFolderId);
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  select: async (folderId) => {
    if (get().selectedFolderId === folderId) return;
    set({ selectedFolderId: folderId });
    await persistSelection(folderId);
  },
}));
