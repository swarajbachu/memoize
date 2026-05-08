import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer } from "effect";
import { join } from "node:path";

import { AppPaths } from "../app-paths.ts";

/**
 * Live SQLite client for the chat-MVP persistence layer. Resolves the DB
 * file path against `AppPaths.userData` (provided by the host shim — Electron
 * today, WS server tomorrow). Honors `MEMOIZE_SQLITE_MEMORY=1` for tests
 * and isolated benches; otherwise the file lives at
 * `<userData>/memoize.sqlite` so a user can `sqlite3` into it.
 *
 * `SqliteClient.layer` produces both `SqliteClient` (sqlite-specific:
 * `export`, `backup`, `loadExtension`) and the generic `SqlClient` —
 * downstream code yields whichever it needs.
 */
export const SqliteLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const paths = yield* AppPaths;
    const filename =
      process.env.MEMOIZE_SQLITE_MEMORY === "1"
        ? ":memory:"
        : join(paths.userData, "memoize.sqlite");
    return SqliteClient.layer({ filename });
  }),
);
