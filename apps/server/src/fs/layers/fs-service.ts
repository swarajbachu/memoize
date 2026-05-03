import * as path from "node:path";

import { FileSystem, Path } from "@effect/platform";
import { Effect, Layer } from "effect";

import {
  FsEntry,
  FsFolderNotFoundError,
  FsPathOutsideError,
  FsReadError,
  type FolderId,
} from "@forkzero/wire";

import { WorkspaceService } from "../../workspace/services/workspace-service.ts";
import { FsService } from "../services/fs-service.ts";

// Skip directories that are large, irrelevant, or just noise in a code-tree
// view. Match by basename. Hidden dotfiles other than `.git` still show up —
// users often want to see `.env`, `.github/`, `.vscode/`, etc.
const SKIP_DIRS = new Set([".git", "node_modules", ".DS_Store"]);

const toForwardSlash = (p: string): string =>
  path.sep === "/" ? p : p.split(path.sep).join("/");

export const FsServiceLive = Layer.effect(
  FsService,
  Effect.gen(function* () {
    const workspace = yield* WorkspaceService;
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;

    const tree: FsService["Type"]["tree"] = (
      folderId: FolderId,
      relPath: string,
    ) =>
      Effect.gen(function* () {
        const folder = yield* workspace.findById(folderId);
        if (folder === null) {
          return yield* Effect.fail(new FsFolderNotFoundError({ folderId }));
        }
        const rootAbs = pathSvc.resolve(folder.path);

        // Resolve the requested subpath against the root and reject anything
        // that escapes (`..` traversal, absolute paths, symlinks pointing
        // outside). The renderer only ever asks for entries it just got
        // from a previous call, so this is belt-and-suspenders.
        const requestedAbs = pathSvc.resolve(rootAbs, relPath);
        const rel = pathSvc.relative(rootAbs, requestedAbs);
        if (rel.startsWith("..") || pathSvc.isAbsolute(rel)) {
          return yield* Effect.fail(
            new FsPathOutsideError({ folderId, path: relPath }),
          );
        }

        const names = yield* fs.readDirectory(requestedAbs).pipe(
          Effect.mapError(
            (cause) =>
              new FsReadError({
                folderId,
                path: relPath,
                reason: cause.message ?? String(cause),
              }),
          ),
        );

        // Stat every entry so we know file vs directory. A failed stat
        // (broken symlink, racey delete) just drops that entry; one bad
        // entry shouldn't blank the whole listing.
        const stats = yield* Effect.forEach(names, (name) =>
          Effect.gen(function* () {
            const entryAbs = pathSvc.join(requestedAbs, name);
            const stat = yield* fs.stat(entryAbs).pipe(Effect.option);
            if (stat._tag === "None") return null;
            const kind = stat.value.type === "Directory" ? "directory" : "file";
            if (kind === "directory" && SKIP_DIRS.has(name)) return null;
            const childRel = relPath === "" ? name : `${relPath}/${name}`;
            return FsEntry.make({
              name,
              path: toForwardSlash(childRel),
              kind,
            });
          }),
        );

        const entries = stats.filter((e): e is FsEntry => e !== null);
        // Dirs first, then files; case-insensitive within each group.
        entries.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });
        return entries;
      });

    return { tree } as const;
  }),
);
