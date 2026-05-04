import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { FsFolderNotFoundError } from "./fs.ts";
import { FolderId } from "./ids.ts";

export class Folder extends Schema.Class<Folder>("Folder")({
  id: FolderId,
  path: Schema.String,
  name: Schema.String,
  addedAt: Schema.DateFromString,
}) {}

export class WorkspaceDuplicatePathError extends Schema.TaggedError<WorkspaceDuplicatePathError>()(
  "WorkspaceDuplicatePathError",
  { path: Schema.String },
) {}

export class WorkspaceNotFoundError extends Schema.TaggedError<WorkspaceNotFoundError>()(
  "WorkspaceNotFoundError",
  { folderId: FolderId },
) {}

export class WorkspaceInvalidPathError extends Schema.TaggedError<WorkspaceInvalidPathError>()(
  "WorkspaceInvalidPathError",
  { path: Schema.String, reason: Schema.String },
) {}

export const WorkspaceAddRpc = Rpc.make("workspace.add", {
  payload: Schema.Struct({ path: Schema.String }),
  success: Folder,
  error: Schema.Union(WorkspaceDuplicatePathError, WorkspaceInvalidPathError),
});

export const WorkspaceListRpc = Rpc.make("workspace.list", {
  payload: Schema.Struct({}),
  success: Schema.Array(Folder),
});

export const WorkspaceRemoveRpc = Rpc.make("workspace.remove", {
  payload: Schema.Struct({ folderId: FolderId }),
  success: Schema.Void,
  error: WorkspaceNotFoundError,
});

export const WorkspacePickFolderRpc = Rpc.make("workspace.pickFolder", {
  payload: Schema.Struct({}),
  success: Schema.NullOr(Schema.String),
});

export const WorkspaceGetSelectedRpc = Rpc.make("workspace.getSelected", {
  payload: Schema.Struct({}),
  success: Schema.NullOr(FolderId),
});

export const WorkspaceSetSelectedRpc = Rpc.make("workspace.setSelected", {
  payload: Schema.Struct({ folderId: Schema.NullOr(FolderId) }),
  success: Schema.Void,
});

/**
 * Walk the project's file tree honouring `.gitignore` and return up to
 * `limit` matches against `query`. Backs the composer's `@` file picker.
 * Empty `query` returns the most recently touched entries (server's call).
 */
export const WorkspaceSearchFilesRpc = Rpc.make("workspace.searchFiles", {
  payload: Schema.Struct({
    projectId: FolderId,
    query: Schema.String,
    limit: Schema.optional(Schema.Number),
  }),
  success: Schema.Array(
    Schema.Struct({
      relPath: Schema.String,
      absPath: Schema.String,
      kind: Schema.Literal("file", "directory"),
    }),
  ),
  error: FsFolderNotFoundError,
});
