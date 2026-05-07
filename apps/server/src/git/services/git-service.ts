import { Context, type Effect, type Stream } from "effect";

import {
  type FolderId,
  type GitCommandError,
  type GitCommit,
  type GitFolderNotFoundError,
  type GitNotARepoError,
  type GitNotInstalledError,
  type GitOriginInfo,
  type GitPrInfo,
  type GitStatusSummary,
  type WorktreeId,
} from "@forkzero/wire";

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
  ) => Effect.Effect<GitPrInfo, GitFailure>;
}

export class GitService extends Context.Tag("forkzero/GitService")<
  GitService,
  GitServiceShape
>() {}
