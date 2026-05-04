import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { FolderId } from "./ids.ts";

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
  payload: Schema.Struct({ folderId: FolderId }),
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

export class GitPrInfo extends Schema.Class<GitPrInfo>("GitPrInfo")({
  state: GitPrState,
  branch: Schema.NullOr(Schema.String),
  baseBranch: Schema.NullOr(Schema.String),
  additions: Schema.Number,
  deletions: Schema.Number,
  number: Schema.NullOr(Schema.Number),
  url: Schema.NullOr(Schema.String),
}) {}

export const GitPrStateRpc = Rpc.make("git.prState", {
  payload: Schema.Struct({ folderId: FolderId }),
  success: GitPrInfo,
  error: GitErrors,
});
