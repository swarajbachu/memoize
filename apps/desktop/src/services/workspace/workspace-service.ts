import { FileSystem } from "@effect/platform";
import { Effect, Ref, Schema } from "effect";
import * as Path from "node:path";

import {
  Folder,
  FolderId,
  WorkspaceDuplicatePathError,
  WorkspaceInvalidPathError,
  WorkspaceNotFoundError,
} from "@forkzero/wire";

import { AppPaths } from "../../app-paths.ts";

const WorkspaceFile = Schema.parseJson(
  Schema.Struct({
    folders: Schema.Array(Folder),
  }),
);

const loadInitial = (fs: FileSystem.FileSystem, filePath: string) =>
  fs.exists(filePath).pipe(
    Effect.flatMap((exists) =>
      exists
        ? fs.readFileString(filePath).pipe(
            Effect.flatMap(Schema.decode(WorkspaceFile)),
            Effect.map(({ folders }) => folders),
          )
        : Effect.succeed([] as ReadonlyArray<Folder>),
    ),
    Effect.catchAllCause((cause) =>
      Effect.logWarning(
        "[forkzero] failed to load workspaces.json, starting empty",
      ).pipe(
        Effect.zipRight(Effect.logDebug(cause)),
        Effect.zipRight(Effect.succeed([] as ReadonlyArray<Folder>)),
      ),
    ),
  );

export class WorkspaceService extends Effect.Service<WorkspaceService>()(
  "forkzero/WorkspaceService",
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const paths = yield* AppPaths;
      const filePath = Path.join(paths.userData, "workspaces.json");
      const tmpPath = `${filePath}.tmp`;

      const initial = yield* loadInitial(fs, filePath);
      const ref = yield* Ref.make<ReadonlyMap<FolderId, Folder>>(
        new Map(initial.map((f) => [f.id, f] as const)),
      );

      const persist = Effect.gen(function* () {
        const map = yield* Ref.get(ref);
        const folders = Array.from(map.values()).sort(
          (a, b) => a.addedAt.getTime() - b.addedAt.getTime(),
        );
        const encoded = yield* Schema.encode(WorkspaceFile)({ folders });
        yield* fs.writeFileString(tmpPath, encoded);
        yield* fs.rename(tmpPath, filePath);
      }).pipe(Effect.orDie);

      const list = (): Effect.Effect<ReadonlyArray<Folder>> =>
        Effect.gen(function* () {
          const map = yield* Ref.get(ref);
          return Array.from(map.values()).sort(
            (a, b) => a.addedAt.getTime() - b.addedAt.getTime(),
          );
        });

      const add = (
        rawPath: string,
      ): Effect.Effect<
        Folder,
        WorkspaceDuplicatePathError | WorkspaceInvalidPathError
      > =>
        Effect.gen(function* () {
          const resolved = Path.resolve(rawPath);

          const stat = yield* fs.stat(resolved).pipe(
            Effect.mapError(
              () =>
                new WorkspaceInvalidPathError({
                  path: resolved,
                  reason: "path does not exist",
                }),
            ),
          );
          if (stat.type !== "Directory") {
            return yield* Effect.fail(
              new WorkspaceInvalidPathError({
                path: resolved,
                reason: "path is not a directory",
              }),
            );
          }

          const map = yield* Ref.get(ref);
          for (const existing of map.values()) {
            if (existing.path === resolved) {
              return yield* Effect.fail(
                new WorkspaceDuplicatePathError({ path: resolved }),
              );
            }
          }

          const folder = Folder.make({
            id: FolderId.make(crypto.randomUUID()),
            path: resolved,
            name: Path.basename(resolved) || resolved,
            addedAt: new Date(),
          });

          yield* Ref.update(ref, (m) => {
            const next = new Map(m);
            next.set(folder.id, folder);
            return next;
          });
          yield* persist;
          return folder;
        });

      const remove = (
        folderId: FolderId,
      ): Effect.Effect<void, WorkspaceNotFoundError> =>
        Effect.gen(function* () {
          const map = yield* Ref.get(ref);
          if (!map.has(folderId)) {
            return yield* Effect.fail(
              new WorkspaceNotFoundError({ folderId }),
            );
          }
          yield* Ref.update(ref, (m) => {
            const next = new Map(m);
            next.delete(folderId);
            return next;
          });
          yield* persist;
        });

      return { add, list, remove } as const;
    }),
  },
) {}
