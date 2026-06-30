import { copyFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export const ZUSE_SQLITE_FILENAME = "zuse.sqlite";
const LEGACY_MEMOIZE_SQLITE_FILENAME = "memoize.sqlite";
const MIGRATION_STATE_FILENAME = "zuse-migration-state.json";
const LEGACY_USER_DATA_DIR_NAMES = [
  "memoize Alpha",
  "memoize",
  "memoize Alpha (Dev)",
  "memoize (Dev)",
] as const;
const EMPTY_SQLITE_MAX_BYTES = 64 * 1024;

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

const legacySiblingDbCandidates = async (
  userData: string,
): Promise<ReadonlyArray<string>> => {
  const appSupportDir = dirname(userData);
  const currentDirName = basename(userData);
  const candidates: string[] = [];
  for (const name of LEGACY_USER_DATA_DIR_NAMES) {
    if (name === currentDirName) continue;
    const candidate = join(appSupportDir, name, LEGACY_MEMOIZE_SQLITE_FILENAME);
    if (await exists(candidate)) candidates.push(candidate);
  }
  return candidates;
};

const newestNonEmptyLegacyDb = async (
  userData: string,
): Promise<string | null> => {
  const candidates = await legacySiblingDbCandidates(userData);
  const withStats = await Promise.all(
    candidates.map(async (path) => ({
      path,
      stats: await stat(path),
    })),
  );
  const nonEmpty = withStats
    .filter((candidate) => candidate.stats.size > EMPTY_SQLITE_MAX_BYTES)
    .sort((a, b) => {
      const sizeDiff = b.stats.size - a.stats.size;
      if (sizeDiff !== 0) return sizeDiff;
      return b.stats.mtimeMs - a.stats.mtimeMs;
    });
  return nonEmpty[0]?.path ?? null;
};

const copyLegacyDb = async (
  userData: string,
  legacy: string,
  current: string,
  kind: string,
): Promise<void> => {
  await copyFile(legacy, current);
  await writeFile(
    migrationStatePath(userData),
    `${JSON.stringify(
      {
        kind,
        from: legacy,
        to: current,
        migratedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
};

export const ensureSqliteRenameCompatibility = async (
  userData: string,
): Promise<void> => {
  const current = sqliteDbPath(userData);
  if (await exists(current)) {
    const currentStats = await stat(current);
    if (currentStats.size > EMPTY_SQLITE_MAX_BYTES) return;

    const legacySibling = await newestNonEmptyLegacyDb(userData);
    if (legacySibling === null) return;

    const backup = `${current}.empty-before-zuse-migration-${Date.now()}`;
    await rename(current, backup);
    await copyLegacyDb(
      userData,
      legacySibling,
      current,
      "memoize-app-support-to-zuse-sqlite-copy",
    );
    return;
  }

  const legacy = legacySqliteDbPath(userData);
  if (await exists(legacy)) {
    await copyLegacyDb(
      userData,
      legacy,
      current,
      "memoize-to-zuse-sqlite-copy",
    );
    return;
  }

  const legacySibling = await newestNonEmptyLegacyDb(userData);
  if (legacySibling === null) return;

  await copyLegacyDb(
    userData,
    legacySibling,
    current,
    "memoize-app-support-to-zuse-sqlite-copy",
  );
};
