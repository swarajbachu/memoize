import { ForkzeroRpcs } from "@forkzero/wire";
import { dialog } from "electron";
import { Effect, Layer } from "effect";

import { WorkspaceService } from "./workspace-service.ts";

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

const PickFolder = ForkzeroRpcs.toLayerHandler("workspace.pickFolder", () =>
  Effect.promise(() =>
    dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    }),
  ).pipe(
    Effect.map((result) =>
      result.canceled || result.filePaths.length === 0
        ? null
        : (result.filePaths[0] ?? null),
    ),
  ),
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
