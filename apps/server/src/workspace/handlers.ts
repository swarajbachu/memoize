import { MemoizeRpcs } from "@memoize/wire";
import { Effect, Layer } from "effect";

import { FileSearchService } from "./services/file-search.ts";
import { FolderPicker } from "./services/folder-picker.ts";
import { WorkspaceService } from "./services/workspace-service.ts";

const Add = MemoizeRpcs.toLayerHandler("workspace.add", ({ path }) =>
  Effect.flatMap(WorkspaceService, (ws) => ws.add(path)),
);

const List = MemoizeRpcs.toLayerHandler("workspace.list", () =>
  Effect.flatMap(WorkspaceService, (ws) => ws.list()),
);

const Remove = MemoizeRpcs.toLayerHandler(
  "workspace.remove",
  ({ folderId }) =>
    Effect.flatMap(WorkspaceService, (ws) => ws.remove(folderId)),
);

// Folder picking is a host-shell operation. The server only knows the tag —
// the Electron shim (or any other host) provides the live impl. Keeps this
// handler — and apps/server as a whole — free of UI-toolkit imports.
const PickFolder = MemoizeRpcs.toLayerHandler("workspace.pickFolder", () =>
  Effect.flatMap(FolderPicker, (picker) => picker.pick()),
);

const GetSelected = MemoizeRpcs.toLayerHandler("workspace.getSelected", () =>
  Effect.flatMap(WorkspaceService, (ws) => ws.getSelected()),
);

const SetSelected = MemoizeRpcs.toLayerHandler(
  "workspace.setSelected",
  ({ folderId }) =>
    Effect.flatMap(WorkspaceService, (ws) => ws.setSelected(folderId)),
);

const SearchFiles = MemoizeRpcs.toLayerHandler(
  "workspace.searchFiles",
  ({ projectId, query, limit, worktreeId }) =>
    Effect.flatMap(FileSearchService, (svc) =>
      svc.search(projectId, query, limit, worktreeId ?? null),
    ),
);

export const WorkspaceHandlersLayer = Layer.mergeAll(
  Add,
  List,
  Remove,
  PickFolder,
  GetSelected,
  SetSelected,
  SearchFiles,
);
