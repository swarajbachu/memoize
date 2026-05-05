import { Context, type Effect } from "effect";

import {
  type FolderId,
  type FsFolderNotFoundError,
} from "@forkzero/wire";

export interface FileSearchHit {
  readonly relPath: string;
  readonly absPath: string;
  readonly kind: "file" | "directory";
}

export interface FileSearchServiceShape {
  /**
   * Search the project tree for entries whose basename or relative path
   * contains `query` (case-insensitive). Skips `.git`, `node_modules`, and
   * other heavyweight directories. Caps results at `limit` (default 20).
   * An empty `query` returns the first `limit` entries from a depth-first
   * walk — handy as a "what's in here" view when the popover first opens.
   */
  readonly search: (
    folderId: FolderId,
    query: string,
    limit?: number,
  ) => Effect.Effect<ReadonlyArray<FileSearchHit>, FsFolderNotFoundError>;
}

export class FileSearchService extends Context.Tag("forkzero/FileSearchService")<
  FileSearchService,
  FileSearchServiceShape
>() {}
