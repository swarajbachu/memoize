import { Effect } from "effect";

import { type IndexDb } from "../db/sqlite.ts";
import { IndexDbError } from "../errors.ts";

interface Migration {
  readonly id: string;
  readonly up: (db: IndexDb) => void;
}

/**
 * Numbered SQL migrations for the per-workspace index DB. Never edit a
 * shipped migration — supersede it with a new id. The migrator records
 * applied ids in `index_migrations`.
 */
const migrations: ReadonlyArray<Migration> = [
  {
    id: "0001_initial",
    up: (db) => {
      db.exec(`
        CREATE TABLE blobs (
          id INTEGER PRIMARY KEY,
          sha BLOB NOT NULL UNIQUE,
          language TEXT NOT NULL,
          size INTEGER NOT NULL,
          parsed_at INTEGER NOT NULL
        );

        CREATE TABLE symbols (
          id INTEGER PRIMARY KEY,
          blob_id INTEGER NOT NULL REFERENCES blobs(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          signature TEXT,
          start_line INTEGER NOT NULL,
          end_line INTEGER NOT NULL,
          parent_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
          exported INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX symbols_name ON symbols(name);
        CREATE INDEX symbols_parent ON symbols(parent_id);
        CREATE INDEX symbols_blob ON symbols(blob_id);

        CREATE TABLE chunks (
          id INTEGER PRIMARY KEY,
          blob_id INTEGER NOT NULL REFERENCES blobs(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          start_line INTEGER NOT NULL,
          end_line INTEGER NOT NULL,
          symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
          content TEXT NOT NULL
        );
        CREATE INDEX chunks_blob ON chunks(blob_id);
        CREATE INDEX chunks_symbol ON chunks(symbol_id);

        CREATE TABLE refs (
          id INTEGER PRIMARY KEY,
          symbol_id INTEGER NOT NULL,
          blob_id INTEGER NOT NULL REFERENCES blobs(id) ON DELETE CASCADE,
          start_line INTEGER NOT NULL,
          end_line INTEGER NOT NULL,
          context TEXT NOT NULL
        );
        CREATE INDEX refs_symbol ON refs(symbol_id);
        CREATE INDEX refs_blob ON refs(blob_id);

        CREATE TABLE manifests (
          branch TEXT NOT NULL,
          file_path TEXT NOT NULL,
          blob_id INTEGER NOT NULL REFERENCES blobs(id) ON DELETE CASCADE,
          PRIMARY KEY (branch, file_path)
        );
        CREATE INDEX manifests_blob ON manifests(blob_id);
        CREATE INDEX manifests_branch ON manifests(branch);
      `);
    },
  },
];

/**
 * Apply every migration whose id isn't already in `index_migrations`. Runs
 * synchronously inside `Effect.try`. better-sqlite3 statements throw on
 * failure — we wrap the whole batch in a transaction so a half-applied
 * migration doesn't leave the DB in an in-between state.
 */
export const runMigrations = (db: IndexDb): Effect.Effect<void, IndexDbError> =>
  Effect.try({
    try: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS index_migrations (
          id TEXT PRIMARY KEY,
          applied_at INTEGER NOT NULL
        )
      `);
      const applied = new Set(
        db
          .prepare("SELECT id FROM index_migrations")
          .all()
          .map((row) => (row as { id: string }).id),
      );
      const stmt = db.prepare(
        "INSERT INTO index_migrations (id, applied_at) VALUES (?, ?)",
      );
      const tx = db.transaction(() => {
        for (const m of migrations) {
          if (applied.has(m.id)) continue;
          m.up(db);
          stmt.run(m.id, Date.now());
        }
      });
      tx();
    },
    catch: (cause) =>
      new IndexDbError({ reason: "migration failed", cause }),
  });
