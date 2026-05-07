import { ForkzeroRpcs } from "@forkzero/wire";
import { Effect, Layer } from "effect";

import { WorktreeService } from "./services/worktree-service.ts";

const Create = ForkzeroRpcs.toLayerHandler(
  "worktree.create",
  ({ projectId }) =>
    Effect.flatMap(WorktreeService, (svc) => svc.create(projectId)),
);

const List = ForkzeroRpcs.toLayerHandler("worktree.list", ({ projectId }) =>
  Effect.flatMap(WorktreeService, (svc) => svc.list(projectId)),
);

const Get = ForkzeroRpcs.toLayerHandler("worktree.get", ({ worktreeId }) =>
  Effect.flatMap(WorktreeService, (svc) => svc.get(worktreeId)),
);

const Remove = ForkzeroRpcs.toLayerHandler(
  "worktree.remove",
  ({ worktreeId, force }) =>
    Effect.flatMap(WorktreeService, (svc) => svc.remove(worktreeId, force ?? false)),
);

export const WorktreeHandlersLayer = Layer.mergeAll(Create, List, Get, Remove);
