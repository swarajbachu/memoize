import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer } from "effect";

import { AppPaths } from "../app-paths.ts";
import { ensureSqliteRenameCompatibility, sqliteDbPath } from "./db-path.ts";

/**
 * Live SQLite client for the chat-MVP persistence layer. Resolves the DB
 * file path against `AppPaths.userData` (provided by the host shim — Electron
 * today, WS server tomorrow). Honors `ZUSE_SQLITE_MEMORY=1` (or the legacy
 * `MEMOIZE_SQLITE_MEMORY=1`) for tests
 * and isolated benches; otherwise the file lives at
 * `<userData>/zuse.sqlite` so a user can `sqlite3` into it.
 *
 * `SqliteClient.layer` produces both `SqliteClient` (sqlite-specific:
 * `export`, `backup`, `loadExtension`) and the generic `SqlClient` —
 * downstream code yields whichever it needs.
 */
export const SqliteLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const paths = yield* AppPaths;
    const inMemory =
      process.env.ZUSE_SQLITE_MEMORY === "1" ||
      process.env.MEMOIZE_SQLITE_MEMORY === "1";
    if (!inMemory) {
      yield* Effect.tryPromise(() =>
        ensureSqliteRenameCompatibility(paths.userData),
      ).pipe(Effect.orDie);
    }
    const filename = inMemory ? ":memory:" : sqliteDbPath(paths.userData);
    return SqliteClient.layer({ filename });
  }),
);
