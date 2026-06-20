import { Effect } from "effect";
import { create } from "zustand";

import type { FolderId, Worktree, WorktreeId } from "@memoize/wire";

import { toastManager } from "../components/ui/toast.tsx";
import { getRpcClient } from "../lib/rpc-client.ts";
import { useRepositorySettingsStore } from "./repository-settings.ts";
import { terminalsKey, useTerminalsStore } from "./terminals.ts";

/** Rarities worth interrupting the user with a one-off unlock toast. */
const NOTABLE_RARITIES: ReadonlySet<string> = new Set([
  "rare",
  "epic",
  "legendary",
]);

type WorktreesByProject = Readonly<Record<string, ReadonlyArray<Worktree>>>;

/**
 * Stable reference for "no worktrees yet" so selectors written as
 * `s.byProject[projectId] ?? EMPTY` don't return a new array each render
 * — that would invalidate zustand's `Object.is` snapshot and trigger a
 * `getSnapshot` infinite loop in React 19.
 */
export const EMPTY_WORKTREES: ReadonlyArray<Worktree> = Object.freeze([]);

type WorktreesState = {
  readonly byProject: WorktreesByProject;
  readonly loading: ReadonlySet<FolderId>;
  readonly creatingSetupByProject: ReadonlySet<FolderId>;
  readonly setupPending: ReadonlySet<WorktreeId>;
  readonly error: string | null;
  readonly refresh: (projectId: FolderId) => Promise<void>;
  readonly create: (projectId: FolderId) => Promise<Worktree | null>;
  readonly rerunSetup: (
    projectId: FolderId,
    worktreeId: WorktreeId,
  ) => Promise<Worktree | null>;
  readonly startRun: (worktreeId: WorktreeId) => Promise<{
    readonly cwd: string;
    readonly script: string;
    readonly env: Record<string, string>;
  } | null>;
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

/**
 * The setup *script* now runs in the background on the server (so creation
 * returns fast), leaving the worktree at `setup_status = 'running'`. Poll
 * `list` until it reaches a terminal status so the store — and therefore the
 * terminal pane's setup output and the auto-run trigger — reflects reality
 * without needing a server push. Cheap: only runs while a setup is in flight
 * and stops the moment it finishes.
 */
const pollSetupUntilDone = async (
  projectId: FolderId,
  worktreeId: WorktreeId,
) => {
  // ~10 min ceiling, matching the server-side setup script timeout.
  for (let i = 0; i < 400; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await useWorktreesStore.getState().refresh(projectId);
    const wt = (
      useWorktreesStore.getState().byProject[projectId] ?? EMPTY_WORKTREES
    ).find((w) => w.id === worktreeId);
    if (wt === undefined) return;
    if (wt.setupStatus !== "running") {
      void maybeAutoRun(projectId, wt);
      return;
    }
  }
};

const maybeAutoRun = async (projectId: FolderId, wt: Worktree) => {
  const settings =
    useRepositorySettingsStore.getState().byProject[projectId] ??
    (await useRepositorySettingsStore.getState().refresh(projectId));
  if (settings?.autoRunAfterSetup !== true) return;
  if (wt.setupStatus !== "succeeded" && wt.setupStatus !== "skipped") return;
  const run = await useWorktreesStore.getState().startRun(wt.id);
  if (run === null) return;
  useTerminalsStore
    .getState()
    .addCommand(terminalsKey(projectId, wt.id), run.cwd, "Run", {
      cmd: "/bin/zsh",
      args: ["-lc", run.script],
      env: run.env,
    });
};

export const useWorktreesStore = create<WorktreesState>((set, get) => ({
  byProject: {},
  loading: new Set(),
  creatingSetupByProject: new Set(),
  setupPending: new Set(),
  error: null,
  refresh: async (projectId) => {
    set((s) => {
      const next = new Set(s.loading);
      next.add(projectId);
      return { loading: next };
    });
    try {
      const client = await getRpcClient();
      const list = await Effect.runPromise(client.worktree.list({ projectId }));
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
    set((s) => {
      const next = new Set(s.creatingSetupByProject);
      next.add(projectId);
      return { creatingSetupByProject: next };
    });
    try {
      const client = await getRpcClient();
      const wt = await Effect.runPromise(client.worktree.create({ projectId }));
      set((s) => {
        const existing = s.byProject[projectId] ?? [];
        return {
          byProject: { ...s.byProject, [projectId]: [wt, ...existing] },
          creatingSetupByProject: (() => {
            const next = new Set(s.creatingSetupByProject);
            next.delete(projectId);
            return next;
          })(),
          error: null,
        };
      });
      if (wt.pokemon !== null && NOTABLE_RARITIES.has(wt.pokemon.rarity)) {
        const rarity =
          wt.pokemon.rarity.charAt(0).toUpperCase() +
          wt.pokemon.rarity.slice(1);
        toastManager.add({
          title: `${rarity} unlock!`,
          description: `${wt.pokemon.name} joined your Pokédex`,
          type: "success",
        });
      }
      // Setup script runs in the background server-side: when it's still
      // 'running', poll for completion before considering auto-run; otherwise
      // the status is already terminal and we can decide immediately.
      if (wt.setupStatus === "running") {
        void pollSetupUntilDone(projectId, wt.id);
      } else {
        void maybeAutoRun(projectId, wt);
      }
      return wt;
    } catch (err) {
      set((s) => {
        const next = new Set(s.creatingSetupByProject);
        next.delete(projectId);
        return { creatingSetupByProject: next, error: formatError(err) };
      });
      return null;
    }
  },
  rerunSetup: async (projectId, worktreeId) => {
    set((s) => {
      const next = new Set(s.setupPending);
      next.add(worktreeId);
      return { setupPending: next };
    });
    try {
      const client = await getRpcClient();
      const wt = await Effect.runPromise(
        client.worktree.rerunSetup({ worktreeId }),
      );
      set((s) => {
        const list = s.byProject[projectId] ?? [];
        return {
          byProject: {
            ...s.byProject,
            [projectId]: list.map((existing) =>
              existing.id === wt.id ? wt : existing,
            ),
          },
          setupPending: (() => {
            const next = new Set(s.setupPending);
            next.delete(worktreeId);
            return next;
          })(),
          error: null,
        };
      });
      return wt;
    } catch (err) {
      set((s) => {
        const next = new Set(s.setupPending);
        next.delete(worktreeId);
        return { setupPending: next, error: formatError(err) };
      });
      return null;
    }
  },
  startRun: async (worktreeId) => {
    try {
      const client = await getRpcClient();
      return await Effect.runPromise(client.worktree.startRun({ worktreeId }));
    } catch (err) {
      set({ error: formatError(err) });
      return null;
    }
  },
  remove: async (projectId, worktreeId, force) => {
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.worktree.remove({ worktreeId, force }));
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
): ReadonlyArray<Worktree> =>
  useWorktreesStore.getState().byProject[projectId] ?? [];
