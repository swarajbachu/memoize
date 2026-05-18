import { Effect } from "effect";

import { type IndexDb } from "../db/sqlite.ts";
import { IndexDbError } from "../errors.ts";

const wrap = <A>(reason: string, fn: () => A): Effect.Effect<A, IndexDbError> =>
  Effect.try({
    try: fn,
    catch: (cause) => new IndexDbError({ reason, cause }),
  });

export interface VectorHit {
  readonly chunkId: number;
  readonly rank: number;
  readonly score: number;
  readonly file: string;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly symbolId: number | null;
}

/**
 * Lazy probe: does the sqlite-vec extension look loaded? We treat any
 * SELECT-from-`chunk_vec` failure as "vec not available" and disable
 * the tier for the rest of the process — checking once per DB handle
 * keeps the hot path branchless.
 */
const probeCache = new WeakMap<object, boolean>();
const vecAvailable = (db: IndexDb): boolean => {
  const cached = probeCache.get(db as unknown as object);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    db.prepare("SELECT 1 FROM chunk_vec LIMIT 1").all();
    ok = true;
  } catch {
    ok = false;
  }
  probeCache.set(db as unknown as object, ok);
  return ok;
};

const float32ToBlob = (v: Float32Array): Buffer => Buffer.from(v.buffer);

/**
 * Top-K vector search via sqlite-vec's `MATCH` operator. The vec table
 * declares `chunk_id` as the primary key so we can JOIN straight to
 * `chunks` for content + manifest scoping.
 *
 * Falls back to `[]` when the extension isn't loaded — the router
 * detects this on its own and skips the tier without raising.
 */
export const vectorSearch = (
  db: IndexDb,
  embedding: Float32Array,
  branch: string,
  limit: number,
  pathGlob?: string,
): Effect.Effect<ReadonlyArray<VectorHit>, IndexDbError> =>
  wrap("vectorSearch", () => {
    if (!vecAvailable(db)) return [];
    const params: unknown[] = [branch, float32ToBlob(embedding), limit];
    let extraWhere = "";
    if (pathGlob && pathGlob.length > 0) {
      extraWhere = " AND m.file_path GLOB ?";
      params.push(pathGlob);
    }
    const rows = db
      .prepare(
        `SELECT c.id AS chunk_id,
                distance AS rank,
                c.start_line, c.end_line, c.symbol_id, c.content,
                m.file_path
         FROM chunk_vec v
         JOIN chunks c ON c.id = v.chunk_id
         JOIN manifests m ON m.blob_id = c.blob_id AND m.branch = ?
         WHERE v.embedding MATCH ?
           AND k = ?${extraWhere}
         ORDER BY distance ASC`,
      )
      .all(...params) as Array<{
      chunk_id: number;
      rank: number;
      start_line: number;
      end_line: number;
      symbol_id: number | null;
      content: string;
      file_path: string;
    }>;
    return rows.map((r, i) => ({
      chunkId: r.chunk_id,
      rank: i + 1,
      score: -r.rank,
      file: r.file_path,
      content: r.content,
      startLine: r.start_line,
      endLine: r.end_line,
      symbolId: r.symbol_id,
    }));
  });

/**
 * Bulk-insert embeddings into `chunk_vec`. No-op when the extension
 * isn't loaded — the embedding worker logs and skips silently.
 */
export const writeEmbeddings = (
  db: IndexDb,
  rows: ReadonlyArray<{
    readonly chunkId: number;
    readonly embedding: Float32Array;
  }>,
): Effect.Effect<number, IndexDbError> =>
  wrap("writeEmbeddings", () => {
    if (!vecAvailable(db)) return 0;
    const stmt = db.prepare(
      "INSERT OR REPLACE INTO chunk_vec (chunk_id, embedding) VALUES (?, ?)",
    );
    const tx = db.transaction(() => {
      for (const r of rows) stmt.run(r.chunkId, float32ToBlob(r.embedding));
    });
    tx();
    return rows.length;
  });

export const isVectorAvailable = (db: IndexDb): boolean => vecAvailable(db);
