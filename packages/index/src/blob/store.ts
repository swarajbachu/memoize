import { Effect } from "effect";

import { type IndexDb } from "../db/sqlite.ts";
import { IndexDbError } from "../errors.ts";
import {
  type ChunkContent,
  type LanguageId,
  type ParsedChunk,
  type ParsedSymbol,
} from "../types.ts";

export interface UpsertBlobResult {
  readonly blobId: number;
  /** True if this is the first time we've ever seen this content sha. */
  readonly isNew: boolean;
}

const wrap = <A>(reason: string, fn: () => A): Effect.Effect<A, IndexDbError> =>
  Effect.try({
    try: fn,
    catch: (cause) => new IndexDbError({ reason, cause }),
  });

/**
 * Insert a blob if its sha isn't already in the store; otherwise return the
 * existing id. The full "chunks + symbols" payload only persists on insert —
 * `isNew = false` means the caller can skip parsing entirely.
 */
export const upsertBlob = (
  db: IndexDb,
  sha: Uint8Array,
  language: LanguageId,
  size: number,
): Effect.Effect<UpsertBlobResult, IndexDbError> =>
  wrap("upsertBlob", () => {
    const existing = db
      .prepare("SELECT id FROM blobs WHERE sha = ?")
      .get(sha) as { id: number } | undefined;
    if (existing) return { blobId: existing.id, isNew: false };
    const info = db
      .prepare(
        "INSERT INTO blobs (sha, language, size, parsed_at) VALUES (?, ?, ?, ?)",
      )
      .run(sha, language, size, Date.now());
    return { blobId: Number(info.lastInsertRowid), isNew: true };
  });

/**
 * Persist symbols + chunks for a fresh blob in one transaction. We insert
 * symbols first so chunks can reference their `symbol_id`; symbol parents
 * are wired up using each symbol's array index (from the parser) → row id.
 */
export const persistParse = (
  db: IndexDb,
  blobId: number,
  symbols: ReadonlyArray<ParsedSymbol>,
  chunks: ReadonlyArray<ParsedChunk>,
): Effect.Effect<void, IndexDbError> =>
  wrap("persistParse", () => {
    const insertSymbol = db.prepare(
      `INSERT INTO symbols
        (blob_id, name, kind, signature, start_line, end_line, parent_id, exported)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const updateSymbolParent = db.prepare(
      "UPDATE symbols SET parent_id = ? WHERE id = ?",
    );
    const insertChunk = db.prepare(
      `INSERT INTO chunks
        (blob_id, kind, start_line, end_line, symbol_id, content)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const tx = db.transaction(() => {
      const idByIndex: number[] = [];
      for (const sym of symbols) {
        const info = insertSymbol.run(
          blobId,
          sym.name,
          sym.kind,
          sym.signature,
          sym.startLine,
          sym.endLine,
          null,
          sym.exported ? 1 : 0,
        );
        idByIndex.push(Number(info.lastInsertRowid));
      }
      for (let i = 0; i < symbols.length; i++) {
        const sym = symbols[i]!;
        if (sym.parentIndex === null) continue;
        const parentRowId = idByIndex[sym.parentIndex];
        if (parentRowId !== undefined) {
          updateSymbolParent.run(parentRowId, idByIndex[i]!);
        }
      }
      const symbolNameToRowId = new Map<string, number>();
      symbols.forEach((sym, i) => {
        if (!symbolNameToRowId.has(sym.name)) {
          symbolNameToRowId.set(sym.name, idByIndex[i]!);
        }
      });
      for (const chunk of chunks) {
        const symbolId = chunk.symbolName
          ? symbolNameToRowId.get(chunk.symbolName.split(".").pop()!) ?? null
          : null;
        insertChunk.run(
          blobId,
          chunk.kind,
          chunk.startLine,
          chunk.endLine,
          symbolId,
          chunk.content,
        );
      }
    });
    tx();
  });

/**
 * Look up a chunk row + its enclosing file path on a specific branch.
 * The file path comes from the manifest — a chunk belongs to a blob, a
 * blob can live under many paths across branches.
 */
export const readChunk = (
  db: IndexDb,
  chunkId: number,
  branch: string,
): Effect.Effect<ChunkContent | null, IndexDbError> =>
  wrap("readChunk", () => {
    const row = db
      .prepare(
        `SELECT c.id, c.content, c.start_line, c.end_line, m.file_path
         FROM chunks c
         JOIN manifests m ON m.blob_id = c.blob_id AND m.branch = ?
         WHERE c.id = ?
         LIMIT 1`,
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

export interface IndexStats {
  readonly blobs: number;
  readonly chunks: number;
  readonly symbols: number;
  readonly refs: number;
}

export const countAll = (db: IndexDb): Effect.Effect<IndexStats, IndexDbError> =>
  wrap("countAll", () => {
    const count = (table: string): number =>
      Number(
        (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number })
          .n,
      );
    return {
      blobs: count("blobs"),
      chunks: count("chunks"),
      symbols: count("symbols"),
      refs: count("refs"),
    };
  });
