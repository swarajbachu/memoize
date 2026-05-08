import { Effect } from "effect";
import { create } from "zustand";

import type { FolderId, GitPrInfo, WorktreeId } from "@memoize/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * PR state cache. Source of truth for the sidebar branch icon color and the
 * diff-stats slot on the session row. Hydrated lazily when a project is
 * expanded or a session row mounts; refreshed after a turn finishes
 * (running → idle/closed) and on-demand from the chat composer.
 *
 * Keyed by `(folderId, worktreeId)` because each worktree has its own
 * branch and therefore its own PR. Sessions on the main checkout share
 * the project-level entry (`worktreeId === null`).
 */
type PrStateMap = Record<string, GitPrInfo>;

type PrState = {
  readonly byKey: PrStateMap;
  readonly hydrate: (
    folderId: FolderId,
    worktreeId?: WorktreeId | null,
  ) => Promise<void>;
  readonly refresh: (
    folderId: FolderId,
    worktreeId?: WorktreeId | null,
  ) => Promise<void>;
};

export const prStateKey = (
  folderId: FolderId,
  worktreeId: WorktreeId | null | undefined,
): string => `${folderId}:${worktreeId ?? "main"}`;

const fetchPrState = async (
  folderId: FolderId,
  worktreeId: WorktreeId | null | undefined,
): Promise<GitPrInfo | null> => {
  try {
    const client = await getRpcClient();
    const info = await Effect.runPromise(
      client.git.prState({ folderId, worktreeId: worktreeId ?? null }),
    );
    return info;
  } catch {
    // gh missing, no PR, no remote, etc. — caller treats absence as "none".
    return null;
  }
};

export const usePrStateStore = create<PrState>((set, get) => ({
  byKey: {},
  hydrate: async (folderId, worktreeId) => {
    const key = prStateKey(folderId, worktreeId);
    if (key in get().byKey) return;
    const info = await fetchPrState(folderId, worktreeId);
    if (info === null) return;
    set((s) => ({ byKey: { ...s.byKey, [key]: info } }));
  },
  refresh: async (folderId, worktreeId) => {
    const info = await fetchPrState(folderId, worktreeId);
    if (info === null) return;
    const key = prStateKey(folderId, worktreeId);
    set((s) => ({ byKey: { ...s.byKey, [key]: info } }));
  },
}));
