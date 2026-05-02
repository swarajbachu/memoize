import { NodeContext } from "@effect/platform-node";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import type { WebContents } from "electron";
import { Layer } from "effect";

import { ForkzeroRpcs } from "@forkzero/wire";

import { AppPaths } from "./app-paths.ts";
import { electronServerProtocolLayer } from "./ipc/electron-server-protocol.ts";
import { GitHandlersLayer } from "./services/git/git-handlers.ts";
import { GitService } from "./services/git/git-service.ts";
import { PingHandlersLayer } from "./services/ping/handlers.ts";
import { PtyHandlersLayer } from "./services/pty/pty-handlers.ts";
import { PtyService } from "./services/pty/pty-service.ts";
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

  // GitService yields WorkspaceService for folderId → path resolution and
  // CommandExecutor (via NodeContext) for spawning git. Provide both.
  const GitLayer = GitService.Default.pipe(
    Layer.provide(WorkspaceLayer),
    Layer.provide(NodeContext.layer),
  );

  const HandlersLayer = Layer.mergeAll(
    PingHandlersLayer,
    WorkspaceHandlersLayer,
    PtyHandlersLayer,
    GitHandlersLayer,
  ).pipe(
    Layer.provide(WorkspaceLayer),
    Layer.provide(PtyService.Default),
    Layer.provide(GitLayer),
  );

  const ServerLayer = RpcServer.layer(ForkzeroRpcs).pipe(
    Layer.provide(HandlersLayer),
    Layer.provide(ProtocolLayer),
  );

  return Layer.mergeAll(ServerLayer, NodeContext.layer);
};
