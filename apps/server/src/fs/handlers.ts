import { ForkzeroRpcs } from "@forkzero/wire";
import { Effect, Layer } from "effect";

import { FsService } from "./services/fs-service.ts";

const Tree = ForkzeroRpcs.toLayerHandler("fs.tree", ({ folderId, path }) =>
  Effect.flatMap(FsService, (svc) => svc.tree(folderId, path ?? "")),
);

const ReadFile = ForkzeroRpcs.toLayerHandler(
  "fs.readFile",
  ({ folderId, path }) =>
    Effect.flatMap(FsService, (svc) => svc.readFile(folderId, path)),
);

const WriteFile = ForkzeroRpcs.toLayerHandler(
  "fs.writeFile",
  ({ folderId, path, content, expectedMtime }) =>
    Effect.flatMap(FsService, (svc) =>
      svc.writeFile(folderId, path, content, expectedMtime),
    ),
);

export const FsHandlersLayer = Layer.mergeAll(Tree, ReadFile, WriteFile);
