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
