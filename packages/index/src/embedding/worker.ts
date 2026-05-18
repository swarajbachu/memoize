import { Effect } from "effect";

import { type IndexDb } from "../db/sqlite.ts";
import { IndexDbError } from "../errors.ts";
import { isVectorAvailable, writeEmbeddings } from "../retrieval/vector.ts";
import { getEmbeddingProvider } from "./provider.ts";

const BATCH_SIZE = 64;

interface QueueRow {
  chunk_id: number;
  content: string;
}

const wrap = <A>(reason: string, fn: () => A): Effect.Effect<A, IndexDbError> =>
  Effect.try({
    try: fn,
    catch: (cause) => new IndexDbError({ reason, cause }),
  });

/**
 * Drain one batch from the embedding queue. Pulls up to `BATCH_SIZE`
 * pending chunks, hands them to the active provider, writes vectors
 * back, then removes the queue rows.
 *
 * Returns the number of chunks processed. `0` means "queue empty" —
 * callers can sleep or stop. No-ops gracefully when sqlite-vec is
 * unavailable (the rows stay queued for a later session with the
 * extension loaded).
 */
export const drainEmbedQueue = (
  db: IndexDb,
): Effect.Effect<number, IndexDbError> =>
  Effect.gen(function* () {
    if (!isVectorAvailable(db)) return 0;
    const rows = yield* wrap("readEmbedQueue", () =>
      db
        .prepare(
          `SELECT q.chunk_id, c.content
           FROM embed_queue q
           JOIN chunks c ON c.id = q.chunk_id
           ORDER BY q.enqueued_at ASC
           LIMIT ?`,
        )
        .all(BATCH_SIZE) as QueueRow[],
    );
    if (rows.length === 0) return 0;

    const provider = getEmbeddingProvider();
    const vectors = yield* Effect.tryPromise({
      try: () => provider.embed(rows.map((r) => r.content)),
      catch: (cause) =>
        new IndexDbError({ reason: "embedding provider failed", cause }),
    });
    if (vectors.length !== rows.length) {
      return yield* Effect.fail(
        new IndexDbError({
          reason: `embedder returned ${vectors.length} vectors for ${rows.length} chunks`,
        }),
      );
    }

    const writes = rows.map((r, i) => ({
      chunkId: r.chunk_id,
      embedding: vectors[i]!,
    }));
    yield* writeEmbeddings(db, writes);
    yield* wrap("clearEmbedQueue", () => {
      const stmt = db.prepare("DELETE FROM embed_queue WHERE chunk_id = ?");
      const tx = db.transaction(() => {
        for (const r of rows) stmt.run(r.chunk_id);
      });
      tx();
    });
    return rows.length;
  });

/**
 * Loop `drainEmbedQueue` until the queue is empty. Use this from the
 * background daemon after the initial reindex; Phase E adds an actual
 * tick-driven worker that runs at idle.
 */
export const drainAll = (
  db: IndexDb,
): Effect.Effect<number, IndexDbError> =>
  Effect.gen(function* () {
    let total = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const n = yield* drainEmbedQueue(db);
      if (n === 0) break;
      total += n;
    }
    return total;
  });
