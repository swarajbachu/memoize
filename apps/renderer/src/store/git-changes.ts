import { Effect } from "effect";
import { create } from "zustand";

import type { FolderId, GitChange, WorktreeId } from "@memoize/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * Per-`(folder, worktree)` list of working-tree changes parsed from
 * `git status --porcelain=v2`. Backs the Changes tab's "tracked / untracked"
 * sections. Polled on the same 5s cadence the top bar uses for `git.status`.
 */
type ChangesMap = Record<string, ReadonlyArray<GitChange>>;

type GitChangesState = {
  readonly byKey: ChangesMap;
  readonly loadingByKey: Record<string, boolean>;
  readonly errorByKey: Record<string, string | null>;
  readonly refresh: (
    folderId: FolderId,
    worktreeId?: WorktreeId | null,
  ) => Promise<void>;
};

export const gitChangesKey = (
  folderId: FolderId,
  worktreeId: WorktreeId | null | undefined,
): string => `${folderId}:${worktreeId ?? "main"}`;

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

const fetchChanges = async (
  folderId: FolderId,
  worktreeId: WorktreeId | null | undefined,
): Promise<ReadonlyArray<GitChange> | { error: string }> => {
  try {
    const client = await getRpcClient();
    return await Effect.runPromise(
      client.git.changes({ folderId, worktreeId: worktreeId ?? null }),
    );
  } catch (err) {
    return { error: formatError(err) };
  }
};

export const useGitChangesStore = create<GitChangesState>((set) => ({
  byKey: {},
  loadingByKey: {},
  errorByKey: {},
  refresh: async (folderId, worktreeId) => {
    const key = gitChangesKey(folderId, worktreeId);
    const result = await fetchChanges(folderId, worktreeId);
    set((s) => {
      const isErr = !Array.isArray(result);
      return {
        byKey: isErr
          ? s.byKey
          : { ...s.byKey, [key]: result as ReadonlyArray<GitChange> },
        errorByKey: {
          ...s.errorByKey,
          [key]: isErr ? (result as { error: string }).error : null,
        },
        loadingByKey: { ...s.loadingByKey, [key]: false },
      };
    });
  },
}));
