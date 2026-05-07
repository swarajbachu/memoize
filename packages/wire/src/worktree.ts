import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { FolderId, WorktreeId } from "./ids.ts";

/**
 * A git worktree owned by forkzero. Lives at `<repoPath>/.forkzero/repo-worktree/<name>/`
 * by default; the user can override the base dir per-repo. Branch is always
 * `forkzero/<name>` so the `forkzero/` prefix lets users grep their git
 * branch list cleanly.
 */
export class Worktree extends Schema.Class<Worktree>("Worktree")({
  id: WorktreeId,
  projectId: FolderId,
  path: Schema.String,
  name: Schema.String,
  branch: Schema.String,
  baseBranch: Schema.String,
  createdAt: Schema.DateFromString,
}) {}

export class WorktreeNotFoundError extends Schema.TaggedError<WorktreeNotFoundError>()(
  "WorktreeNotFoundError",
  { worktreeId: WorktreeId },
) {}

export class WorktreeCreateError extends Schema.TaggedError<WorktreeCreateError>()(
  "WorktreeCreateError",
  { projectId: FolderId, reason: Schema.String },
) {}

export class WorktreeRemoveError extends Schema.TaggedError<WorktreeRemoveError>()(
  "WorktreeRemoveError",
  { worktreeId: WorktreeId, reason: Schema.String },
) {}

export class WorktreeDirtyError extends Schema.TaggedError<WorktreeDirtyError>()(
  "WorktreeDirtyError",
  { worktreeId: WorktreeId },
) {}

const WorktreeErrors = Schema.Union(
  WorktreeCreateError,
  WorktreeRemoveError,
  WorktreeNotFoundError,
  WorktreeDirtyError,
);

export const WorktreeCreateRpc = Rpc.make("worktree.create", {
  payload: Schema.Struct({ projectId: FolderId }),
  success: Worktree,
  error: WorktreeCreateError,
});

export const WorktreeListRpc = Rpc.make("worktree.list", {
  payload: Schema.Struct({ projectId: FolderId }),
  success: Schema.Array(Worktree),
});

export const WorktreeGetRpc = Rpc.make("worktree.get", {
  payload: Schema.Struct({ worktreeId: WorktreeId }),
  success: Schema.NullOr(Worktree),
});

/**
 * Remove a worktree's checkout. By default refuses to delete a dirty
 * worktree (`WorktreeDirtyError`); callers pass `force: true` after
 * confirming with the user. The branch is preserved either way — v1 doesn't
 * auto-delete branches.
 */
export const WorktreeRemoveRpc = Rpc.make("worktree.remove", {
  payload: Schema.Struct({
    worktreeId: WorktreeId,
    force: Schema.optional(Schema.Boolean),
  }),
  success: Schema.Void,
  error: WorktreeErrors,
});
