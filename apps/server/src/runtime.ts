import { NodeContext } from "@effect/platform-node";
import { RpcServer } from "@effect/rpc";
import { Layer } from "effect";

import { ForkzeroRpcs } from "@forkzero/wire";

import { AppPaths } from "./app-paths.ts";
import { GitServiceLive } from "./git/layers/git-service.ts";
import { HandlersLayer } from "./handlers.ts";
import { importWorkspacesJson } from "./persistence/import-workspaces.ts";
import { MigrationsLive } from "./persistence/migrations.ts";
import { SqliteLive } from "./persistence/sqlite.ts";
import { CredentialsServiceLive } from "./provider/layers/credentials-service.ts";
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
 * - `userData`: where persistence files (forkzero.sqlite, OS keychain) live.
 *   Electron resolves this from `app.getPath("userData")`; a headless
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

  // SqlClient is the shared persistence handle. The migrator runs once on
  // boot via `Layer.provideMerge` so any layer that consumes SqlClient sees
  // the schema already applied.
  const SqliteLayer = SqliteLive.pipe(Layer.provide(AppPathsLayer));
  const MigratedSqlite = SqliteLayer.pipe(
    Layer.provideMerge(
      MigrationsLive.pipe(Layer.provide(SqliteLayer), Layer.provide(NodeContext.layer)),
    ),
  );

  // After migrations: import any pre-existing `workspaces.json` once.
  // `provideMerge` keeps the SqlClient available downstream.
  const ImportShim = Layer.effectDiscard(importWorkspacesJson).pipe(
    Layer.provide(MigratedSqlite),
    Layer.provide(NodeContext.layer),
    Layer.provide(AppPathsLayer),
  );

  const WorkspaceLayer = WorkspaceServiceLive.pipe(
    Layer.provide(MigratedSqlite),
    Layer.provide(ImportShim),
    Layer.provide(NodeContext.layer),
  );

  // GitService yields WorkspaceService for folderId → path resolution and
  // CommandExecutor (via NodeContext) for spawning git. Provide both.
  const GitLayer = GitServiceLive.pipe(
    Layer.provide(WorkspaceLayer),
    Layer.provide(NodeContext.layer),
  );

  // ProviderService probes installed CLIs via CommandExecutor, consults
  // CredentialsService for SDK keys, and resolves folderId → cwd via
  // WorkspaceService when starting a Claude SDK session.
  const ProviderLayer = ProviderServiceLive.pipe(
    Layer.provide(CredentialsServiceLive),
    Layer.provide(WorkspaceLayer),
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
