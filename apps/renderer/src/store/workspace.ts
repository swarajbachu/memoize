import { Effect } from "effect";
import { create } from "zustand";

import type { Folder, FolderId } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

type WorkspaceState = {
  folders: ReadonlyArray<Folder>;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: () => Promise<void>;
  remove: (folderId: FolderId) => Promise<void>;
};

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  folders: [],
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const client = await getRpcClient();
      const folders = await Effect.runPromise(client.workspace.list({}));
      set({ folders, loading: false });
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
      set((s) => ({ folders: [...s.folders, folder] }));
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  remove: async (folderId) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.workspace.remove({ folderId }));
      set((s) => ({ folders: s.folders.filter((f) => f.id !== folderId) }));
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
}));
