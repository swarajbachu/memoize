import { ForkzeroRpcs } from "@forkzero/wire";
import { Effect, Layer, Stream } from "effect";

import { GitService } from "./services/git-service.ts";

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

const Origin = ForkzeroRpcs.toLayerHandler("git.origin", ({ folderId }) =>
  Effect.flatMap(GitService, (svc) => svc.origin(folderId)),
);

const PrState = ForkzeroRpcs.toLayerHandler("git.prState", ({ folderId }) =>
  Effect.flatMap(GitService, (svc) => svc.prState(folderId)),
);

const PrDetails = ForkzeroRpcs.toLayerHandler(
  "git.prDetails",
  ({ folderId }) =>
    Effect.flatMap(GitService, (svc) => svc.prDetails(folderId)),
);

const Changes = ForkzeroRpcs.toLayerHandler("git.changes", ({ folderId }) =>
  Effect.flatMap(GitService, (svc) => svc.changes(folderId)),
);

const Commit = ForkzeroRpcs.toLayerHandler(
  "git.commit",
  ({ folderId, message }) =>
    Effect.flatMap(GitService, (svc) => svc.commit(folderId, message)),
);

const Push = ForkzeroRpcs.toLayerHandler("git.push", ({ folderId }) =>
  Effect.flatMap(GitService, (svc) => svc.push(folderId)),
);

export const GitHandlersLayer = Layer.mergeAll(
  Log,
  Status,
  HeadChanged,
  Origin,
  PrState,
  PrDetails,
  Changes,
  Commit,
  Push,
);
