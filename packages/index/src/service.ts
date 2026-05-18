import { Context, Effect, Layer, Mailbox, Ref, Stream } from "effect";
import { join } from "node:path";

import { closeIndexDb, openIndexDb, type IndexDb } from "./db/sqlite.ts";
import { runMigrations } from "./schema/migrations.ts";
import { IndexService } from "./api.ts";
import { countAll } from "./blob/store.ts";
import { branchExists } from "./manifest/manifest.ts";
import { getEmbeddingProvider } from "./embedding/provider.ts";
import { indexRepo } from "./indexer.ts";
import { bm25Search } from "./retrieval/bm25.ts";
import { reciprocalRankFusion } from "./retrieval/rrf.ts";
import { route } from "./retrieval/router.ts";
import {
  fetchChunk,
  findReferencesByName,
  listFileSymbols,
  lookupSymbol,
  symbolHitToSearchHit,
} from "./retrieval/symbol-lookup.ts";
import { isVectorAvailable, vectorSearch } from "./retrieval/vector.ts";
import { applyRerank } from "./rerank/index.ts";
import {
  type IndexStatus,
  type SearchHit,
  type SearchInput,
  type SymbolHit,
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

    // Fan-out for status updates. Each call to `statusStream` registers a
    // fresh per-subscriber mailbox; on every state transition we re-snapshot
    // and `unsafeOffer` into all live subscribers. A subscriber receives the
    // current value on subscribe so there's no race with the first transition.
    const subscribers = yield* Ref.make<
      ReadonlyArray<Mailbox.Mailbox<IndexStatus>>
    >([]);

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

    const publishCurrent: Effect.Effect<void> = Effect.gen(function* () {
      const snapshot = yield* computeStatus();
      const subs = yield* Ref.get(subscribers);
      for (const m of subs) m.unsafeOffer(snapshot);
    });

    const setState = (next: InternalState): Effect.Effect<void> =>
      Ref.set(stateRef, next).pipe(Effect.zipRight(publishCurrent));

    const statusStream: Stream.Stream<IndexStatus> = Stream.unwrapScoped(
      Effect.gen(function* () {
        const mailbox = yield* Mailbox.make<IndexStatus>();
        yield* Effect.addFinalizer(() =>
          Ref.update(subscribers, (xs) => xs.filter((m) => m !== mailbox)),
        );
        yield* Ref.update(subscribers, (xs) => [...xs, mailbox]);
        // Seed with the current snapshot so a fresh subscriber doesn't race.
        const snapshot = yield* computeStatus();
        mailbox.unsafeOffer(snapshot);
        return Mailbox.toStream(mailbox);
      }),
    );

    const doReindex = (branch: string): Effect.Effect<IndexStatus, never> =>
      Effect.gen(function* () {
        yield* setState({ state: "indexing", progress: null });
        const result = yield* indexRepo(db, config.root, branch, (p) =>
          Effect.runSync(
            setState({
              state: "indexing",
              progress: { processed: p.processed, total: p.total },
            }),
          ),
        );
        yield* setState({
          state: "ready",
          progress: { processed: result.processed, total: result.total },
        });
        return yield* computeStatus();
      }).pipe(
        Effect.catchAll((err) =>
          Effect.gen(function* () {
            yield* Effect.logError("index reindex failed", err);
            yield* setState({ state: "error", progress: null });
            return yield* computeStatus();
          }),
        ),
      );

    return IndexService.of({
      status: computeStatus(),
      statusStream,
      reindex: (opts) => doReindex(branchOr(opts?.branch)),
      symbolLookup: ({ name, kind, branch, limit, pathGlob }) =>
        lookupSymbol(db, name, branchOr(branch), kind, limit ?? 10, pathGlob),
      findReferences: ({ symbol, branch, limit, pathGlob }) =>
        findReferencesByName(db, symbol, branchOr(branch), limit ?? 20, pathGlob),
      readChunk: ({ chunkId, branch }) =>
        fetchChunk(db, chunkId, branchOr(branch)),
      listModule: ({ path, branch }) =>
        listFileSymbols(db, path, branchOr(branch)),
      search: (input: SearchInput) => runSearch(db, config.branch, input),
    });
  }),
);

/**
 * Used by `search` to resolve a symbol to its enclosing chunk's id + content
 * so the agent gets actual code text, not just `function foo(...)`. Returns
 * `null` when the symbol has no anchored chunk (type aliases, properties).
 */
const fetchChunkBySymbol = (
  db: IndexDb,
  symbolId: number,
  branch: string,
): Effect.Effect<{ chunkId: number; content: string } | null, never> =>
  Effect.sync(() => {
    try {
      const row = db
        .prepare(
          `SELECT c.id, c.content FROM chunks c
           JOIN manifests m ON m.blob_id = c.blob_id AND m.branch = ?
           WHERE c.symbol_id = ?
           ORDER BY c.id ASC LIMIT 1`,
        )
        .get(branch, symbolId) as { id: number; content: string } | undefined;
      return row ? { chunkId: row.id, content: row.content } : null;
    } catch {
      return null;
    }
  });

/**
 * Hybrid search pipeline — routes the query into the tier(s) the router
 * recommends, runs them in parallel, fuses via RRF when more than one
 * tier fires. Symbol-only queries skip fusion entirely (single source,
 * RRF would be a no-op).
 */
const runSearch = (
  db: IndexDb,
  defaultBranch: string,
  input: SearchInput,
): Effect.Effect<ReadonlyArray<SearchHit>, never> =>
  Effect.gen(function* () {
    const branch = input.branch ?? defaultBranch;
    const limit = input.limit ?? 5;
    const pathGlob = input.pathGlob;
    const tiers = route(input.query, input.kind);

    const wantsSymbol = tiers.includes("symbol");
    const wantsBm25 = tiers.includes("bm25");
    const wantsVector = tiers.includes("vector");

    // Tier 1 — symbol lookup. Single-source path returns directly.
    const symbolHits = wantsSymbol
      ? yield* lookupSymbol(db, input.query, branch, undefined, 20, pathGlob).pipe(
          Effect.catchAll(() =>
            Effect.succeed([] as ReadonlyArray<ReturnType<typeof Object>>),
          ),
        )
      : [];

    if (tiers.length === 1 && wantsSymbol) {
      const out: SearchHit[] = [];
      for (const h of symbolHits.slice(0, limit) as ReadonlyArray<SymbolHit>) {
        const chunk = yield* fetchChunkBySymbol(db, h.symbolId, branch);
        out.push(
          symbolHitToSearchHit(h, chunk?.content ?? `${h.kind} ${h.name}`),
        );
      }
      return out as ReadonlyArray<SearchHit>;
    }

    // Tier 2 / Tier 3 — gather candidates, fuse via RRF.
    const fanout = 30;
    const rankings: ReadonlyArray<{ chunkId: number }>[] = [];

    if (wantsBm25) {
      const hits = yield* bm25Search(db, input.query, branch, fanout, pathGlob).pipe(
        Effect.catchAll(() => Effect.succeed([])),
      );
      rankings.push(hits);
    }
    if (wantsVector && isVectorAvailable(db)) {
      const provider = getEmbeddingProvider();
      if (provider.id !== "null") {
        const [vec] = yield* Effect.tryPromise({
          try: () => provider.embed([input.query]),
          catch: () => new Error("embed failed"),
        }).pipe(Effect.catchAll(() => Effect.succeed([new Float32Array(0)])));
        if (vec && vec.length > 0) {
          const hits = yield* vectorSearch(db, vec, branch, fanout, pathGlob).pipe(
            Effect.catchAll(() => Effect.succeed([])),
          );
          rankings.push(hits);
        }
      }
    }
    if (wantsSymbol && symbolHits.length > 0) {
      rankings.push(
        symbolHits.map((h) => ({
          chunkId: -1 - (h as { symbolId: number }).symbolId,
        })),
      );
    }

    // Over-fetch into RRF; we'll narrow with rerank before returning.
    const fanForRerank = Math.max(20, limit * 4);
    const fused = reciprocalRankFusion(rankings).slice(0, fanForRerank);
    const out: SearchHit[] = [];
    for (const { chunkId, score } of fused) {
      if (chunkId < 0) {
        // Symbol-derived placeholder id. Convert back, fetch its chunk.
        const symbolId = -1 - chunkId;
        const sh = (symbolHits as ReadonlyArray<SymbolHit>).find(
          (h) => h.symbolId === symbolId,
        );
        if (!sh) continue;
        const chunk = yield* fetchChunkBySymbol(db, symbolId, branch);
        out.push({
          ...symbolHitToSearchHit(sh, chunk?.content ?? `${sh.kind} ${sh.name}`),
          chunkId: chunk?.chunkId ?? -1,
          score,
          source: "fused",
        });
      } else {
        const row = yield* Effect.try({
          try: () =>
            db
              .prepare(
                `SELECT c.id, c.start_line, c.end_line, c.content, c.symbol_id, m.file_path
                 FROM chunks c
                 JOIN manifests m ON m.blob_id = c.blob_id AND m.branch = ?
                 WHERE c.id = ?`,
              )
              .get(branch, chunkId) as
              | {
                  id: number;
                  start_line: number;
                  end_line: number;
                  content: string;
                  symbol_id: number | null;
                  file_path: string;
                }
              | undefined,
          catch: () => new Error("fetch chunk failed"),
        }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
        if (!row) continue;
        out.push({
          chunkId: row.id,
          file: row.file_path,
          range: { start: row.start_line, end: row.end_line },
          symbol: null,
          content: row.content,
          score,
          source: "fused",
        });
      }
    }
    // Phase D: rerank the over-fetched fused candidates and trim to `limit`.
    // No-op when the active provider is NullRerankProvider (default), so
    // local installs without a paid backend still get the RRF ordering.
    const reranked = yield* Effect.tryPromise({
      try: () => applyRerank(input.query, out, limit),
      catch: () => new Error("rerank failed"),
    }).pipe(Effect.catchAll(() => Effect.succeed(out.slice(0, limit))));
    return reranked as ReadonlyArray<SearchHit>;
  });
