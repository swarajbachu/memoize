import { Effect } from "effect";
import { create } from "zustand";

import type { FolderId, Worktree, WorktreeId } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

type WorktreesByProject = Readonly<Record<string, ReadonlyArray<Worktree>>>;

type WorktreesState = {
  readonly byProject: WorktreesByProject;
  readonly loading: ReadonlySet<FolderId>;
  readonly error: string | null;
  readonly refresh: (projectId: FolderId) => Promise<void>;
  readonly create: (projectId: FolderId) => Promise<Worktree | null>;
  readonly remove: (
    projectId: FolderId,
    worktreeId: WorktreeId,
    force: boolean,
  ) => Promise<{ readonly ok: true } | { readonly ok: false; reason: string }>;
};

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

export const useWorktreesStore = create<WorktreesState>((set, get) => ({
  byProject: {},
  loading: new Set(),
  error: null,
  refresh: async (projectId) => {
    set((s) => {
      const next = new Set(s.loading);
      next.add(projectId);
      return { loading: next };
    });
    try {
      const client = await getRpcClient();
      const list = await Effect.runPromise(
        client.worktree.list({ projectId }),
      );
      set((s) => ({
        byProject: { ...s.byProject, [projectId]: list },
        loading: (() => {
          const n = new Set(s.loading);
          n.delete(projectId);
          return n;
        })(),
        error: null,
      }));
    } catch (err) {
      set((s) => ({
        loading: (() => {
          const n = new Set(s.loading);
          n.delete(projectId);
          return n;
        })(),
        error: formatError(err),
      }));
    }
  },
  create: async (projectId) => {
    try {
      const client = await getRpcClient();
      const wt = await Effect.runPromise(
        client.worktree.create({ projectId }),
      );
      set((s) => {
        const existing = s.byProject[projectId] ?? [];
        return {
          byProject: { ...s.byProject, [projectId]: [wt, ...existing] },
          error: null,
        };
      });
      return wt;
    } catch (err) {
      set({ error: formatError(err) });
      return null;
    }
  },
  remove: async (projectId, worktreeId, force) => {
    try {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.worktree.remove({ worktreeId, force }),
      );
      set((s) => {
        const list = s.byProject[projectId] ?? [];
        return {
          byProject: {
            ...s.byProject,
            [projectId]: list.filter((w) => w.id !== worktreeId),
          },
          error: null,
        };
      });
      return { ok: true } as const;
    } catch (err) {
      const reason = formatError(err);
      set({ error: reason });
      return { ok: false, reason } as const;
    }
  },
}));

export const selectWorktreesFor = (
  projectId: FolderId,
): ReadonlyArray<Worktree> => useWorktreesStore.getState().byProject[projectId] ?? [];
