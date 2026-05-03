import { CommandExecutor } from "@effect/platform";
import { Effect, Layer, Stream } from "effect";

import { probeAllProviders } from "../availability.ts";
import { ProviderService } from "../services/provider-service.ts";

/**
 * Live `ProviderService`. Today only `availability()` is reachable — it's the
 * only method bound in `provider/handlers.ts`. The session-lifecycle methods
 * (`start`/`send`/`interrupt`/`close`/`events`) are placeholders that die if
 * called; they aren't reachable through the wire because their RPCs aren't
 * registered in `ForkzeroRpcs` yet (PR 5/6 wires them).
 */
export const ProviderServiceLive = Layer.effect(
  ProviderService,
  Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;

    const availability = () =>
      probeAllProviders.pipe(Effect.provideService(CommandExecutor.CommandExecutor, executor));

    const notImplemented = Effect.die(
      "ProviderService session methods are not implemented yet (PR 5+)",
    );

    return {
      availability,
      start: () => notImplemented as never,
      send: () => notImplemented as never,
      interrupt: () => notImplemented as never,
      close: () => notImplemented as never,
      events: () => Stream.die("ProviderService.events not implemented yet (PR 5+)"),
      setCredential: () => notImplemented as never,
    };
  }),
);
