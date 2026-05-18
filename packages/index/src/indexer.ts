import { Effect } from "effect";

import { blakeOf } from "./blob/hash.ts";
import { persistParse, upsertBlob } from "./blob/store.ts";
import { chunkSource } from "./chunker/index.ts";
import { detectLanguage } from "./chunker/language.ts";
import { type IndexDb } from "./db/sqlite.ts";
import { setManifestBulk } from "./manifest/manifest.ts";
import { walkRepo } from "./walker.ts";
import { type IndexError } from "./errors.ts";

export interface IndexProgress {
  readonly processed: number;
  readonly total: number;
  readonly newBlobs: number;
  readonly dedupedBlobs: number;
}

export type ProgressSink = (p: IndexProgress) => void;

/**
 * Index every file under `root` and persist it under the (`branch`)
 * manifest. Returns counters useful for tests + the `index.status` RPC.
 *
 * The dedup story: if we've seen a file's exact bytes before — same branch
 * different session, different branch same file — `upsertBlob` returns
 * `isNew: false` and we skip the chunker entirely. Re-indexing two branches
 * that share 95% of files costs 5% the parse work.
 */
export const indexRepo = (
  db: IndexDb,
  root: string,
  branch: string,
  onProgress?: ProgressSink,
): Effect.Effect<IndexProgress, IndexError> =>
  Effect.gen(function* () {
    const files = yield* walkRepo(root);
    let newBlobs = 0;
    let dedupedBlobs = 0;
    const manifestEntries: Array<{ filePath: string; blobId: number }> = [];
    const total = files.length;

    let processed = 0;
    for (const file of files) {
      const language = detectLanguage(file.relPath);
      const sha = blakeOf(file.bytes);
      const { blobId, isNew } = yield* upsertBlob(
        db,
        sha,
        language,
        file.bytes.length,
      );
      if (isNew) {
        const source = file.bytes.toString("utf8");
        const parsed = yield* chunkSource(file.relPath, source, language);
        yield* persistParse(db, blobId, parsed.symbols, parsed.chunks);
        newBlobs++;
      } else {
        dedupedBlobs++;
      }
      manifestEntries.push({ filePath: file.relPath, blobId });
      processed++;
      if (onProgress && processed % 50 === 0) {
        onProgress({ processed, total, newBlobs, dedupedBlobs });
      }
    }

    yield* setManifestBulk(db, branch, manifestEntries);
    const final = { processed, total, newBlobs, dedupedBlobs };
    onProgress?.(final);
    return final;
  });
