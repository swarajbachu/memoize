import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as Path from "node:path";

import {
  ensureSqliteRenameCompatibility,
  sqliteDbPath,
} from "../src/persistence/db-path.ts";

describe("ensureSqliteRenameCompatibility", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(Path.join(os.tmpdir(), "zuse-db-path-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("copies memoize.sqlite to zuse.sqlite once and records the migration", async () => {
    const legacyPath = Path.join(dir, "memoize.sqlite");
    await fs.writeFile(legacyPath, "legacy-db");

    await ensureSqliteRenameCompatibility(dir);

    expect(await fs.readFile(sqliteDbPath(dir), "utf8")).toBe("legacy-db");

    const state = JSON.parse(
      await fs.readFile(Path.join(dir, "zuse-migration-state.json"), "utf8"),
    ) as {
      kind?: string;
      from?: string;
      to?: string;
      migratedAt?: string;
    };
    expect(state.kind).toBe("memoize-to-zuse-sqlite-copy");
    expect(state.from).toBe("memoize.sqlite");
    expect(state.to).toBe("zuse.sqlite");
    expect(typeof state.migratedAt).toBe("string");

    await fs.writeFile(sqliteDbPath(dir), "current-db");
    await ensureSqliteRenameCompatibility(dir);

    expect(await fs.readFile(sqliteDbPath(dir), "utf8")).toBe("current-db");
  });

  it("does nothing when there is no legacy database", async () => {
    await ensureSqliteRenameCompatibility(dir);

    expect(fsSync.existsSync(sqliteDbPath(dir))).toBe(false);
    expect(fsSync.existsSync(Path.join(dir, "zuse-migration-state.json"))).toBe(
      false,
    );
  });
});
