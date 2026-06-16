import { Context, type Effect, type Stream } from "effect";

import {
  type FolderId,
  type GitChange,
  type GitCommandError,
  type GitCommit,
  type GitDiffResult,
  type GitFailingChecksArtifact,
  type GitFolderNotFoundError,
  type GitMergeMethod,
  type GitNotARepoError,
  type GitNotInstalledError,
  type GitOriginInfo,
  type GitPrDetails,
  type GitPrInfo,
  type GitStatusSummary,
  type WorktreeId,
} from "@memoize/wire";

type GitFailure =
  | GitNotARepoError
  | GitNotInstalledError
  | GitCommandError
  | GitFolderNotFoundError;

export interface GitServiceShape {
  readonly log: (
    folderId: FolderId,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<GitCommit>, GitFailure>;
  readonly status: (
    folderId: FolderId,
    worktreeId?: WorktreeId | null,
  ) => Effect.Effect<GitStatusSummary, GitFailure>;
  readonly subscribeHeadChanges: (
    folderId: FolderId,
  ) => Stream.Stream<{ readonly sha: string }, GitFailure>;
  readonly origin: (
    folderId: FolderId,
  ) => Effect.Effect<GitOriginInfo | null, GitFailure>;
  readonly prState: (
    folderId: FolderId,
    worktreeId?: WorktreeId | null,
  ) => Effect.Effect<GitPrInfo, GitFailure>;
  readonly prDetails: (
    folderId: FolderId,
    worktreeId?: WorktreeId | null,
  ) => Effect.Effect<GitPrDetails, GitFailure>;
  readonly changes: (
    folderId: FolderId,
    worktreeId?: WorktreeId | null,
  ) => Effect.Effect<ReadonlyArray<GitChange>, GitFailure>;
  readonly diff: (
    folderId: FolderId,
    path: string,
    worktreeId?: WorktreeId | null,
  ) => Effect.Effect<GitDiffResult, GitFailure>;
  readonly commit: (
    folderId: FolderId,
    message: string,
    worktreeId?: WorktreeId | null,
  ) => Effect.Effect<{ readonly sha: string }, GitFailure>;
  readonly push: (
    folderId: FolderId,
    worktreeId?: WorktreeId | null,
  ) => Effect.Effect<{ readonly output: string }, GitFailure>;
  readonly mergePr: (
    folderId: FolderId,
    action: "merge" | "enable-auto" | "disable-auto",
    method: GitMergeMethod,
    deleteBranch: boolean,
    worktreeId?: WorktreeId | null,
  ) => Effect.Effect<{ readonly output: string }, GitFailure>;
  readonly markReady: (
    folderId: FolderId,
    worktreeId?: WorktreeId | null,
  ) => Effect.Effect<{ readonly output: string }, GitFailure>;
  readonly init: (
    folderId: FolderId,
  ) => Effect.Effect<{ readonly branch: string }, GitFailure>;
  readonly fixFailingChecks: (
    folderId: FolderId,
    worktreeId?: WorktreeId | null,
  ) => Effect.Effect<GitFailingChecksArtifact, GitFailure>;
}

export class GitService extends Context.Tag("memoize/GitService")<
  GitService,
  GitServiceShape
>() {}
