import { SqliteMigrator } from "@effect/sql-sqlite-node";

import { Migration0001Initial } from "./migrations/0001_initial.ts";
import { Migration0002Permissions } from "./migrations/0002_permissions.ts";
import { Migration0003ResumeAndExport } from "./migrations/0003_resume_and_export.ts";

/**
 * Runs every numbered migration on boot. `fromRecord` keys must match
 * `^\d+_<name>$` — the leading number is the migration id, used by the
 * `effect_sql_migrations` table to track what's applied.
 *
 * Add new migrations by appending entries. Never edit a shipped migration —
 * supersede it with a new id.
 */
export const MigrationsLive = SqliteMigrator.layer({
  loader: SqliteMigrator.fromRecord({
    "0001_initial": Migration0001Initial,
    "0002_permissions": Migration0002Permissions,
    "0003_resume_and_export": Migration0003ResumeAndExport,
  }),
});
