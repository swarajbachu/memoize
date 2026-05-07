import { Effect } from "effect";
import { create } from "zustand";

import type { FolderId, GitStatusSummary, WorktreeId } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * `git status` summary used by the top bar to decide which workflow button
 * to surface (Commit & push / Create PR / View PR). Polled every 5 s while
 * a folder is selected — `git status` is cheap and the latency budget is
 * "user perceives the right button shortly after they touch a file."
 *
 * Keyed by `(folderId, worktreeId)` because a session running in a worktree
 * has its own branch + dirty state that differs from the main checkout.
 * Use `gitStatusKey` to compute the lookup key on both sides.
 */
type StatusMap = Record<string, GitStatusSummary>;

type GitStatusState = {
  readonly byKey: StatusMap;
  readonly refresh: (
    folderId: FolderId,
    worktreeId?: WorktreeId | null,
  ) => Promise<void>;
};

export const gitStatusKey = (
  folderId: FolderId,
  worktreeId: WorktreeId | null | undefined,
): string => `${folderId}:${worktreeId ?? "main"}`;

const fetchStatus = async (
  folderId: FolderId,
  worktreeId: WorktreeId | null | undefined,
): Promise<GitStatusSummary | null> => {
  try {
    const client = await getRpcClient();
    return await Effect.runPromise(
      client.git.status({ folderId, worktreeId: worktreeId ?? null }),
    );
  } catch {
    return null;
  }
};

export const useGitStatusStore = create<GitStatusState>((set) => ({
  byKey: {},
  refresh: async (folderId, worktreeId) => {
    const summary = await fetchStatus(folderId, worktreeId);
    if (summary === null) return;
    const key = gitStatusKey(folderId, worktreeId);
    set((s) => ({ byKey: { ...s.byKey, [key]: summary } }));
  },
}));
