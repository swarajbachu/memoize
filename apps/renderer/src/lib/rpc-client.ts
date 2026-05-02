import { RpcClient, RpcGroup, RpcSerialization } from "@effect/rpc";
import { Effect, Layer, ManagedRuntime, Scope } from "effect";

import { ForkzeroRpcs } from "@forkzero/contracts";

import { getBridge } from "./bridge.ts";
import { electronClientProtocolLayer } from "./electron-client-protocol.ts";

/**
 * Lazy-initialized renderer-side RPC. The bridge call is deferred so this
 * module is safe to import in non-Electron contexts (Vite HMR, tests).
 *
 * The client itself needs a Scope that outlives any single RPC call — it owns
 * background fibers (response demux, error reconciliation). We hand the
 * client a long-lived scope that lives until the page unloads.
 */
type ForkzeroClient = RpcClient.RpcClient<RpcGroup.Rpcs<typeof ForkzeroRpcs>>;

let runtime: ManagedRuntime.ManagedRuntime<RpcClient.Protocol, never> | null = null;
let cachedClient: Promise<ForkzeroClient> | null = null;

function getRuntime() {
  if (runtime === null) {
    const protocolLayer = electronClientProtocolLayer(getBridge().rpc).pipe(
      Layer.provide(RpcSerialization.layerJson),
    );
    runtime = ManagedRuntime.make(protocolLayer);
  }
  return runtime;
}

export function getRpcClient(): Promise<ForkzeroClient> {
  if (cachedClient === null) {
    const rt = getRuntime();
    cachedClient = rt.runPromise(
      Effect.gen(function* () {
        const scope = yield* Scope.make();
        return yield* RpcClient.make(ForkzeroRpcs).pipe(Scope.extend(scope));
      }),
    );
  }
  return cachedClient;
}
