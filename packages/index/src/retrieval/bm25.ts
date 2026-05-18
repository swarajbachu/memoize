import { Effect } from "effect";

import { type IndexDb } from "../db/sqlite.ts";
import { IndexDbError } from "../errors.ts";

const wrap = <A>(reason: string, fn: () => A): Effect.Effect<A, IndexDbError> =>
  Effect.try({
    try: fn,
    catch: (cause) => new IndexDbError({ reason, cause }),
  });

export interface Bm25Hit {
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
 * Sanitize a query string for FTS5. Trigram tokenizer doesn't need
 * elaborate escaping but the MATCH grammar still hates unmatched quotes
 * and prefix-operator stars. We strip everything but word chars, dots,
 * dashes, slashes, and spaces — empirically what code identifiers need.
 */
const sanitize = (q: string): string =>
  q
    .replace(/[^\w./\- ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, "")}"`)
    .join(" OR ");

/**
 * Run BM25 ranking over the FTS5 index. Joins through the manifest so
 * results stay branch-scoped. The `chunks_fts` virtual table exposes the
 * `bm25()` aggregate; lower scores are better, we flip to make all rank
 * sources directionally consistent in the fusion layer.
 */
export const bm25Search = (
  db: IndexDb,
  query: string,
  branch: string,
  limit: number,
  pathGlob?: string,
): Effect.Effect<ReadonlyArray<Bm25Hit>, IndexDbError> =>
  wrap("bm25Search", () => {
    const fts = sanitize(query);
    if (fts.length === 0) return [];
    const params: unknown[] = [branch, fts];
    let extraWhere = "";
    if (pathGlob && pathGlob.length > 0) {
      extraWhere = " AND m.file_path GLOB ?";
      params.push(pathGlob);
    }
    params.push(limit);
    const rows = db
      .prepare(
        `SELECT c.id AS chunk_id,
                bm25(chunks_fts) AS rank,
                c.start_line, c.end_line, c.symbol_id, c.content,
                m.file_path
         FROM chunks_fts
         JOIN chunks c ON c.id = chunks_fts.rowid
         JOIN manifests m ON m.blob_id = c.blob_id AND m.branch = ?
         WHERE chunks_fts MATCH ?${extraWhere}
         ORDER BY rank
         LIMIT ?`,
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
      score: -r.rank, // bm25 is "lower is better"; flip so larger = better
      file: r.file_path,
      content: r.content,
      startLine: r.start_line,
      endLine: r.end_line,
      symbolId: r.symbol_id,
    }));
  });
