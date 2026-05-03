import { CredentialStoreError, ForkzeroRpcs, type ProviderId } from "@forkzero/wire";
import { Effect, Layer, Stream } from "effect";

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

const Start = ForkzeroRpcs.toLayerHandler("agent.start", (input) =>
  Effect.flatMap(ProviderService, (svc) => svc.start(input)),
);

const Send = ForkzeroRpcs.toLayerHandler("agent.send", ({ sessionId, text }) =>
  Effect.flatMap(ProviderService, (svc) => svc.send(sessionId, text)),
);

const Interrupt = ForkzeroRpcs.toLayerHandler(
  "agent.interrupt",
  ({ sessionId, turnId }) =>
    Effect.flatMap(ProviderService, (svc) => svc.interrupt(sessionId, turnId)),
);

const Close = ForkzeroRpcs.toLayerHandler("agent.close", ({ sessionId }) =>
  Effect.flatMap(ProviderService, (svc) => svc.close(sessionId)),
);

const Events = ForkzeroRpcs.toLayerHandler("agent.events", ({ sessionId }) =>
  Stream.unwrap(
    Effect.map(ProviderService, (svc) => svc.events(sessionId)),
  ),
);

export const ProviderHandlersLayer = Layer.mergeAll(
  Availability,
  SetCredential,
  Start,
  Send,
  Interrupt,
  Close,
  Events,
);
