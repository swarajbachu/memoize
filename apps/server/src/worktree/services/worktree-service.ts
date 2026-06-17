import { Context, type Effect } from "effect";

import {
  type FolderId,
  type Worktree,
  type WorktreeCreateError,
  type WorktreeDirtyError,
  type WorktreeId,
  type WorktreeNotFoundError,
  type WorktreeRemoveError,
  type WorktreeSetupError,
} from "@memoize/wire";

export interface WorktreeRestoreSnapshot {
  readonly id: WorktreeId;
  readonly projectId: FolderId;
  readonly path: string;
  readonly name: string;
  readonly branch: string;
  readonly baseBranch: string;
  readonly createdAt: Date;
}

export interface WorktreeServiceShape {
  readonly create: (
    projectId: FolderId,
  ) => Effect.Effect<Worktree, WorktreeCreateError>;
  readonly list: (
    projectId: FolderId,
  ) => Effect.Effect<ReadonlyArray<Worktree>>;
  readonly get: (worktreeId: WorktreeId) => Effect.Effect<Worktree | null>;
  /**
   * Update the stored `branch` for a worktree row so it tracks a `git branch
   * -m` performed elsewhere (the auto-namer renames the branch via
   * `GitService`, then calls this to keep the DB in lockstep). The on-disk
   * directory and `name` are left untouched — only the branch label moves.
   * No-op when the worktree row is absent.
   */
  readonly updateBranch: (
    worktreeId: WorktreeId,
    branch: string,
  ) => Effect.Effect<void>;
  readonly remove: (
    worktreeId: WorktreeId,
    force: boolean,
  ) => Effect.Effect<
    void,
    WorktreeNotFoundError | WorktreeDirtyError | WorktreeRemoveError
  >;
  readonly rerunSetup: (
    worktreeId: WorktreeId,
  ) => Effect.Effect<
    Worktree,
    WorktreeNotFoundError | WorktreeSetupError | WorktreeRemoveError
  >;
  readonly startRun: (
    worktreeId: WorktreeId,
  ) => Effect.Effect<
    {
      readonly cwd: string;
      readonly script: string;
      readonly env: Record<string, string>;
    },
    WorktreeNotFoundError | WorktreeSetupError
  >;
  readonly restore: (
    snapshot: WorktreeRestoreSnapshot,
  ) => Effect.Effect<Worktree, WorktreeRemoveError>;
}

export class WorktreeService extends Context.Tag("memoize/WorktreeService")<
  WorktreeService,
  WorktreeServiceShape
>() {}
