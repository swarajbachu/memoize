import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { FolderId, WorktreeId } from "./ids.ts";

export class GitCommit extends Schema.Class<GitCommit>("GitCommit")({
  sha: Schema.String,
  shortSha: Schema.String,
  subject: Schema.String,
  authorName: Schema.String,
  authoredAt: Schema.DateFromString,
  parents: Schema.Array(Schema.String),
}) {}

export class GitStatusSummary extends Schema.Class<GitStatusSummary>(
  "GitStatusSummary",
)({
  branch: Schema.NullOr(Schema.String),
  ahead: Schema.Number,
  behind: Schema.Number,
  dirtyFiles: Schema.Number,
}) {}

export class GitNotARepoError extends Schema.TaggedError<GitNotARepoError>()(
  "GitNotARepoError",
  { folderId: FolderId },
) {}

export class GitNotInstalledError extends Schema.TaggedError<GitNotInstalledError>()(
  "GitNotInstalledError",
  {},
) {}

export class GitCommandError extends Schema.TaggedError<GitCommandError>()(
  "GitCommandError",
  { folderId: FolderId, reason: Schema.String },
) {}

export class GitFolderNotFoundError extends Schema.TaggedError<GitFolderNotFoundError>()(
  "GitFolderNotFoundError",
  { folderId: FolderId },
) {}

const GitErrors = Schema.Union(
  GitNotARepoError,
  GitNotInstalledError,
  GitCommandError,
  GitFolderNotFoundError,
);

export const GitLogRpc = Rpc.make("git.log", {
  payload: Schema.Struct({ folderId: FolderId, limit: Schema.Number }),
  success: Schema.Array(GitCommit),
  error: GitErrors,
});

export const GitStatusRpc = Rpc.make("git.status", {
  payload: Schema.Struct({
    folderId: FolderId,
    /**
     * When set, run `git status` inside the worktree path so the branch +
     * dirty/ahead counts reflect the worktree, not the main checkout.
     */
    worktreeId: Schema.optional(Schema.NullOr(WorktreeId)),
  }),
  success: GitStatusSummary,
  error: GitErrors,
});

export const GitHeadChangedRpc = Rpc.make("git.headChanged", {
  payload: Schema.Struct({ folderId: FolderId }),
  success: Schema.Struct({ sha: Schema.String }),
  error: GitErrors,
  stream: true,
});

export class GitOriginInfo extends Schema.Class<GitOriginInfo>("GitOriginInfo")(
  {
    host: Schema.String,
    owner: Schema.String,
    repo: Schema.String,
  },
) {}

export const GitOriginRpc = Rpc.make("git.origin", {
  payload: Schema.Struct({ folderId: FolderId }),
  success: Schema.NullOr(GitOriginInfo),
  error: GitErrors,
});

/**
 * State of the GitHub PR (if any) opened from the folder's current HEAD branch
 * against its upstream. `gh pr view --json state,additions,deletions,...` is
 * the source of truth — when `gh` is missing or no PR exists, this returns
 * `{ state: "none" }` and the renderer falls back to a plain timestamp.
 */
export const GitPrState = Schema.Literal("none", "open", "closed", "merged");
export type GitPrState = typeof GitPrState.Type;

/**
 * Aggregated CI rollup status for the PR's HEAD commit.
 *   none    — PR has no required checks, or `gh` couldn't read the rollup.
 *   pending — at least one check still running / queued.
 *   success — all checks passed.
 *   failure — at least one check failed (cancelled / errored counts as fail).
 */
export const GitPrChecks = Schema.Literal(
  "none",
  "pending",
  "success",
  "failure",
);
export type GitPrChecks = typeof GitPrChecks.Type;

export class GitPrInfo extends Schema.Class<GitPrInfo>("GitPrInfo")({
  state: GitPrState,
  branch: Schema.NullOr(Schema.String),
  baseBranch: Schema.NullOr(Schema.String),
  additions: Schema.Number,
  deletions: Schema.Number,
  number: Schema.NullOr(Schema.Number),
  url: Schema.NullOr(Schema.String),
  isDraft: Schema.Boolean,
  checks: GitPrChecks,
}) {}

export const GitPrStateRpc = Rpc.make("git.prState", {
  payload: Schema.Struct({
    folderId: FolderId,
    /**
     * When set, runs `gh pr view` inside the worktree's path so the result
     * reflects the worktree's branch — each worktree has its own branch,
     * each branch has its own PR (or none).
     */
    worktreeId: Schema.optional(Schema.NullOr(WorktreeId)),
  }),
  success: GitPrInfo,
  error: GitErrors,
});

export class GitPrComment extends Schema.Class<GitPrComment>("GitPrComment")({
  author: Schema.String,
  body: Schema.String,
  createdAt: Schema.DateFromString,
}) {}

export const GitPrReviewState = Schema.Literal(
  "approved",
  "changes_requested",
  "commented",
  "dismissed",
  "pending",
);
export type GitPrReviewState = typeof GitPrReviewState.Type;

export class GitPrReview extends Schema.Class<GitPrReview>("GitPrReview")({
  author: Schema.String,
  state: GitPrReviewState,
  body: Schema.String,
  submittedAt: Schema.NullOr(Schema.DateFromString),
}) {}

export class GitPrFile extends Schema.Class<GitPrFile>("GitPrFile")({
  path: Schema.String,
  additions: Schema.Number,
  deletions: Schema.Number,
}) {}

export const GitPrCheckRunStatus = Schema.Literal(
  "queued",
  "in_progress",
  "completed",
  "pending",
);
export type GitPrCheckRunStatus = typeof GitPrCheckRunStatus.Type;

export const GitPrCheckRunConclusion = Schema.Literal(
  "success",
  "failure",
  "cancelled",
  "skipped",
  "neutral",
  "timed_out",
  "action_required",
);
export type GitPrCheckRunConclusion = typeof GitPrCheckRunConclusion.Type;

export class GitPrCheckRun extends Schema.Class<GitPrCheckRun>("GitPrCheckRun")({
  name: Schema.String,
  status: GitPrCheckRunStatus,
  conclusion: Schema.NullOr(GitPrCheckRunConclusion),
  url: Schema.NullOr(Schema.String),
}) {}

/**
 * Heavier per-PR payload than {@link GitPrInfo}: title, body, reviews, comments,
 * files changed, and the per-run check breakdown. Fetched lazily when the PR
 * pane is open — `git.prState` keeps its lightweight contract for the sidebar.
 */
export class GitPrDetails extends Schema.Class<GitPrDetails>("GitPrDetails")({
  state: GitPrState,
  number: Schema.NullOr(Schema.Number),
  url: Schema.NullOr(Schema.String),
  isDraft: Schema.Boolean,
  checks: GitPrChecks,
  additions: Schema.Number,
  deletions: Schema.Number,
  title: Schema.String,
  body: Schema.String,
  author: Schema.String,
  baseBranch: Schema.NullOr(Schema.String),
  headBranch: Schema.NullOr(Schema.String),
  comments: Schema.Array(GitPrComment),
  reviews: Schema.Array(GitPrReview),
  files: Schema.Array(GitPrFile),
  checkRuns: Schema.Array(GitPrCheckRun),
}) {}

export const GitPrDetailsRpc = Rpc.make("git.prDetails", {
  payload: Schema.Struct({
    folderId: FolderId,
    worktreeId: Schema.optional(Schema.NullOr(WorktreeId)),
  }),
  success: GitPrDetails,
  error: GitErrors,
});

/**
 * One entry from `git status --porcelain=v2`. `staged` means the index has
 * changes (X column ≠ '.'); `kind` is the dominant working-tree state. We
 * collapse renames/copies to a path that matches the working-tree side so the
 * Diff tab can wire a click to "open this file in the editor."
 */
export const GitChangeKind = Schema.Literal(
  "modified",
  "added",
  "deleted",
  "renamed",
  "copied",
  "untracked",
  "ignored",
  "unmerged",
  "type_changed",
);
export type GitChangeKind = typeof GitChangeKind.Type;

export class GitChange extends Schema.Class<GitChange>("GitChange")({
  path: Schema.String,
  /**
   * Original path for renamed / copied files (the location HEAD knew the
   * file under). `null` for every other kind. Lets the renderer surface
   * "old → new" so a move doesn't silently look like an unrelated edit.
   */
  oldPath: Schema.NullOr(Schema.String),
  staged: Schema.Boolean,
  kind: GitChangeKind,
}) {}

export const GitChangesRpc = Rpc.make("git.changes", {
  payload: Schema.Struct({
    folderId: FolderId,
    worktreeId: Schema.optional(Schema.NullOr(WorktreeId)),
  }),
  success: Schema.Array(GitChange),
  error: GitErrors,
});

export const GitCommitRpc = Rpc.make("git.commit", {
  payload: Schema.Struct({
    folderId: FolderId,
    worktreeId: Schema.optional(Schema.NullOr(WorktreeId)),
    message: Schema.String,
  }),
  success: Schema.Struct({ sha: Schema.String }),
  error: GitErrors,
});

export const GitPushRpc = Rpc.make("git.push", {
  payload: Schema.Struct({
    folderId: FolderId,
    worktreeId: Schema.optional(Schema.NullOr(WorktreeId)),
  }),
  success: Schema.Struct({ output: Schema.String }),
  error: GitErrors,
});
