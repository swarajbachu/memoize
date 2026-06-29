import { copyFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const ZUSE_SQLITE_FILENAME = "zuse.sqlite";
const LEGACY_MEMOIZE_SQLITE_FILENAME = "memoize.sqlite";

export const sqliteDbPath = (userData: string): string =>
  join(userData, ZUSE_SQLITE_FILENAME);

export const legacySqliteDbPath = (userData: string): string =>
  join(userData, LEGACY_MEMOIZE_SQLITE_FILENAME);

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
};
