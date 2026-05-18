import { Effect, Layer, Ref } from "effect";
import { join } from "node:path";

import {
  blakeOf,
  closeIndexDb,
  detectLanguage,
  fetchChunk,
  findReferencesByName,
  indexRepo,
  listFileSymbols,
  lookupSymbol,
  openIndexDb,
  runMigrations,
  type IndexDbError,
} from "@memoize/index";

import { IndexRegistry, type IndexHandle } from "../services/index-registry.ts";

// One IndexHandle per workspace root. We avoid nesting Effect Layer
// composition inside a Map by opening better-sqlite3 + running migrations
// directly here and exposing promise-returning methods. Errors bubble as
// rejected promises — callers (Claude SDK tools) report them as tool
// failures, not session-level fatals.
interface Entry {
  readonly handle: IndexHandle;
  readonly close: () => Promise<void>;
}

const runP = <A>(eff: Effect.Effect<A, unknown>): Promise<A> =>
  Effect.runPromise(eff as Effect.Effect<A, unknown, never>);

/**
 * Live `IndexRegistry`. Per workspace root we open a single SQLite handle
 * at `<root>/.memoize/index.sqlite`, run migrations once, and serve every
 * subsequent lookup from the same handle.
 *
 * The registry never auto-indexes a workspace — the first `reindex()` is
 * what populates the DB. Phase E will wire a watcher to call it
 * incrementally; Phase B exposes a manual `index.reindex` RPC instead.
 */
export const IndexRegistryLive = Layer.scoped(
  IndexRegistry,
  Effect.gen(function* () {
    const entries = yield* Ref.make(new Map<string, Entry>());

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const map = yield* Ref.get(entries);
        for (const [, e] of map) {
          yield* Effect.tryPromise({
            try: () => e.close(),
            catch: () => new Error("close failed"),
          }).pipe(Effect.ignore);
        }
      }),
    );

    const construct = async (root: string, branch: string): Promise<Entry> => {
      const dbPath = join(root, ".memoize", "index.sqlite");
      const db = await runP(openIndexDb(dbPath));
      await runP(runMigrations(db));

      const handle: IndexHandle = {
        status: async () => ({
          state: "ready",
          branch,
          progress: null,
          stats: { blobs: 0, chunks: 0, symbols: 0, refs: 0 },
        }),
        reindex: async () => {
          await runP(indexRepo(db, root, branch));
          return {
            state: "ready",
            branch,
            progress: null,
            stats: { blobs: 0, chunks: 0, symbols: 0, refs: 0 },
          };
        },
        symbolLookup: ({ name, kind, limit }) =>
          runP(lookupSymbol(db, name, branch, kind, limit ?? 10)),
        findReferences: ({ symbol, limit }) =>
          runP(findReferencesByName(db, symbol, branch, limit ?? 20)),
        readChunk: ({ chunkId }) => runP(fetchChunk(db, chunkId, branch)),
        listModule: ({ path }) => runP(listFileSymbols(db, path, branch)),
        search: ({ query, kind, limit }) =>
          runP(
            Effect.gen(function* () {
              const hits = yield* lookupSymbol(
                db,
                query,
                branch,
                undefined,
                limit ?? 5,
              );
              // Phase B: search is symbol-routed. Phase C plugs BM25 + vector
              // through here without changing the tool surface.
              void kind;
              return hits;
            }) as Effect.Effect<unknown, IndexDbError>,
          ),
      };

      // Keep a hash of the construction site so future code can detect
      // stale entries if we ever invalidate (no current use; just gives
      // the closure something identity-shaped to reference).
      void blakeOf(root);
      void detectLanguage;

      return {
        handle,
        close: async () => {
          await runP(closeIndexDb(db));
        },
      };
    };

    return IndexRegistry.of({
      getHandle: (root, branch) =>
        Effect.promise(async () => {
          const map = await runP(Ref.get(entries));
          const existing = map.get(root);
          if (existing) return existing.handle;
          const entry = await construct(root, branch);
          await runP(
            Ref.update(entries, (m) => {
              const next = new Map(m);
              next.set(root, entry);
              return next;
            }),
          );
          return entry.handle;
        }),
    });
  }),
);
