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
  // The error's `_tag` (e.g. "GitNotARepoError"), kept distinct from the
  // human-readable message so the Changes tab can branch on it — most notably
  // to swap the raw error for an "Initialize Git" CTA when there's no repo.
  readonly errorTagByKey: Record<string, string | null>;
  readonly refresh: (
    folderId: FolderId,
    worktreeId?: WorktreeId | null,
  ) => Promise<void>;
  // Initialize a git repo in the folder, then refresh so the tab flips from
  // the empty state to the (now clean) working tree.
  readonly initRepo: (
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

const errorTag = (err: unknown): string | null => {
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return null;
};

const fetchChanges = async (
  folderId: FolderId,
  worktreeId: WorktreeId | null | undefined,
): Promise<
  ReadonlyArray<GitChange> | { error: string; tag: string | null }
> => {
  try {
    const client = await getRpcClient();
    return await Effect.runPromise(
      client.git.changes({ folderId, worktreeId: worktreeId ?? null }),
    );
  } catch (err) {
    return { error: formatError(err), tag: errorTag(err) };
  }
};

export const useGitChangesStore = create<GitChangesState>((set, get) => ({
  byKey: {},
  loadingByKey: {},
  errorByKey: {},
  errorTagByKey: {},
  refresh: async (folderId, worktreeId) => {
    const key = gitChangesKey(folderId, worktreeId);
    const result = await fetchChanges(folderId, worktreeId);
    set((s) => {
      const isErr = !Array.isArray(result);
      const err = isErr
        ? (result as { error: string; tag: string | null })
        : null;
      return {
        byKey: isErr
          ? s.byKey
          : { ...s.byKey, [key]: result as ReadonlyArray<GitChange> },
        errorByKey: { ...s.errorByKey, [key]: err ? err.error : null },
        errorTagByKey: { ...s.errorTagByKey, [key]: err ? err.tag : null },
        loadingByKey: { ...s.loadingByKey, [key]: false },
      };
    });
  },
  initRepo: async (folderId, worktreeId) => {
    const client = await getRpcClient();
    await Effect.runPromise(client.git.init({ folderId }));
    await get().refresh(folderId, worktreeId);
  },
}));
