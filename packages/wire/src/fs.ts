import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { FolderId, WorktreeId } from "./ids.ts";

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

export class FsTooLargeError extends Schema.TaggedError<FsTooLargeError>()(
  "FsTooLargeError",
  { folderId: FolderId, path: Schema.String, size: Schema.Number, limit: Schema.Number },
) {}

export class FsConflictError extends Schema.TaggedError<FsConflictError>()(
  "FsConflictError",
  {
    folderId: FolderId,
    path: Schema.String,
    expectedMtime: Schema.String,
    actualMtime: Schema.String,
  },
) {}

const FsErrors = Schema.Union(
  FsFolderNotFoundError,
  FsPathOutsideError,
  FsReadError,
);

const FsReadFileErrors = Schema.Union(
  FsFolderNotFoundError,
  FsPathOutsideError,
  FsReadError,
  FsTooLargeError,
);

const FsWriteFileErrors = Schema.Union(
  FsFolderNotFoundError,
  FsPathOutsideError,
  FsReadError,
  FsConflictError,
  FsTooLargeError,
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
    /**
     * When set, list inside the worktree's path instead of the project's
     * main checkout. The worktree must belong to `folderId`; otherwise the
     * server falls back to the main checkout silently.
     */
    worktreeId: Schema.optional(Schema.NullOr(WorktreeId)),
  }),
  success: Schema.Array(FsEntry),
  error: FsErrors,
});

/**
 * The shape returned by `fs.readFile`. Text files come back with their
 * UTF-8 contents and the modification time used as an optimistic-concurrency
 * token by `fs.writeFile`. Files that fail UTF-8 decoding return as
 * `kind: "binary"` so the editor can render a placeholder instead of mojibake.
 */
export const FsFileContent = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("text"),
    content: Schema.String,
    mtime: Schema.String,
    size: Schema.Number,
  }),
  Schema.Struct({
    kind: Schema.Literal("binary"),
    size: Schema.Number,
  }),
);

/**
 * Read a single file's contents. Path is project-root-relative. Files
 * larger than the server-side cap (5 MB) reject with `FsTooLargeError`;
 * non-UTF-8 files come back as `kind: "binary"`. The renderer file editor
 * stores the returned `mtime` and passes it back on `fs.writeFile` so the
 * server can reject writes when the file changed on disk underneath us.
 */
export const FsReadFileRpc = Rpc.make("fs.readFile", {
  payload: Schema.Struct({
    folderId: FolderId,
    path: Schema.String,
    worktreeId: Schema.optional(Schema.NullOr(WorktreeId)),
  }),
  success: FsFileContent,
  error: FsReadFileErrors,
});

/**
 * Write a single file. `expectedMtime` is the mtime the renderer received
 * from the most recent `fs.readFile` (or the most recent successful write).
 * If the file's mtime on disk no longer matches, the server rejects with
 * `FsConflictError` and the renderer surfaces a "file changed on disk"
 * toast. Same 5 MB cap applies to incoming content.
 */
export const FsWriteFileRpc = Rpc.make("fs.writeFile", {
  payload: Schema.Struct({
    folderId: FolderId,
    path: Schema.String,
    content: Schema.String,
    expectedMtime: Schema.String,
    worktreeId: Schema.optional(Schema.NullOr(WorktreeId)),
  }),
  success: Schema.Struct({
    mtime: Schema.String,
  }),
  error: FsWriteFileErrors,
});
