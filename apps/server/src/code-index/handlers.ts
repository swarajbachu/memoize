import { MemoizeRpcs } from "@memoize/wire";
import type { FolderId, IndexStatusInfo } from "@memoize/wire";
import type { IndexStatus } from "@memoize/index";
import { Effect, Layer, Stream } from "effect";

import { WorkspaceService } from "../workspace/services/workspace-service.ts";
import { IndexRegistry, type IndexHandle } from "./services/index-registry.ts";

/**
 * Coerce the engine's `IndexStatus` shape (a plain interface) into the
 * wire-layer `IndexStatusInfo` class. The fields are 1:1 — Schema.Class
 * just needs `make` to attach the tagged constructor.
 */
const toWire = (s: IndexStatus): IndexStatusInfo =>
  ({
    state: s.state,
    branch: s.branch,
    progress: s.progress,
    stats: s.stats,
  }) as IndexStatusInfo;

/**
 * Resolve `folderId` to an `IndexHandle`. Branch defaults to "HEAD" — the
 * manifest layer treats it as a label, and Phase E will wire a real
 * git-rev-parse subscription. Folders unknown to the workspace store
 * surface as a runtime error in the handler (rare; the renderer only
 * sends ids it learned from `workspace.list`).
 */
const resolveHandle = (
  folderId: FolderId,
): Effect.Effect<IndexHandle, never, WorkspaceService | IndexRegistry> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceService;
    const folder = yield* ws.findById(folderId);
    if (folder === null) {
      return yield* Effect.die(`unknown folderId: ${folderId}`);
    }
    const registry = yield* IndexRegistry;
    return yield* registry.getHandle(folder.path, "HEAD");
  });

const Status = MemoizeRpcs.toLayerHandler("index.status", ({ folderId }) =>
  Effect.gen(function* () {
    const handle = yield* resolveHandle(folderId);
    const snapshot = yield* Effect.promise(() => handle.status());
    return toWire(snapshot);
  }),
);

const StatusStream = MemoizeRpcs.toLayerHandler(
  "index.statusStream",
  ({ folderId }) =>
    Stream.unwrap(
      Effect.map(resolveHandle(folderId), (handle) =>
        Stream.map(handle.statusStream(), toWire),
      ),
    ),
);

const Reindex = MemoizeRpcs.toLayerHandler("index.reindex", ({ folderId }) =>
  Effect.gen(function* () {
    const handle = yield* resolveHandle(folderId);
    const snapshot = yield* Effect.promise(() => handle.reindex());
    return toWire(snapshot);
  }),
);

const Search = MemoizeRpcs.toLayerHandler(
  "index.search",
  ({ folderId, query, kind, limit, pathGlob }) =>
    Effect.gen(function* () {
      const handle = yield* resolveHandle(folderId);
      return yield* Effect.promise(() =>
        handle.search({ query, kind, limit, pathGlob }),
      );
    }),
);

const SymbolLookup = MemoizeRpcs.toLayerHandler(
  "index.symbolLookup",
  ({ folderId, name, kind, limit, pathGlob }) =>
    Effect.gen(function* () {
      const handle = yield* resolveHandle(folderId);
      return yield* Effect.promise(() =>
        handle.symbolLookup({ name, kind, limit, pathGlob }),
      );
    }),
);

const FindReferences = MemoizeRpcs.toLayerHandler(
  "index.findReferences",
  ({ folderId, symbol, limit, pathGlob }) =>
    Effect.gen(function* () {
      const handle = yield* resolveHandle(folderId);
      return yield* Effect.promise(() =>
        handle.findReferences({ symbol, limit, pathGlob }),
      );
    }),
);

const ReadChunk = MemoizeRpcs.toLayerHandler(
  "index.readChunk",
  ({ folderId, chunkId }) =>
    Effect.gen(function* () {
      const handle = yield* resolveHandle(folderId);
      return yield* Effect.promise(() => handle.readChunk({ chunkId }));
    }),
);

const ListModule = MemoizeRpcs.toLayerHandler(
  "index.listModule",
  ({ folderId, path }) =>
    Effect.gen(function* () {
      const handle = yield* resolveHandle(folderId);
      return yield* Effect.promise(() => handle.listModule({ path }));
    }),
);

export const CodeIndexHandlersLayer = Layer.mergeAll(
  Status,
  StatusStream,
  Reindex,
  Search,
  SymbolLookup,
  FindReferences,
  ReadChunk,
  ListModule,
);
