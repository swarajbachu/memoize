import { ForkzeroRpcs } from "@forkzero/wire";
import { Effect, Layer } from "effect";

import { FolderPicker } from "./services/folder-picker.ts";
import { WorkspaceService } from "./services/workspace-service.ts";

const Add = ForkzeroRpcs.toLayerHandler("workspace.add", ({ path }) =>
  Effect.flatMap(WorkspaceService, (ws) => ws.add(path)),
);

const List = ForkzeroRpcs.toLayerHandler("workspace.list", () =>
  Effect.flatMap(WorkspaceService, (ws) => ws.list()),
);

const Remove = ForkzeroRpcs.toLayerHandler(
  "workspace.remove",
  ({ folderId }) =>
    Effect.flatMap(WorkspaceService, (ws) => ws.remove(folderId)),
);

// Folder picking is a host-shell operation. The server only knows the tag —
// the Electron shim (or any other host) provides the live impl. Keeps this
// handler — and apps/server as a whole — free of UI-toolkit imports.
const PickFolder = ForkzeroRpcs.toLayerHandler("workspace.pickFolder", () =>
  Effect.flatMap(FolderPicker, (picker) => picker.pick()),
);

const GetSelected = ForkzeroRpcs.toLayerHandler("workspace.getSelected", () =>
  Effect.flatMap(WorkspaceService, (ws) => ws.getSelected()),
);

const SetSelected = ForkzeroRpcs.toLayerHandler(
  "workspace.setSelected",
  ({ folderId }) =>
    Effect.flatMap(WorkspaceService, (ws) => ws.setSelected(folderId)),
);

export const WorkspaceHandlersLayer = Layer.mergeAll(
  Add,
  List,
  Remove,
  PickFolder,
  GetSelected,
  SetSelected,
);
