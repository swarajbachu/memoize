import { NodeContext } from "@effect/platform-node";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import type { WebContents } from "electron";
import { Layer } from "effect";

import { ForkzeroRpcs } from "@forkzero/wire";

import { electronServerProtocolLayer } from "./ipc/electron-server-protocol.ts";
import { PingHandlersLayer } from "./services/ping/handlers.ts";

/**
 * Compose every Layer the main process needs and return a single Layer the
 * boot script can run via `Layer.launch`. The webContents is supplied by
 * `main.ts` after the BrowserWindow exists — protocol routing is bound to it.
 */
export const makeMainLayer = (webContents: WebContents) => {
  const ProtocolLayer = electronServerProtocolLayer(webContents).pipe(
    Layer.provide(RpcSerialization.layerJson),
  );
  const ServerLayer = RpcServer.layer(ForkzeroRpcs).pipe(
    Layer.provide(PingHandlersLayer),
    Layer.provide(ProtocolLayer),
  );
  return Layer.mergeAll(ServerLayer, NodeContext.layer);
};
