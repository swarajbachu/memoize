import { Effect } from "effect";
import { create } from "zustand";

import type { FolderId, GitPrDetails } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * Per-project rich PR detail (title, body, reviews, comments, files, checks).
 * Heavier than {@link usePrStateStore} so we only fetch lazily when the PR
 * pane mounts. Refresh is wired into the same turn-finished hook the lighter
 * `pr-state` store uses, so the two stay coherent.
 */
type PrDetailsMap = Record<string, GitPrDetails>;

type PrDetailsState = {
  readonly byFolder: PrDetailsMap;
  readonly loadingByFolder: Record<string, boolean>;
  readonly hydrate: (folderId: FolderId) => Promise<void>;
  readonly refresh: (folderId: FolderId) => Promise<void>;
};

const fetchPrDetails = async (
  folderId: FolderId,
): Promise<GitPrDetails | null> => {
  try {
    const client = await getRpcClient();
    return await Effect.runPromise(client.git.prDetails({ folderId }));
  } catch {
    return null;
  }
};

export const usePrDetailsStore = create<PrDetailsState>((set, get) => ({
  byFolder: {},
  loadingByFolder: {},
  hydrate: async (folderId) => {
    if (folderId in get().byFolder) return;
    if (get().loadingByFolder[folderId] === true) return;
    set((s) => ({
      loadingByFolder: { ...s.loadingByFolder, [folderId]: true },
    }));
    const info = await fetchPrDetails(folderId);
    set((s) => ({
      loadingByFolder: { ...s.loadingByFolder, [folderId]: false },
      byFolder:
        info === null ? s.byFolder : { ...s.byFolder, [folderId]: info },
    }));
  },
  refresh: async (folderId) => {
    const info = await fetchPrDetails(folderId);
    if (info === null) return;
    set((s) => ({ byFolder: { ...s.byFolder, [folderId]: info } }));
  },
}));
