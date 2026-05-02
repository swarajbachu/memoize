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
  select: (folderId: FolderId) => void;
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
      const folders = await Effect.runPromise(client.workspace.list({}));
      // Auto-select the first folder if nothing is selected yet.
      const { selectedFolderId } = get();
      const selected =
        selectedFolderId !== null &&
        folders.some((f) => f.id === selectedFolderId)
          ? selectedFolderId
          : (folders[0]?.id ?? null);
      set({ folders, selectedFolderId: selected, loading: false });
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
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  remove: async (folderId) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.workspace.remove({ folderId }));
      set((s) => {
        const folders = s.folders.filter((f) => f.id !== folderId);
        const selectedFolderId =
          s.selectedFolderId === folderId
            ? (folders[0]?.id ?? null)
            : s.selectedFolderId;
        return { folders, selectedFolderId };
      });
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  select: (folderId) => set({ selectedFolderId: folderId }),
}));
