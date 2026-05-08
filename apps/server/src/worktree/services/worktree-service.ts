import { Context, type Effect } from "effect";

import {
  type FolderId,
  type Worktree,
  type WorktreeCreateError,
  type WorktreeDirtyError,
  type WorktreeId,
  type WorktreeNotFoundError,
  type WorktreeRemoveError,
} from "@memoize/wire";

export interface WorktreeServiceShape {
  readonly create: (
    projectId: FolderId,
  ) => Effect.Effect<Worktree, WorktreeCreateError>;
  readonly list: (
    projectId: FolderId,
  ) => Effect.Effect<ReadonlyArray<Worktree>>;
  readonly get: (
    worktreeId: WorktreeId,
  ) => Effect.Effect<Worktree | null>;
  readonly remove: (
    worktreeId: WorktreeId,
    force: boolean,
  ) => Effect.Effect<
    void,
    WorktreeNotFoundError | WorktreeDirtyError | WorktreeRemoveError
  >;
}

export class WorktreeService extends Context.Tag("memoize/WorktreeService")<
  WorktreeService,
  WorktreeServiceShape
>() {}
