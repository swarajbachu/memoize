import { Context, type Effect } from "effect";

import {
  type FolderId,
  type FsConflictError,
  type FsEntry,
  type FsFileContent,
  type FsFolderNotFoundError,
  type FsPathOutsideError,
  type FsReadError,
  type FsTooLargeError,
  type WorktreeId,
} from "@memoize/wire";

type TreeFailure = FsFolderNotFoundError | FsPathOutsideError | FsReadError;
type ReadFileFailure = TreeFailure | FsTooLargeError;
type WriteFileFailure = ReadFileFailure | FsConflictError;

export interface FsServiceShape {
  readonly tree: (
    folderId: FolderId,
    relPath: string,
    worktreeId?: WorktreeId | null,
  ) => Effect.Effect<ReadonlyArray<FsEntry>, TreeFailure>;
  readonly readFile: (
    folderId: FolderId,
    relPath: string,
    worktreeId?: WorktreeId | null,
  ) => Effect.Effect<typeof FsFileContent.Type, ReadFileFailure>;
  readonly writeFile: (
    folderId: FolderId,
    relPath: string,
    content: string,
    expectedMtime: string,
    worktreeId?: WorktreeId | null,
  ) => Effect.Effect<{ readonly mtime: string }, WriteFileFailure>;
}

export class FsService extends Context.Tag("memoize/FsService")<
  FsService,
  FsServiceShape
>() {}
