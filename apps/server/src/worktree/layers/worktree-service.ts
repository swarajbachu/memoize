import { Command, CommandExecutor, FileSystem } from "@effect/platform";
import { SqlClient } from "@effect/sql";
import { Effect, Layer, Stream } from "effect";
import * as os from "node:os";
import * as Path from "node:path";

import {
  type FolderId,
  Worktree,
  WorktreeCreateError,
  WorktreeDirtyError,
  WorktreeId,
  WorktreeNotFoundError,
  WorktreeRemoveError,
} from "@memoize/wire";

import { WorkspaceService } from "../../workspace/services/workspace-service.ts";
import { generateCoolName } from "../cool-name.ts";
import {
  WorktreeService,
  type WorktreeRestoreSnapshot,
} from "../services/worktree-service.ts";

interface WorktreeRow {
  readonly id: string;
  readonly project_id: string;
  readonly path: string;
  readonly name: string;
  readonly branch: string;
  readonly base_branch: string;
  readonly created_at: string;
}

const rowToWorktree = (row: WorktreeRow): Worktree =>
  Worktree.make({
    id: WorktreeId.make(row.id),
    projectId: row.project_id as FolderId,
    path: row.path,
    name: row.name,
    branch: row.branch,
    baseBranch: row.base_branch,
    createdAt: new Date(row.created_at),
  });

export const WorktreeServiceLive = Layer.effect(
  WorktreeService,
  Effect.gen(function* () {
    const workspace = yield* WorkspaceService;
    const executor = yield* CommandExecutor.CommandExecutor;
    const fs = yield* FileSystem.FileSystem;
    const sql = yield* SqlClient.SqlClient;

    const collectText = (
      s: Stream.Stream<
        Uint8Array,
        import("@effect/platform/Error").PlatformError
      >,
    ) =>
      s.pipe(
        Stream.decodeText("utf-8"),
        Stream.runFold("", (acc, chunk) => acc + chunk),
      );

    /**
     * Run `git ...` in `cwd`. Resolves to stdout on exit-zero; converts every
     * other outcome (non-zero exit, ENOENT, BadArgument) into a single
     * `string` error reason the callers wrap into the appropriate domain
     * error. Mirrors `GitServiceLive.run` but stays self-contained so
     * domains remain independent.
     */
    const runGit = (cwd: string, args: ReadonlyArray<string>) =>
      Effect.scoped(
        Effect.gen(function* () {
          const cmd = Command.make("git", ...args).pipe(
            Command.workingDirectory(cwd),
          );
          const proc = yield* executor.start(cmd);
          const stdout = yield* collectText(proc.stdout);
          const stderr = yield* collectText(proc.stderr);
          const exitCode = yield* proc.exitCode;
          if (exitCode === 0) return stdout;
          return yield* Effect.fail(
            stderr.trim() || `git exited with code ${exitCode}`,
          );
        }),
      ).pipe(
        Effect.catchTags({
          SystemError: (err) =>
            Effect.fail(
              err.reason === "NotFound"
                ? "git is not installed"
                : (err.message ?? String(err)),
            ),
          BadArgument: (err) => Effect.fail(err.message ?? String(err)),
        }),
      );

    const list: WorktreeService["Type"]["list"] = (projectId) =>
      Effect.gen(function* () {
        const rows = yield* sql<WorktreeRow>`
          SELECT id, project_id, path, name, branch, base_branch, created_at
          FROM worktrees
          WHERE project_id = ${projectId}
          ORDER BY created_at DESC
        `.pipe(Effect.orDie);
        return rows.map(rowToWorktree);
      });

    const get: WorktreeService["Type"]["get"] = (worktreeId) =>
      Effect.gen(function* () {
        const rows = yield* sql<WorktreeRow>`
          SELECT id, project_id, path, name, branch, base_branch, created_at
          FROM worktrees
          WHERE id = ${worktreeId}
          LIMIT 1
        `.pipe(Effect.orDie);
        return rows.length > 0 ? rowToWorktree(rows[0]!) : null;
      });

    const create: WorktreeService["Type"]["create"] = (projectId) =>
      Effect.gen(function* () {
        const folder = yield* workspace.findById(projectId);
        if (folder === null) {
          return yield* Effect.fail(
            new WorktreeCreateError({
              projectId,
              reason: "project not found",
            }),
          );
        }
        const repoPath = folder.path;
        // Layout: ~/.memoize/<repo-name>-<projectId-short>/<branch>/. Living
        // in the user's home dir (next to Downloads, Developer, etc.) keeps
        // the repo itself untouched — `git status`, file pickers, and any
        // tree walker stay clean. The projectId suffix disambiguates two
        // registered projects that happen to share a folder name.
        const baseDir = Path.join(
          os.homedir(),
          ".memoize",
          `${folder.name}-${folder.id.slice(0, 8)}`,
        );

        yield* fs.makeDirectory(baseDir, { recursive: true }).pipe(
          Effect.mapError(
            (err) =>
              new WorktreeCreateError({
                projectId,
                reason: `mkdir failed: ${err.message ?? String(err)}`,
              }),
          ),
        );

        // Resolve current HEAD on the main repo so we can record the base
        // branch in the row. Falls back to "HEAD" if `--abbrev-ref` is
        // detached (rare for the common path).
        const headRefRaw = yield* runGit(repoPath, [
          "rev-parse",
          "--abbrev-ref",
          "HEAD",
        ]).pipe(
          Effect.mapError(
            (reason) => new WorktreeCreateError({ projectId, reason }),
          ),
        );
        const baseBranch = headRefRaw.trim() || "HEAD";

        // Prefer branching off the freshly-fetched `origin/<branch>` rather
        // than the main repo's local checkout: users live in worktrees and
        // push from there, so the local base branch (e.g. `main`) is rarely
        // pulled and goes stale. `git fetch` only touches the remote-tracking
        // ref — the main checkout is left exactly as-is. Falls back to local
        // `HEAD` when there's no `origin`, we're offline, the branch isn't on
        // origin, or HEAD is detached, so worktree creation never fails just
        // because the network/remote is unavailable.
        let baseRef = "HEAD";
        if (baseBranch !== "HEAD") {
          const fetched = yield* runGit(repoPath, [
            "fetch",
            "origin",
            baseBranch,
          ]).pipe(
            Effect.map(() => true),
            Effect.catchAll(() => Effect.succeed(false)),
          );
          if (fetched) {
            const remoteRefExists = yield* runGit(repoPath, [
              "rev-parse",
              "--verify",
              "--quiet",
              `refs/remotes/origin/${baseBranch}`,
            ]).pipe(
              Effect.map(() => true),
              Effect.catchAll(() => Effect.succeed(false)),
            );
            if (remoteRefExists) baseRef = `origin/${baseBranch}`;
          }
        }

        // Try a few cool-names before giving up. Disk, DB, and existing-branch
        // collisions all count as "pick another."
        let attempt = 0;
        while (attempt < 5) {
          attempt += 1;
          const name = generateCoolName();
          const branch = name;
          const target = Path.join(baseDir, name);

          const targetExists = yield* fs
            .exists(target)
            .pipe(Effect.catchAll(() => Effect.succeed(false)));
          if (targetExists) continue;

          const dupes = yield* sql<{ id: string }>`
            SELECT id FROM worktrees
            WHERE project_id = ${projectId} AND name = ${name}
            LIMIT 1
          `.pipe(Effect.orDie);
          if (dupes.length > 0) continue;

          // Skip if a branch with this name already exists in the repo —
          // `git worktree add -b` would fail and we'd surface a confusing
          // error. Cheap pre-flight; cool-names rarely collide.
          const branchExists = yield* runGit(repoPath, [
            "rev-parse",
            "--verify",
            "--quiet",
            `refs/heads/${branch}`,
          ]).pipe(
            Effect.map(() => true),
            Effect.catchAll(() => Effect.succeed(false)),
          );
          if (branchExists) continue;

          // git worktree add -b <branch> <target> <baseRef>
          // baseRef is the freshly-fetched `origin/<branch>` when available,
          // otherwise local `HEAD` (see baseRef resolution above).
          const addResult = yield* runGit(repoPath, [
            "worktree",
            "add",
            "-b",
            branch,
            target,
            baseRef,
          ]).pipe(Effect.either);
          if (addResult._tag === "Left") {
            return yield* Effect.fail(
              new WorktreeCreateError({
                projectId,
                reason: addResult.left,
              }),
            );
          }

          const id = WorktreeId.make(crypto.randomUUID());
          const now = new Date();
          const nowIso = now.toISOString();
          yield* sql`
            INSERT INTO worktrees
              (id, project_id, path, name, branch, base_branch, created_at)
            VALUES
              (${id}, ${projectId}, ${target}, ${name}, ${branch}, ${baseBranch}, ${nowIso})
          `.pipe(Effect.orDie);
          return Worktree.make({
            id,
            projectId,
            path: target,
            name,
            branch,
            baseBranch,
            createdAt: now,
          });
        }
        return yield* Effect.fail(
          new WorktreeCreateError({
            projectId,
            reason: "could not pick a unique worktree name",
          }),
        );
      });

    const remove: WorktreeService["Type"]["remove"] = (worktreeId, force) =>
      Effect.gen(function* () {
        const row = yield* get(worktreeId);
        if (row === null) {
          return yield* Effect.fail(new WorktreeNotFoundError({ worktreeId }));
        }
        const folder = yield* workspace.findById(row.projectId);
        if (folder === null) {
          // Project gone; just drop the row and let disk be.
          yield* sql`DELETE FROM worktrees WHERE id = ${worktreeId}`.pipe(
            Effect.orDie,
          );
          return;
        }

        const args = ["worktree", "remove"] as string[];
        if (force) args.push("--force");
        args.push(row.path);
        const result = yield* runGit(folder.path, args).pipe(Effect.either);
        if (result._tag === "Left") {
          const lower = result.left.toLowerCase();
          if (
            !force &&
            (lower.includes("contains modified or untracked files") ||
              lower.includes("is dirty") ||
              lower.includes("has changes"))
          ) {
            return yield* Effect.fail(new WorktreeDirtyError({ worktreeId }));
          }
          return yield* Effect.fail(
            new WorktreeRemoveError({ worktreeId, reason: result.left }),
          );
        }

        yield* sql`DELETE FROM worktrees WHERE id = ${worktreeId}`.pipe(
          Effect.orDie,
        );
      });

    const restore: WorktreeService["Type"]["restore"] = (
      snapshot: WorktreeRestoreSnapshot,
    ) =>
      Effect.gen(function* () {
        const folder = yield* workspace.findById(snapshot.projectId);
        if (folder === null) {
          return yield* Effect.fail(
            new WorktreeRemoveError({
              worktreeId: snapshot.id,
              reason: "project not found",
            }),
          );
        }

        const existing = yield* get(snapshot.id);
        if (existing !== null) return existing;

        const targetExists = yield* fs
          .exists(snapshot.path)
          .pipe(Effect.catchAll(() => Effect.succeed(false)));
        if (targetExists) {
          return yield* Effect.fail(
            new WorktreeRemoveError({
              worktreeId: snapshot.id,
              reason: `restore path already exists: ${snapshot.path}`,
            }),
          );
        }

        const branchExists = yield* runGit(folder.path, [
          "rev-parse",
          "--verify",
          "--quiet",
          `refs/heads/${snapshot.branch}`,
        ]).pipe(
          Effect.map(() => true),
          Effect.catchAll(() => Effect.succeed(false)),
        );
        if (!branchExists) {
          return yield* Effect.fail(
            new WorktreeRemoveError({
              worktreeId: snapshot.id,
              reason: `branch not found: ${snapshot.branch}`,
            }),
          );
        }

        const result = yield* runGit(folder.path, [
          "worktree",
          "add",
          snapshot.path,
          snapshot.branch,
        ]).pipe(Effect.either);
        if (result._tag === "Left") {
          return yield* Effect.fail(
            new WorktreeRemoveError({
              worktreeId: snapshot.id,
              reason: result.left,
            }),
          );
        }

        const createdAtIso = snapshot.createdAt.toISOString();
        yield* sql`
          INSERT INTO worktrees
            (id, project_id, path, name, branch, base_branch, created_at)
          VALUES
            (${snapshot.id}, ${snapshot.projectId}, ${snapshot.path},
             ${snapshot.name}, ${snapshot.branch}, ${snapshot.baseBranch},
             ${createdAtIso})
        `.pipe(Effect.orDie);

        return Worktree.make({
          id: snapshot.id,
          projectId: snapshot.projectId,
          path: snapshot.path,
          name: snapshot.name,
          branch: snapshot.branch,
          baseBranch: snapshot.baseBranch,
          createdAt: snapshot.createdAt,
        });
      });

    return { create, list, get, remove, restore } as const;
  }),
);
