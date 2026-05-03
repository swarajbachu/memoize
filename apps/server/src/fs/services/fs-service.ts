import { Context, type Effect } from "effect";

import {
  type FolderId,
  type FsEntry,
  type FsFolderNotFoundError,
  type FsPathOutsideError,
  type FsReadError,
} from "@forkzero/wire";

type FsFailure = FsFolderNotFoundError | FsPathOutsideError | FsReadError;

export interface FsServiceShape {
  readonly tree: (
    folderId: FolderId,
    relPath: string,
  ) => Effect.Effect<ReadonlyArray<FsEntry>, FsFailure>;
}

export class FsService extends Context.Tag("forkzero/FsService")<
  FsService,
  FsServiceShape
>() {}
