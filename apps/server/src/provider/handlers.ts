import { CredentialStoreError, ForkzeroRpcs, type ProviderId } from "@forkzero/wire";
import { Effect, Layer } from "effect";

import { ProviderService } from "./services/provider-service.ts";

/**
 * Provider-domain RPC handlers. Each subsequent PR adds a `toLayerHandler`
 * here as it registers its RPC into `ForkzeroRpcs` (in `@forkzero/wire`):
 *
 *   PR 3 — `agent.availability`         ← here
 *   PR 4 — `agent.setCredential`        ← here
 *   PR 5/6 — `agent.start` / `send` / `interrupt` / `close` / `events`
 */
const Availability = ForkzeroRpcs.toLayerHandler("agent.availability", () =>
  Effect.flatMap(ProviderService, (svc) => svc.availability()),
);

const SetCredential = ForkzeroRpcs.toLayerHandler(
  "agent.setCredential",
  ({ providerId, apiKey }) =>
    Effect.flatMap(ProviderService, (svc) =>
      svc.setCredential(providerId, apiKey).pipe(
        Effect.catchTag("CredentialsError", (err) =>
          Effect.fail(
            new CredentialStoreError({
              providerId: err.providerId as ProviderId,
              reason: err.reason,
            }),
          ),
        ),
      ),
    ),
);

export const ProviderHandlersLayer = Layer.mergeAll(Availability, SetCredential);
