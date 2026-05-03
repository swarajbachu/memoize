import { ForkzeroRpcs } from "@forkzero/wire";
import { Effect, Layer } from "effect";

import { ProviderService } from "./services/provider-service.ts";

/**
 * Provider-domain RPC handlers. Each subsequent PR adds a `toLayerHandler` here
 * as it registers its RPC into `ForkzeroRpcs` (in `@forkzero/wire`):
 *
 *   PR 3 — `agent.availability`         ← here
 *   PR 4 — `agent.setCredential`
 *   PR 5/6 — `agent.start` / `send` / `interrupt` / `close` / `events`
 */
const Availability = ForkzeroRpcs.toLayerHandler("agent.availability", () =>
  Effect.flatMap(ProviderService, (svc) => svc.availability()),
);

export const ProviderHandlersLayer = Layer.mergeAll(Availability);
