import { copyFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const ZUSE_SQLITE_FILENAME = "zuse.sqlite";
const LEGACY_MEMOIZE_SQLITE_FILENAME = "memoize.sqlite";
const MIGRATION_STATE_FILENAME = "zuse-migration-state.json";

export const sqliteDbPath = (userData: string): string =>
  join(userData, ZUSE_SQLITE_FILENAME);

export const legacySqliteDbPath = (userData: string): string =>
  join(userData, LEGACY_MEMOIZE_SQLITE_FILENAME);

const migrationStatePath = (userData: string): string =>
  join(userData, MIGRATION_STATE_FILENAME);

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

export const ensureSqliteRenameCompatibility = async (
  userData: string,
): Promise<void> => {
  const current = sqliteDbPath(userData);
  if (await exists(current)) return;

  const legacy = legacySqliteDbPath(userData);
  if (!(await exists(legacy))) return;

  await copyFile(legacy, current);
  await writeFile(
    migrationStatePath(userData),
    `${JSON.stringify(
      {
        kind: "memoize-to-zuse-sqlite-copy",
        from: LEGACY_MEMOIZE_SQLITE_FILENAME,
        to: ZUSE_SQLITE_FILENAME,
        migratedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
};
