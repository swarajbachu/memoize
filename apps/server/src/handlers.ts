import { Layer } from "effect";

import { AttachmentHandlersLayer } from "./attachment/handlers.ts";
import { FsHandlersLayer } from "./fs/handlers.ts";
import { GitHandlersLayer } from "./git/handlers.ts";
import { PingHandlersLayer } from "./ping/handlers.ts";
import { ProviderHandlersLayer } from "./provider/handlers.ts";
import { PtyHandlersLayer } from "./pty/handlers.ts";
import { WorkspaceHandlersLayer } from "./workspace/handlers.ts";

/**
 * Top-level merge of every domain's RPC handlers. New domains add a line
 * here — service composition (which Layer satisfies which yield) is wired in
 * `runtime.ts`. Keeping this list narrow prevents transport-bound code from
 * sneaking into the handler boundary.
 */
export const HandlersLayer = Layer.mergeAll(
  PingHandlersLayer,
  WorkspaceHandlersLayer,
  PtyHandlersLayer,
  GitHandlersLayer,
  ProviderHandlersLayer,
  FsHandlersLayer,
  AttachmentHandlersLayer,
);
