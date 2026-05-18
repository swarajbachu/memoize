import { Effect } from "effect";

import { type IndexDb } from "../db/sqlite.ts";
import { IndexDbError } from "../errors.ts";
import {
  type ChunkContent,
  type RefHit,
  type SearchHit,
  type SymbolHit,
  type SymbolKind,
  type SymbolSummary,
} from "../types.ts";

const wrap = <A>(reason: string, fn: () => A): Effect.Effect<A, IndexDbError> =>
  Effect.try({
    try: fn,
    catch: (cause) => new IndexDbError({ reason, cause }),
  });

interface SymbolRow {
  id: number;
  blob_id: number;
  name: string;
  kind: string;
  signature: string | null;
  start_line: number;
  end_line: number;
  exported: number;
  file_path: string;
  chunk_id: number | null;
}

/**
 * Tier-1 symbol lookup. Exact match first, then a LIKE-prefix sweep. Sorted
 * with `exported DESC` then shortest name first — the cheapest tie-breaker
 * that mirrors what a developer would visually pick.
 *
 * Returns the `chunkId` of the symbol's enclosing chunk when one exists, so
 * callers can hand it straight to `readChunk` without having to remember the
 * symbolId/chunkId namespace distinction.
 */
export const lookupSymbol = (
  db: IndexDb,
  name: string,
  branch: string,
  kind: string | undefined,
  limit: number,
  pathGlob?: string,
): Effect.Effect<ReadonlyArray<SymbolHit>, IndexDbError> =>
  wrap("lookupSymbol", () => {
    const params: unknown[] = [branch];
    let where = "WHERE (s.name = ?)";
    params.push(name);
    if (name.length >= 2) {
      where += " OR s.name LIKE ?";
      params.push(`${name}%`);
    }
    where = `WHERE m.branch = ? AND (${where.slice(6)})`;
    if (kind) {
      where += " AND s.kind = ?";
      params.push(kind);
    }
    if (pathGlob && pathGlob.length > 0) {
      where += " AND m.file_path GLOB ?";
      params.push(pathGlob);
    }
    const rows = db
      .prepare(
        `SELECT s.id, s.blob_id, s.name, s.kind, s.signature,
                s.start_line, s.end_line, s.exported, m.file_path,
                (SELECT c.id FROM chunks c
                  WHERE c.symbol_id = s.id
                  ORDER BY c.id ASC LIMIT 1) AS chunk_id
         FROM symbols s
         JOIN manifests m ON m.blob_id = s.blob_id
         ${where}
         ORDER BY s.exported DESC,
                  (CASE WHEN s.name = ? THEN 0 ELSE 1 END) ASC,
                  length(s.name) ASC,
                  s.id ASC
         LIMIT ?`,
      )
      .all(...params, name, limit) as SymbolRow[];
    return rows.map((r) => ({
      symbolId: r.id,
      chunkId: r.chunk_id,
      name: r.name,
      kind: r.kind as SymbolKind,
      signature: r.signature,
      file: r.file_path,
      range: { start: r.start_line, end: r.end_line },
      exported: r.exported === 1,
    }));
  });

/**
 * Symbol-only search hit: wrap a SymbolHit as a SearchHit so the agent
 * can consume one shape regardless of which tier found the result.
 */
export const symbolHitToSearchHit = (h: SymbolHit, content: string): SearchHit => ({
  chunkId: -1,
  file: h.file,
  range: h.range,
  symbol: { name: h.name, kind: h.kind },
  content,
  score: h.exported ? 1.0 : 0.8,
  source: "symbol",
});

/**
 * Phase A surface for `findReferences`. The refs table is empty in Phase A
 * (extraction is deferred to a later phase per ADR 0015), so this returns
 * an empty list — callers should still wire it; downstream tests assert
 * `[]` rather than throw.
 */
export const findReferencesByName = (
  db: IndexDb,
  symbol: string,
  branch: string,
  limit: number,
  pathGlob?: string,
): Effect.Effect<ReadonlyArray<RefHit>, IndexDbError> =>
  wrap("findReferences", () => {
    const params: unknown[] = [branch, symbol];
    let extraWhere = "";
    if (pathGlob && pathGlob.length > 0) {
      extraWhere = " AND m.file_path GLOB ?";
      params.push(pathGlob);
    }
    params.push(limit);
    const rows = db
      .prepare(
        `SELECT r.id, r.start_line, r.end_line, r.context, m.file_path
         FROM refs r
         JOIN symbols s ON s.id = r.symbol_id
         JOIN manifests m ON m.blob_id = r.blob_id AND m.branch = ?
         WHERE s.name = ?${extraWhere}
         LIMIT ?`,
      )
      .all(...params) as Array<{
      id: number;
      start_line: number;
      end_line: number;
      context: string;
      file_path: string;
    }>;
    return rows.map((r) => ({
      refId: r.id,
      file: r.file_path,
      range: { start: r.start_line, end: r.end_line },
      context: r.context,
    }));
  });

/**
 * Enumerate the symbols declared inside a file at a given branch. Used by
 * `list_module` so the agent can "see what's in this file" without reading it.
 */
export const listFileSymbols = (
  db: IndexDb,
  filePath: string,
  branch: string,
): Effect.Effect<ReadonlyArray<SymbolSummary>, IndexDbError> =>
  wrap("listFileSymbols", () => {
    const rows = db
      .prepare(
        `SELECT s.name, s.kind, s.signature, s.start_line, s.exported
         FROM symbols s
         JOIN manifests m ON m.blob_id = s.blob_id AND m.branch = ?
         WHERE m.file_path = ?
         ORDER BY s.start_line ASC`,
      )
      .all(branch, filePath) as Array<{
      name: string;
      kind: string;
      signature: string | null;
      start_line: number;
      exported: number;
    }>;
    return rows.map((r) => ({
      name: r.name,
      kind: r.kind as SymbolKind,
      signature: r.signature,
      startLine: r.start_line,
      exported: r.exported === 1,
    }));
  });

/**
 * Read a chunk's content within a branch. We resolve through the manifest
 * so a chunk seen on branch X but not on Y returns null on Y.
 */
export const fetchChunk = (
  db: IndexDb,
  chunkId: number,
  branch: string,
): Effect.Effect<ChunkContent | null, IndexDbError> =>
  wrap("fetchChunk", () => {
    const row = db
      .prepare(
        `SELECT c.id, c.content, c.start_line, c.end_line, m.file_path
         FROM chunks c
         JOIN manifests m ON m.blob_id = c.blob_id AND m.branch = ?
         WHERE c.id = ?`,
      )
      .get(branch, chunkId) as
      | {
          id: number;
          content: string;
          start_line: number;
          end_line: number;
          file_path: string;
        }
      | undefined;
    if (!row) return null;
    return {
      chunkId: row.id,
      file: row.file_path,
      content: row.content,
      range: { start: row.start_line, end: row.end_line },
    };
  });
