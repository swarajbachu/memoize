import { Context, Effect, Layer, Ref } from "effect";
import { join } from "node:path";

import { closeIndexDb, openIndexDb, type IndexDb } from "./db/sqlite.ts";
import { runMigrations } from "./schema/migrations.ts";
import { IndexService } from "./api.ts";
import { countAll } from "./blob/store.ts";
import { branchExists } from "./manifest/manifest.ts";
import { indexRepo } from "./indexer.ts";
import {
  fetchChunk,
  findReferencesByName,
  listFileSymbols,
  lookupSymbol,
  symbolHitToSearchHit,
} from "./retrieval/symbol-lookup.ts";
import {
  type IndexStatus,
  type SearchHit,
  type SearchInput,
} from "./types.ts";

/**
 * Per-workspace config the host provides at boot. `root` is the absolute
 * workspace path; `branch` is the active branch (apps/server resolves via
 * git rev-parse, mcp-server via its CLI flag or git rev-parse).
 *
 * `dbPath` defaults to `<root>/.memoize/index.sqlite`; tests override it to
 * `:memory:`.
 */
export interface IndexConfig {
  readonly root: string;
  readonly branch: string;
  readonly dbPath?: string;
}

export class IndexConfigTag extends Context.Tag("memoize/IndexConfig")<
  IndexConfigTag,
  IndexConfig
>() {}

interface InternalState {
  readonly state: IndexStatus["state"];
  readonly progress: IndexStatus["progress"];
}

/**
 * Concrete IndexService Layer. Owns a single better-sqlite3 handle per
 * workspace; runs migrations on construction; tracks indexing progress in
 * a Ref so the renderer can poll `index.status`.
 *
 * The first `reindex()` call is what populates the DB — boot is cheap.
 * Phase E will add a watcher that calls `reindex` on a debounce; for
 * Phase A, callers (tests, the manual debug command) call it directly.
 */
export const IndexServiceLive = Layer.scoped(
  IndexService,
  Effect.gen(function* () {
    const config = yield* IndexConfigTag;
    const dbFile =
      config.dbPath ?? join(config.root, ".memoize", "index.sqlite");

    const db: IndexDb = yield* Effect.acquireRelease(
      openIndexDb(dbFile),
      (handle) => closeIndexDb(handle),
    );

    yield* runMigrations(db);

    const stateRef = yield* Ref.make<InternalState>({
      state: "idle",
      progress: null,
    });

    const branchOr = (b?: string): string => b ?? config.branch;

    const computeStatus = (): Effect.Effect<IndexStatus> =>
      Effect.gen(function* () {
        const { state, progress } = yield* Ref.get(stateRef);
        const stats = yield* countAll(db);
        const populated = yield* branchExists(db, config.branch);
        const resolved: IndexStatus["state"] =
          state === "indexing" || state === "error"
            ? state
            : populated
              ? "ready"
              : "idle";
        return {
          state: resolved,
          branch: config.branch,
          progress,
          stats,
        } satisfies IndexStatus;
      }).pipe(
        Effect.catchAll(() =>
          Effect.succeed<IndexStatus>({
            state: "error",
            branch: config.branch,
            progress: null,
            stats: { blobs: 0, chunks: 0, symbols: 0, refs: 0 },
          }),
        ),
      );

    const doReindex = (branch: string): Effect.Effect<IndexStatus, never> =>
      Effect.gen(function* () {
        yield* Ref.set(stateRef, { state: "indexing", progress: null });
        const result = yield* indexRepo(db, config.root, branch, (p) =>
          Effect.runSync(
            Ref.set(stateRef, {
              state: "indexing",
              progress: { processed: p.processed, total: p.total },
            }),
          ),
        );
        yield* Ref.set(stateRef, {
          state: "ready",
          progress: { processed: result.processed, total: result.total },
        });
        return yield* computeStatus();
      }).pipe(
        Effect.catchAll((err) =>
          Effect.gen(function* () {
            yield* Effect.logError("index reindex failed", err);
            yield* Ref.set(stateRef, { state: "error", progress: null });
            return yield* computeStatus();
          }),
        ),
      );

    return IndexService.of({
      status: computeStatus(),
      reindex: (opts) => doReindex(branchOr(opts?.branch)),
      symbolLookup: ({ name, kind, branch, limit }) =>
        lookupSymbol(db, name, branchOr(branch), kind, limit ?? 10),
      findReferences: ({ symbol, branch, limit }) =>
        findReferencesByName(db, symbol, branchOr(branch), limit ?? 20),
      readChunk: ({ chunkId, branch }) =>
        fetchChunk(db, chunkId, branchOr(branch)),
      listModule: ({ path, branch }) =>
        listFileSymbols(db, path, branchOr(branch)),
      search: (input: SearchInput) =>
        // Phase A: route every query through symbol lookup. Phase B fills
        // in proper routing; Phase C+D add BM25 / vector / rerank.
        Effect.gen(function* () {
          const limit = input.limit ?? 5;
          const branch = branchOr(input.branch);
          const hits = yield* lookupSymbol(
            db,
            input.query,
            branch,
            undefined,
            limit,
          );
          const out: SearchHit[] = [];
          for (const h of hits) {
            const chunk = yield* fetchChunkBySymbol(db, h.symbolId, branch);
            out.push(
              symbolHitToSearchHit(
                h,
                chunk?.content ?? `${h.kind} ${h.name}`,
              ),
            );
          }
          return out as ReadonlyArray<SearchHit>;
        }),
    });
  }),
);

/**
 * Used by `search` to resolve a symbol to its enclosing chunk's content so
 * the agent gets actual code text, not just `function foo(...)`.
 */
const fetchChunkBySymbol = (
  db: IndexDb,
  symbolId: number,
  branch: string,
): Effect.Effect<{ content: string } | null, never> =>
  Effect.sync(() => {
    try {
      const row = db
        .prepare(
          `SELECT c.content FROM chunks c
           JOIN manifests m ON m.blob_id = c.blob_id AND m.branch = ?
           WHERE c.symbol_id = ?
           ORDER BY c.id ASC LIMIT 1`,
        )
        .get(branch, symbolId) as { content: string } | undefined;
      return row ?? null;
    } catch {
      return null;
    }
  });
