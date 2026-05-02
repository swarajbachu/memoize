import { ForkzeroRpcs } from "@forkzero/wire";
import { Effect, Layer, Stream } from "effect";

import { GitService } from "./git-service.ts";

const Log = ForkzeroRpcs.toLayerHandler("git.log", ({ folderId, limit }) =>
  Effect.flatMap(GitService, (svc) => svc.log(folderId, limit)),
);

const Status = ForkzeroRpcs.toLayerHandler("git.status", ({ folderId }) =>
  Effect.flatMap(GitService, (svc) => svc.status(folderId)),
);

const HeadChanged = ForkzeroRpcs.toLayerHandler(
  "git.headChanged",
  ({ folderId }) =>
    Stream.unwrap(
      Effect.map(GitService, (svc) => svc.subscribeHeadChanges(folderId)),
    ),
);

export const GitHandlersLayer = Layer.mergeAll(Log, Status, HeadChanged);
