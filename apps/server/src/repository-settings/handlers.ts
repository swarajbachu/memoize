import { ForkzeroRpcs } from "@forkzero/wire";
import { Effect, Layer } from "effect";

import { RepositorySettingsService } from "./services/repository-settings-service.ts";

const Get = ForkzeroRpcs.toLayerHandler(
  "repository.settings.get",
  ({ projectId }) =>
    Effect.flatMap(RepositorySettingsService, (svc) => svc.get(projectId)),
);

const Update = ForkzeroRpcs.toLayerHandler(
  "repository.settings.update",
  ({ projectId, patch }) =>
    Effect.flatMap(RepositorySettingsService, (svc) =>
      svc.update(projectId, patch),
    ),
);

export const RepositorySettingsHandlersLayer = Layer.mergeAll(Get, Update);
