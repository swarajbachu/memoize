import { execFile } from "node:child_process";
import { copyFile, rename, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

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
const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

type SqliteRow = Record<string, unknown>;
type SqliteStatement = {
  readonly get: () => SqliteRow | undefined;
};
type SqliteDatabase = {
  readonly prepare: (sql: string) => SqliteStatement;
  readonly close: () => void;
};
type SqliteDatabaseConstructor = new (
  path: string,
  options: { readonly readonly: boolean; readonly fileMustExist: boolean },
) => SqliteDatabase;
const Database = require("better-sqlite3") as SqliteDatabaseConstructor;

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

const projectCount = (path: string): number | null => {
  try {
    const db = new Database(path, { readonly: true, fileMustExist: true });
    try {
      const hasProjects = db
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'projects'",
        )
        .get();
      if (typeof hasProjects?.count !== "number" || !hasProjects.count) {
        return 0;
      }

      const projects = db
        .prepare("SELECT count(*) AS count FROM projects")
        .get();
      return typeof projects?.count === "number" ? projects.count : 0;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
};

const projectCountViaSqliteCli = async (path: string): Promise<number | null> => {
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/sqlite3",
      [
        path,
        "SELECT CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'projects') THEN (SELECT count(*) FROM projects) ELSE 0 END;",
      ],
      { timeout: 2_000 },
    );
    const count = Number(stdout.trim());
    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
};

const detectedProjectCount = async (path: string): Promise<number | null> =>
  projectCount(path) ?? (await projectCountViaSqliteCli(path));

const looksEmpty = async (path: string): Promise<boolean> => {
  const projects = await detectedProjectCount(path);
  if (projects !== null) return projects === 0;
  return (await stat(path)).size <= EMPTY_SQLITE_MAX_BYTES;
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
      projects: await detectedProjectCount(path),
      stats: await stat(path),
    })),
  );
  const nonEmpty = withStats
    .filter((candidate) =>
      candidate.projects !== null
        ? candidate.projects > 0
        : candidate.stats.size > EMPTY_SQLITE_MAX_BYTES,
    )
    .sort((a, b) => {
      const projectDiff = (b.projects ?? 0) - (a.projects ?? 0);
      if (projectDiff !== 0) return projectDiff;
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
    if (!(await looksEmpty(current))) return;

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
