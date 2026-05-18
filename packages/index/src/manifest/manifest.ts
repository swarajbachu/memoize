import { Effect } from "effect";

import { type IndexDb } from "../db/sqlite.ts";
import { IndexDbError } from "../errors.ts";

const wrap = <A>(reason: string, fn: () => A): Effect.Effect<A, IndexDbError> =>
  Effect.try({
    try: fn,
    catch: (cause) => new IndexDbError({ reason, cause }),
  });

/**
 * Set (branch, filePath) → blobId. Used during the indexing walk: once a
 * blob is in the store, its mapping under the active branch is written.
 * Idempotent via REPLACE — re-indexing a file overwrites the prior entry.
 */
export const setManifestEntry = (
  db: IndexDb,
  branch: string,
  filePath: string,
  blobId: number,
): Effect.Effect<void, IndexDbError> =>
  wrap("setManifestEntry", () => {
    db.prepare(
      `INSERT INTO manifests (branch, file_path, blob_id)
       VALUES (?, ?, ?)
       ON CONFLICT(branch, file_path) DO UPDATE SET blob_id = excluded.blob_id`,
    ).run(branch, filePath, blobId);
  });

/**
 * Bulk-set in one tx — used by the indexer when seeding a fresh branch
 * from a snapshot. Avoids one statement per file.
 */
export const setManifestBulk = (
  db: IndexDb,
  branch: string,
  entries: ReadonlyArray<{ readonly filePath: string; readonly blobId: number }>,
): Effect.Effect<void, IndexDbError> =>
  wrap("setManifestBulk", () => {
    const stmt = db.prepare(
      `INSERT INTO manifests (branch, file_path, blob_id)
       VALUES (?, ?, ?)
       ON CONFLICT(branch, file_path) DO UPDATE SET blob_id = excluded.blob_id`,
    );
    const tx = db.transaction(() => {
      for (const e of entries) stmt.run(branch, e.filePath, e.blobId);
    });
    tx();
  });

export const removeManifestEntry = (
  db: IndexDb,
  branch: string,
  filePath: string,
): Effect.Effect<void, IndexDbError> =>
  wrap("removeManifestEntry", () => {
    db.prepare(
      "DELETE FROM manifests WHERE branch = ? AND file_path = ?",
    ).run(branch, filePath);
  });

export const listManifest = (
  db: IndexDb,
  branch: string,
): Effect.Effect<
  ReadonlyArray<{ readonly filePath: string; readonly blobId: number }>,
  IndexDbError
> =>
  wrap("listManifest", () => {
    const rows = db
      .prepare("SELECT file_path, blob_id FROM manifests WHERE branch = ?")
      .all(branch) as Array<{ file_path: string; blob_id: number }>;
    return rows.map((r) => ({ filePath: r.file_path, blobId: r.blob_id }));
  });

export const branchExists = (
  db: IndexDb,
  branch: string,
): Effect.Effect<boolean, IndexDbError> =>
  wrap("branchExists", () => {
    const row = db
      .prepare("SELECT 1 FROM manifests WHERE branch = ? LIMIT 1")
      .get(branch);
    return row !== undefined;
  });
