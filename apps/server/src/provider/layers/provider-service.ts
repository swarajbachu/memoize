import { CommandExecutor } from "@effect/platform";
import { Effect, Layer, Stream } from "effect";

import { type AgentAvailability, type ProviderId } from "@forkzero/wire";

import { probeAllProviders } from "../availability.ts";
import { CredentialsService } from "../services/credentials-service.ts";
import { ProviderService } from "../services/provider-service.ts";

/**
 * Live `ProviderService`. Today `availability()` and `setCredential()` are
 * reachable — they're the methods bound in `provider/handlers.ts`. The
 * session-lifecycle methods (`start`/`send`/`interrupt`/`close`/`events`) are
 * placeholders that die if called; they aren't reachable through the wire
 * because their RPCs aren't registered in `ForkzeroRpcs` yet (PR 5/6 wires
 * them).
 */
export const ProviderServiceLive = Layer.effect(
  ProviderService,
  Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;
    const credentials = yield* CredentialsService;

    const availability = () =>
      Effect.gen(function* () {
        const list = yield* probeAllProviders.pipe(
          Effect.provideService(CommandExecutor.CommandExecutor, executor),
        );
        // listConfigured is best-effort — a keychain failure here shouldn't
        // wipe out the CLI-installed picture, since the launcher still works
        // for spawn-CLI without an API key.
        const configured = yield* credentials.listConfigured().pipe(
          Effect.catchAll(() =>
            Effect.succeed([] as ReadonlyArray<ProviderId>),
          ),
        );
        const configuredSet = new Set<ProviderId>(configured);
        return list.map(
          (a): AgentAvailability => ({
            ...a,
            sdkConfigured: configuredSet.has(a.providerId),
          }),
        );
      });

    const notImplemented = Effect.die(
      "ProviderService session methods are not implemented yet (PR 5+)",
    );

    return {
      availability,
      start: () => notImplemented as never,
      send: () => notImplemented as never,
      interrupt: () => notImplemented as never,
      close: () => notImplemented as never,
      events: () =>
        Stream.die("ProviderService.events not implemented yet (PR 5+)"),
      setCredential: (providerId, apiKey) => credentials.set(providerId, apiKey),
    };
  }),
);
