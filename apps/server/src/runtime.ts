import { NodeContext } from "@effect/platform-node";
import { RpcServer } from "@effect/rpc";
import { Layer } from "effect";

import { ForkzeroRpcs } from "@forkzero/wire";

import { AppPaths } from "./app-paths.ts";
import { GitServiceLive } from "./git/layers/git-service.ts";
import { HandlersLayer } from "./handlers.ts";
import { ProviderServiceLive } from "./provider/layers/provider-service.ts";
import { PtyServiceLive } from "./pty/layers/pty-service.ts";
import { FolderPicker } from "./workspace/services/folder-picker.ts";
import { WorkspaceServiceLive } from "./workspace/layers/workspace-service.ts";

/**
 * Inputs to `makeMainLayer`. The host shell (today: Electron in
 * `apps/desktop`) supplies these — `apps/server` itself imports nothing
 * UI-toolkit-specific. See ADR 0007 for the rules that make WS extraction
 * cheap later.
 *
 * - `userData`: where persistence files (workspaces.json, future sessions)
 *   live. Electron resolves this from `app.getPath("userData")`; a headless
 *   server resolves it from `XDG_DATA_HOME` or a CLI flag.
 * - `folderPicker`: a callback returning the user-chosen path. Electron
 *   wraps `dialog.showOpenDialog`; a headless server returns null (or
 *   forwards the prompt to a connected client).
 * - `serverProtocol`: the RPC transport. Electron supplies an in-process
 *   IPC protocol; the future WS server will supply a WebSocket protocol.
 */
export interface MainLayerDeps {
  readonly userData: string;
  readonly folderPicker: typeof FolderPicker.Service;
  readonly serverProtocol: Layer.Layer<RpcServer.Protocol>;
}

/**
 * Compose every Layer the server needs and return a single Layer the host
 * can run via `Layer.launch`. Pure factory — no electron, no transport
 * wiring inside this module.
 */
export const makeMainLayer = (deps: MainLayerDeps) => {
  const AppPathsLayer = Layer.succeed(AppPaths, { userData: deps.userData });
  const FolderPickerLayer = Layer.succeed(FolderPicker, deps.folderPicker);

  const WorkspaceLayer = WorkspaceServiceLive.pipe(
    Layer.provide(NodeContext.layer),
    Layer.provide(AppPathsLayer),
  );

  // GitService yields WorkspaceService for folderId → path resolution and
  // CommandExecutor (via NodeContext) for spawning git. Provide both.
  const GitLayer = GitServiceLive.pipe(
    Layer.provide(WorkspaceLayer),
    Layer.provide(NodeContext.layer),
  );

  // ProviderService probes installed CLIs via CommandExecutor.
  const ProviderLayer = ProviderServiceLive.pipe(
    Layer.provide(NodeContext.layer),
  );

  const Handlers = HandlersLayer.pipe(
    Layer.provide(WorkspaceLayer),
    Layer.provide(PtyServiceLive),
    Layer.provide(GitLayer),
    Layer.provide(ProviderLayer),
    Layer.provide(FolderPickerLayer),
  );

  const ServerLayer = RpcServer.layer(ForkzeroRpcs).pipe(
    Layer.provide(Handlers),
    Layer.provide(deps.serverProtocol),
  );

  return Layer.mergeAll(ServerLayer, NodeContext.layer);
};
