import { ForkzeroRpcs } from "@forkzero/wire";
import { Effect, Layer } from "effect";

import { FsService } from "./services/fs-service.ts";

const Tree = ForkzeroRpcs.toLayerHandler("fs.tree", ({ folderId, path }) =>
  Effect.flatMap(FsService, (svc) => svc.tree(folderId, path ?? "")),
);

export const FsHandlersLayer = Layer.mergeAll(Tree);
