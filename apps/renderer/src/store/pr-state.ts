import { Effect } from "effect";
import { create } from "zustand";

import type { FolderId, GitPrInfo } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * Per-project PR state. Source of truth for the sidebar branch icon color and
 * the diff-stats slot on the session row. Hydrated lazily when a project is
 * expanded; refreshed after a turn finishes (running → idle/closed) and
 * on-demand from the chat composer.
 */
type PrStateMap = Record<string, GitPrInfo>;

type PrState = {
  readonly byFolder: PrStateMap;
  readonly hydrate: (folderId: FolderId) => Promise<void>;
  readonly refresh: (folderId: FolderId) => Promise<void>;
};

const fetchPrState = async (folderId: FolderId): Promise<GitPrInfo | null> => {
  try {
    const client = await getRpcClient();
    const info = await Effect.runPromise(client.git.prState({ folderId }));
    return info;
  } catch {
    // gh missing, no PR, no remote, etc. — caller treats absence as "none".
    return null;
  }
};

export const usePrStateStore = create<PrState>((set, get) => ({
  byFolder: {},
  hydrate: async (folderId) => {
    if (folderId in get().byFolder) return;
    const info = await fetchPrState(folderId);
    if (info === null) return;
    set((s) => ({ byFolder: { ...s.byFolder, [folderId]: info } }));
  },
  refresh: async (folderId) => {
    const info = await fetchPrState(folderId);
    if (info === null) return;
    set((s) => ({ byFolder: { ...s.byFolder, [folderId]: info } }));
  },
}));
