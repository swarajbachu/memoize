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

// `selectedFolderId` is optional with a `null` default so that workspaces.json
// files written by older builds (which had no selection field) decode cleanly.
const WorkspaceFile = Schema.parseJson(
  Schema.Struct({
    folders: Schema.Array(Folder),
    selectedFolderId: Schema.optionalWith(Schema.NullOr(FolderId), {
      default: () => null,
    }),
  }),
);

interface WorkspaceState {
  readonly folders: ReadonlyArray<Folder>;
  readonly selectedFolderId: FolderId | null;
}

const loadInitial = (
  fs: FileSystem.FileSystem,
  filePath: string,
): Effect.Effect<WorkspaceState> =>
  fs.exists(filePath).pipe(
    Effect.flatMap((exists) =>
      exists
        ? fs.readFileString(filePath).pipe(
            Effect.flatMap(Schema.decode(WorkspaceFile)),
            Effect.map(
              ({ folders, selectedFolderId }): WorkspaceState => ({
                folders,
                selectedFolderId,
              }),
            ),
          )
        : Effect.succeed<WorkspaceState>({
            folders: [],
            selectedFolderId: null,
          }),
    ),
    Effect.catchAllCause((cause) =>
      Effect.logWarning(
        "[forkzero] failed to load workspaces.json, starting empty",
      ).pipe(
        Effect.zipRight(Effect.logDebug(cause)),
        Effect.zipRight(
          Effect.succeed<WorkspaceState>({
            folders: [],
            selectedFolderId: null,
          }),
        ),
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
      const foldersRef = yield* Ref.make<ReadonlyMap<FolderId, Folder>>(
        new Map(initial.folders.map((f) => [f.id, f] as const)),
      );
      // Drop a stale persisted selection if its folder no longer exists.
      const initialSelected =
        initial.selectedFolderId !== null &&
        initial.folders.some((f) => f.id === initial.selectedFolderId)
          ? initial.selectedFolderId
          : null;
      const selectedRef = yield* Ref.make<FolderId | null>(initialSelected);

      const persist = Effect.gen(function* () {
        const map = yield* Ref.get(foldersRef);
        const selectedFolderId = yield* Ref.get(selectedRef);
        const folders = Array.from(map.values()).sort(
          (a, b) => a.addedAt.getTime() - b.addedAt.getTime(),
        );
        const encoded = yield* Schema.encode(WorkspaceFile)({
          folders,
          selectedFolderId,
        });
        yield* fs.writeFileString(tmpPath, encoded);
        yield* fs.rename(tmpPath, filePath);
      }).pipe(Effect.orDie);

      const list = (): Effect.Effect<ReadonlyArray<Folder>> =>
        Effect.gen(function* () {
          const map = yield* Ref.get(foldersRef);
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

          const map = yield* Ref.get(foldersRef);
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

          yield* Ref.update(foldersRef, (m) => {
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
          const map = yield* Ref.get(foldersRef);
          if (!map.has(folderId)) {
            return yield* Effect.fail(
              new WorkspaceNotFoundError({ folderId }),
            );
          }
          yield* Ref.update(foldersRef, (m) => {
            const next = new Map(m);
            next.delete(folderId);
            return next;
          });
          // If we just removed the selected folder, clear the selection so the
          // persisted file never points to a missing id.
          const selected = yield* Ref.get(selectedRef);
          if (selected === folderId) {
            yield* Ref.set(selectedRef, null);
          }
          yield* persist;
        });

      const getSelected = (): Effect.Effect<FolderId | null> =>
        Ref.get(selectedRef);

      const setSelected = (
        folderId: FolderId | null,
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          if (folderId !== null) {
            const map = yield* Ref.get(foldersRef);
            if (!map.has(folderId)) {
              // Caller asked for a folder we don't know about; treat as clear.
              yield* Ref.set(selectedRef, null);
              yield* persist;
              return;
            }
          }
          yield* Ref.set(selectedRef, folderId);
          yield* persist;
        });

      const findById = (
        folderId: FolderId,
      ): Effect.Effect<Folder | null> =>
        Effect.map(
          Ref.get(foldersRef),
          (map) => map.get(folderId) ?? null,
        );

      return {
        add,
        list,
        remove,
        getSelected,
        setSelected,
        findById,
      } as const;
    }),
  },
) {}
