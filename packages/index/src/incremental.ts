import { Effect } from "effect";
import { promises as fs } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";

import { blakeOf } from "./blob/hash.ts";
import { persistParse, upsertBlob } from "./blob/store.ts";
import { chunkSource } from "./chunker/index.ts";
import { detectLanguage } from "./chunker/language.ts";
import { type IndexDb } from "./db/sqlite.ts";
import {
  removeManifestEntry,
  setManifestEntry,
} from "./manifest/manifest.ts";
import { type IndexError, IndexIoError } from "./errors.ts";

const toPosix = (p: string): string => (sep === "/" ? p : p.split(sep).join("/"));

const toRel = (root: string, abs: string): string => {
  const p = isAbsolute(abs) ? relative(root, abs) : abs;
  return toPosix(p);
};

/**
 * Re-index a single file. Cheap when the file's content hash matches an
 * existing blob (skip parse, just update the manifest); full pipeline
 * when the hash is new. Target latency on a 1 KB file: < 50ms.
 *
 * Returns the blob id + a flag indicating whether we parsed (useful for
 * watcher metrics: most edits churn already-known content as the user
 * undo/redos).
 */
export const reindexFile = (
  db: IndexDb,
  root: string,
  absPath: string,
  branch: string,
): Effect.Effect<{ blobId: number; parsed: boolean }, IndexError> =>
  Effect.gen(function* () {
    const rel = toRel(root, absPath);
    const bytes = yield* Effect.tryPromise({
      try: () => fs.readFile(absPath),
      catch: (cause) =>
        new IndexIoError({ path: absPath, reason: "read failed", cause }),
    });
    const language = detectLanguage(rel);
    const sha = blakeOf(bytes);
    const { blobId, isNew } = yield* upsertBlob(
      db,
      sha,
      language,
      bytes.length,
    );
    if (isNew) {
      const source = bytes.toString("utf8");
      const parsed = yield* chunkSource(rel, source, language);
      yield* persistParse(db, blobId, parsed.symbols, parsed.chunks);
    }
    yield* setManifestEntry(db, branch, rel, blobId);
    return { blobId, parsed: isNew };
  });

/**
 * Drop a file from the manifest under one branch — chunks/blobs survive
 * because other branches or other workspaces may still reference them.
 * Garbage collection of orphan blobs is a separate, opt-in path (not
 * called automatically; the dedup wins are too valuable to risk losing
 * a blob a sibling workspace just re-indexed).
 */
export const forgetFile = (
  db: IndexDb,
  root: string,
  absPath: string,
  branch: string,
): Effect.Effect<void, IndexError> => {
  const rel = toRel(root, absPath);
  return removeManifestEntry(db, branch, rel);
};
