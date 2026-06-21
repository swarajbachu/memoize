import { MemoizeRpcs } from "@memoize/wire";
import { Effect, Layer } from "effect";

import { FsService } from "./services/fs-service.ts";

const Tree = MemoizeRpcs.toLayerHandler(
  "fs.tree",
  ({ folderId, path, worktreeId }) =>
    Effect.flatMap(FsService, (svc) =>
      svc.tree(folderId, path ?? "", worktreeId ?? null),
    ),
);

const ReadFile = MemoizeRpcs.toLayerHandler(
  "fs.readFile",
  ({ folderId, path, worktreeId }) =>
    Effect.flatMap(FsService, (svc) =>
      svc.readFile(folderId, path, worktreeId ?? null),
    ),
);

const WriteFile = MemoizeRpcs.toLayerHandler(
  "fs.writeFile",
  ({ folderId, path, content, expectedMtime, worktreeId }) =>
    Effect.flatMap(FsService, (svc) =>
      svc.writeFile(folderId, path, content, expectedMtime, worktreeId ?? null),
    ),
);

const ReadExternalFile = MemoizeRpcs.toLayerHandler(
  "fs.readExternalFile",
  ({ path }) => Effect.flatMap(FsService, (svc) => svc.readExternal(path)),
);

const WriteExternalFile = MemoizeRpcs.toLayerHandler(
  "fs.writeExternalFile",
  ({ path, content, expectedMtime }) =>
    Effect.flatMap(FsService, (svc) =>
      svc.writeExternal(path, content, expectedMtime),
    ),
);

export const FsHandlersLayer = Layer.mergeAll(
  Tree,
  ReadFile,
  WriteFile,
  ReadExternalFile,
  WriteExternalFile,
);
