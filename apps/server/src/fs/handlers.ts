import { ForkzeroRpcs } from "@forkzero/wire";
import { Effect, Layer } from "effect";

import { FsService } from "./services/fs-service.ts";

const Tree = ForkzeroRpcs.toLayerHandler(
  "fs.tree",
  ({ folderId, path, worktreeId }) =>
    Effect.flatMap(FsService, (svc) =>
      svc.tree(folderId, path ?? "", worktreeId ?? null),
    ),
);

const ReadFile = ForkzeroRpcs.toLayerHandler(
  "fs.readFile",
  ({ folderId, path, worktreeId }) =>
    Effect.flatMap(FsService, (svc) =>
      svc.readFile(folderId, path, worktreeId ?? null),
    ),
);

const WriteFile = ForkzeroRpcs.toLayerHandler(
  "fs.writeFile",
  ({ folderId, path, content, expectedMtime, worktreeId }) =>
    Effect.flatMap(FsService, (svc) =>
      svc.writeFile(folderId, path, content, expectedMtime, worktreeId ?? null),
    ),
);

export const FsHandlersLayer = Layer.mergeAll(Tree, ReadFile, WriteFile);
