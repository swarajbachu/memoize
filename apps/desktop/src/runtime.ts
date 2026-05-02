import { NodeContext } from "@effect/platform-node";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import type { WebContents } from "electron";
import { Layer } from "effect";

import { ForkzeroRpcs } from "@forkzero/wire";

import { AppPaths } from "./app-paths.ts";
import { electronServerProtocolLayer } from "./ipc/electron-server-protocol.ts";
import { PingHandlersLayer } from "./services/ping/handlers.ts";
import { WorkspaceHandlersLayer } from "./services/workspace/workspace-handlers.ts";
import { WorkspaceService } from "./services/workspace/workspace-service.ts";

/**
 * Compose every Layer the main process needs and return a single Layer the
 * boot script can run via `Layer.launch`. The webContents is supplied by
 * `main.ts` after the BrowserWindow exists — protocol routing is bound to it.
 * `userData` is the Electron `app.getPath("userData")` directory; services
 * receive it via the `AppPaths` tag rather than importing electron themselves.
 */
export const makeMainLayer = (webContents: WebContents, userData: string) => {
  const ProtocolLayer = electronServerProtocolLayer(webContents).pipe(
    Layer.provide(RpcSerialization.layerJson),
  );

  const AppPathsLayer = Layer.succeed(AppPaths, { userData });

  const WorkspaceLayer = WorkspaceService.Default.pipe(
    Layer.provide(NodeContext.layer),
    Layer.provide(AppPathsLayer),
  );

  const HandlersLayer = Layer.mergeAll(
    PingHandlersLayer,
    WorkspaceHandlersLayer,
  ).pipe(Layer.provide(WorkspaceLayer));

  const ServerLayer = RpcServer.layer(ForkzeroRpcs).pipe(
    Layer.provide(HandlersLayer),
    Layer.provide(ProtocolLayer),
  );

  return Layer.mergeAll(ServerLayer, NodeContext.layer);
};
