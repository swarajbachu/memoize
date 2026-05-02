import { ForkzeroRpcs, PingResult } from "@forkzero/wire";
import { Effect } from "effect";

/**
 * Phase-1 smoke-test handlers. Returns `pong` plus the time the main process
 * received the request — proves the RPC pipe is end-to-end wired.
 */
export const PingHandlersLayer = ForkzeroRpcs.toLayer(
  Effect.succeed({
    "ping.ping": () =>
      Effect.succeed(
        PingResult.make({ message: "pong", receivedAt: new Date() }),
      ),
  }),
);
