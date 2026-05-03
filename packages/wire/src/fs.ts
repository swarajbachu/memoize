import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { FolderId } from "./ids.ts";

/**
 * One entry in a directory listing — either a file or a subdirectory. The
 * `path` is forward-slash, project-root-relative; the right-pane file tree
 * uses it as both the React key and the payload for the next `fs.tree` call
 * when the user expands a directory.
 */
export class FsEntry extends Schema.Class<FsEntry>("FsEntry")({
  name: Schema.String,
  path: Schema.String,
  kind: Schema.Literal("file", "directory"),
}) {}

export class FsFolderNotFoundError extends Schema.TaggedError<FsFolderNotFoundError>()(
  "FsFolderNotFoundError",
  { folderId: FolderId },
) {}

export class FsPathOutsideError extends Schema.TaggedError<FsPathOutsideError>()(
  "FsPathOutsideError",
  { folderId: FolderId, path: Schema.String },
) {}

export class FsReadError extends Schema.TaggedError<FsReadError>()(
  "FsReadError",
  { folderId: FolderId, path: Schema.String, reason: Schema.String },
) {}

const FsErrors = Schema.Union(
  FsFolderNotFoundError,
  FsPathOutsideError,
  FsReadError,
);

/**
 * List one directory level. `path` is project-root-relative (use "" or omit
 * for the root). The right-pane tree calls this lazily as the user expands
 * directories — no recursive walk on the server. Skips `.git` and
 * `node_modules`; everything else is returned, sorted dirs-first then by name.
 */
export const FsTreeRpc = Rpc.make("fs.tree", {
  payload: Schema.Struct({
    folderId: FolderId,
    path: Schema.optional(Schema.String),
  }),
  success: Schema.Array(FsEntry),
  error: FsErrors,
});
