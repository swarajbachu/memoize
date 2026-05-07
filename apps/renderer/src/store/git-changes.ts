import { Effect } from "effect";
import { create } from "zustand";

import type { FolderId, GitChange } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * Per-folder list of working-tree changes, parsed from
 * `git status --porcelain=v2`. Backs the Diff tab's "tracked / untracked"
 * sections. Cheap enough that we re-fetch on demand (after every commit, and
 * whenever the Diff tab mounts) rather than maintaining a watcher.
 */
type ChangesMap = Record<string, ReadonlyArray<GitChange>>;

type GitChangesState = {
  readonly byFolder: ChangesMap;
  readonly loadingByFolder: Record<string, boolean>;
  readonly errorByFolder: Record<string, string | null>;
  readonly hydrate: (folderId: FolderId) => Promise<void>;
  readonly refresh: (folderId: FolderId) => Promise<void>;
};

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

const fetchChanges = async (
  folderId: FolderId,
): Promise<ReadonlyArray<GitChange> | { error: string }> => {
  try {
    const client = await getRpcClient();
    return await Effect.runPromise(client.git.changes({ folderId }));
  } catch (err) {
    return { error: formatError(err) };
  }
};

export const useGitChangesStore = create<GitChangesState>((set, get) => ({
  byFolder: {},
  loadingByFolder: {},
  errorByFolder: {},
  hydrate: async (folderId) => {
    if (folderId in get().byFolder) return;
    if (get().loadingByFolder[folderId] === true) return;
    set((s) => ({
      loadingByFolder: { ...s.loadingByFolder, [folderId]: true },
    }));
    const result = await fetchChanges(folderId);
    set((s) => {
      const isErr = !Array.isArray(result);
      return {
        loadingByFolder: { ...s.loadingByFolder, [folderId]: false },
        byFolder: isErr
          ? s.byFolder
          : { ...s.byFolder, [folderId]: result as ReadonlyArray<GitChange> },
        errorByFolder: {
          ...s.errorByFolder,
          [folderId]: isErr ? (result as { error: string }).error : null,
        },
      };
    });
  },
  refresh: async (folderId) => {
    const result = await fetchChanges(folderId);
    set((s) => {
      const isErr = !Array.isArray(result);
      return {
        byFolder: isErr
          ? s.byFolder
          : { ...s.byFolder, [folderId]: result as ReadonlyArray<GitChange> },
        errorByFolder: {
          ...s.errorByFolder,
          [folderId]: isErr ? (result as { error: string }).error : null,
        },
      };
    });
  },
}));
