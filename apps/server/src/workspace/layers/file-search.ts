import * as path from "node:path";

import { FileSystem, Path } from "@effect/platform";
import { Effect, Layer } from "effect";

import { FsFolderNotFoundError } from "@forkzero/wire";

import {
  FileSearchService,
  type FileSearchHit,
  type FileSearchServiceShape,
} from "../services/file-search.ts";
import { WorkspaceService } from "../services/workspace-service.ts";

/**
 * Directories we skip outright. Same shape as FsService — keep these in
 * sync if either grows. Matched on basename.
 */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".turbo",
  ".next",
  ".vite",
  ".cache",
  ".DS_Store",
]);

/** Cap how deep we descend so a runaway monorepo can't hang the picker. */
const MAX_DEPTH = 12;

/**
 * Cap the *visited* node count too, independent of `limit`. The popover
 * filters client-side after the server returns; we still want the search
 * to terminate quickly even when the user hasn't typed yet.
 */
const MAX_VISITED = 5_000;

const DEFAULT_LIMIT = 20;

const toForwardSlash = (p: string): string =>
  path.sep === "/" ? p : p.split(path.sep).join("/");

const matches = (
  needle: string,
  basename: string,
  relPath: string,
): boolean => {
  if (!needle) return true;
  const n = needle.toLowerCase();
  return (
    basename.toLowerCase().includes(n) || relPath.toLowerCase().includes(n)
  );
};

export const FileSearchServiceLive = Layer.effect(
  FileSearchService,
  Effect.gen(function* () {
    const workspace = yield* WorkspaceService;
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;

    const search: FileSearchServiceShape["search"] = (
      folderId,
      query,
      limit,
    ) =>
      Effect.gen(function* () {
        const folder = yield* workspace.findById(folderId);
        if (folder === null) {
          return yield* Effect.fail(new FsFolderNotFoundError({ folderId }));
        }
        const cap = limit && limit > 0 ? limit : DEFAULT_LIMIT;
        const rootAbs = pathSvc.resolve(folder.path);

        const hits: FileSearchHit[] = [];
        let visited = 0;

        const walk = (
          absDir: string,
          relDir: string,
          depth: number,
        ): Effect.Effect<void> =>
          Effect.gen(function* () {
            if (hits.length >= cap || visited >= MAX_VISITED) return;
            if (depth > MAX_DEPTH) return;

            const names = yield* fs
              .readDirectory(absDir)
              .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));

            // Sort to keep results stable across runs and so directories
            // are visited in a predictable order.
            const sorted = [...names].sort((a, b) =>
              a.localeCompare(b, undefined, { sensitivity: "base" }),
            );

            for (const name of sorted) {
              if (hits.length >= cap || visited >= MAX_VISITED) return;
              if (SKIP_DIRS.has(name)) continue;

              visited++;
              const childAbs = pathSvc.join(absDir, name);
              const childRel = relDir === "" ? name : `${relDir}/${name}`;

              const stat = yield* fs.stat(childAbs).pipe(Effect.option);
              if (stat._tag === "None") continue;
              const kind =
                stat.value.type === "Directory" ? "directory" : "file";

              if (matches(query, name, childRel)) {
                hits.push({
                  relPath: toForwardSlash(childRel),
                  absPath: childAbs,
                  kind,
                });
              }

              if (kind === "directory") {
                yield* walk(childAbs, childRel, depth + 1);
              }
            }
          });

        yield* walk(rootAbs, "", 0);
        return hits;
      });

    return { search } satisfies FileSearchServiceShape;
  }),
);
