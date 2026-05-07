import { Command, CommandExecutor } from "@effect/platform";
import {
  Duration,
  Effect,
  Exit,
  Layer,
  Mailbox,
  Ref,
  Schedule,
  Stream,
} from "effect";

import {
  GitCommandError,
  GitCommit,
  GitFolderNotFoundError,
  GitNotARepoError,
  GitNotInstalledError,
  GitOriginInfo,
  GitPrInfo,
  GitStatusSummary,
  type FolderId,
  type WorktreeId,
} from "@forkzero/wire";

import { WorkspaceService } from "../../workspace/services/workspace-service.ts";
import { WorktreeService } from "../../worktree/services/worktree-service.ts";
import { GitService } from "../services/git-service.ts";

type GitFailure =
  | GitNotARepoError
  | GitNotInstalledError
  | GitCommandError
  | GitFolderNotFoundError;

const NUL = " ";

// `git log --format=...` separator: NUL-delimited fields, newline-delimited
// commits. Fields in this order — match `specs/0.01-MVP/features/git-history.md`.
const LOG_FORMAT = "%H%x00%h%x00%s%x00%an%x00%aI%x00%P";

const parseLogOutput = (out: string): ReadonlyArray<GitCommit> => {
  const lines = out.split("\n");
  const commits: GitCommit[] = [];
  for (const line of lines) {
    if (line.length === 0) continue;
    const [sha, shortSha, subject, authorName, authoredAt, parentsStr] =
      line.split(NUL);
    if (
      sha === undefined ||
      shortSha === undefined ||
      subject === undefined ||
      authorName === undefined ||
      authoredAt === undefined ||
      parentsStr === undefined
    ) {
      continue;
    }
    commits.push(
      GitCommit.make({
        sha,
        shortSha,
        subject,
        authorName,
        authoredAt: new Date(authoredAt),
        parents:
          parentsStr.length === 0 ? [] : parentsStr.split(" "),
      }),
    );
  }
  return commits;
};

// `git status --porcelain=v2 --branch` header lines (per git-scm docs):
//   # branch.head <name>           (or "(detached)")
//   # branch.ab +<ahead> -<behind>
// Other lines starting with [12u?!] are file entries.
const parseStatusOutput = (out: string): GitStatusSummary => {
  let branch: string | null = null;
  let ahead = 0;
  let behind = 0;
  let dirtyFiles = 0;

  for (const line of out.split("\n")) {
    if (line.length === 0) continue;
    if (line.startsWith("# branch.head ")) {
      const name = line.slice("# branch.head ".length).trim();
      branch = name === "(detached)" ? null : name;
    } else if (line.startsWith("# branch.ab ")) {
      const rest = line.slice("# branch.ab ".length).trim();
      const parts = rest.split(/\s+/);
      for (const p of parts) {
        if (p.startsWith("+")) ahead = Number.parseInt(p.slice(1), 10) || 0;
        else if (p.startsWith("-"))
          behind = Number.parseInt(p.slice(1), 10) || 0;
      }
    } else if (line.startsWith("#")) {
      // other header line, skip
    } else {
      dirtyFiles += 1;
    }
  }

  return GitStatusSummary.make({ branch, ahead, behind, dirtyFiles });
};

// Accepts the common shapes that `git remote get-url` emits:
//   git@github.com:owner/repo[.git]
//   ssh://git@github.com/owner/repo[.git]
//   https://github.com/owner/repo[.git]
// Returns null for anything we can't confidently parse (file:// remotes,
// custom transports, etc.) — the caller treats null as "no origin info".
const parseRemoteUrl = (url: string): GitOriginInfo | null => {
  const cleaned = url.replace(/\.git$/, "");
  const scp = /^[\w.-]+@([\w.-]+):([\w.-]+)\/([\w.-]+)$/.exec(cleaned);
  if (scp) {
    return GitOriginInfo.make({ host: scp[1]!, owner: scp[2]!, repo: scp[3]! });
  }
  const proto = /^(?:https?|ssh):\/\/(?:[\w.-]+@)?([\w.-]+)\/([\w.-]+)\/([\w.-]+)$/.exec(
    cleaned,
  );
  if (proto) {
    return GitOriginInfo.make({
      host: proto[1]!,
      owner: proto[2]!,
      repo: proto[3]!,
    });
  }
  return null;
};

/**
 * Collapse `gh`'s `statusCheckRollup` into the wire's four-state aggregate.
 *
 * A check is "in flight" if its status is anything other than COMPLETED, and
 * its conclusion (when present) tells us how a completed run landed. External
 * status checks expose `state` instead and skip `status` entirely. A single
 * failure beats every other state; otherwise pending beats success; otherwise
 * if every entry passed it's success. Empty list means no checks defined.
 */
const aggregateChecks = (
  rollup: ReadonlyArray<{
    status?: string;
    state?: string;
    conclusion?: string;
  }>,
): GitPrInfo["checks"] => {
  if (rollup.length === 0) return "none";
  let pending = false;
  for (const entry of rollup) {
    const conclusion = (entry.conclusion ?? "").toUpperCase();
    const status = (entry.status ?? "").toUpperCase();
    const state = (entry.state ?? "").toUpperCase();
    if (
      conclusion === "FAILURE" ||
      conclusion === "CANCELLED" ||
      conclusion === "TIMED_OUT" ||
      conclusion === "ACTION_REQUIRED" ||
      state === "FAILURE" ||
      state === "ERROR"
    ) {
      return "failure";
    }
    if (
      status === "QUEUED" ||
      status === "IN_PROGRESS" ||
      status === "PENDING" ||
      state === "PENDING" ||
      (status !== "COMPLETED" && conclusion === "" && state === "")
    ) {
      pending = true;
    }
  }
  return pending ? "pending" : "success";
};

export const GitServiceLive = Layer.effect(
  GitService,
  Effect.gen(function* () {
    const workspace = yield* WorkspaceService;
    const worktrees = yield* WorktreeService;
    const executor = yield* CommandExecutor.CommandExecutor;

    const resolvePath = (
      folderId: FolderId,
    ): Effect.Effect<string, GitFolderNotFoundError> =>
      Effect.flatMap(workspace.findById(folderId), (folder) =>
        folder === null
          ? Effect.fail(new GitFolderNotFoundError({ folderId }))
          : Effect.succeed(folder.path),
      );

    /**
     * Resolve cwd for a folder, swapping to a worktree's path when the
     * caller passes a `worktreeId` that belongs to the project. Used by
     * `status` so the top-bar branch + dirty/ahead counts follow the
     * active session's worktree instead of always showing the main checkout.
     */
    const resolvePathForWorktree = (
      folderId: FolderId,
      worktreeId: WorktreeId | null | undefined,
    ): Effect.Effect<string, GitFolderNotFoundError> =>
      Effect.gen(function* () {
        const base = yield* resolvePath(folderId);
        if (!worktreeId) return base;
        const wt = yield* worktrees.get(worktreeId);
        return wt !== null && wt.projectId === folderId ? wt.path : base;
      });

    // Run `git ...` in `cwd`, collect stdout + stderr + exit code, and map
    // failures to our domain errors. Exit-zero returns stdout. Non-zero with
    // "not a git repository" → GitNotARepoError; spawn ENOENT → GitNotInstalled;
    // anything else → GitCommandError carrying the trimmed stderr.
    const collectText = (
      s: Stream.Stream<Uint8Array, import("@effect/platform/Error").PlatformError>,
    ) =>
      s.pipe(
        Stream.decodeText("utf-8"),
        Stream.runFold("", (acc, chunk) => acc + chunk),
      );

    const run = (
      folderId: FolderId,
      cwd: string,
      args: ReadonlyArray<string>,
    ) =>
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
          const lower = stderr.toLowerCase();
          if (
            lower.includes("not a git repository") ||
            lower.includes("not a working tree")
          ) {
            return yield* Effect.fail(new GitNotARepoError({ folderId }));
          }
          return yield* Effect.fail(
            new GitCommandError({
              folderId,
              reason:
                stderr.trim() || `git exited with code ${exitCode}`,
            }),
          );
        }),
      ).pipe(
        Effect.catchTags({
          SystemError: (err) =>
            err.reason === "NotFound"
              ? Effect.fail(new GitNotInstalledError({}))
              : Effect.fail(
                  new GitCommandError({
                    folderId,
                    reason: err.message ?? String(err),
                  }),
                ),
          BadArgument: (err) =>
            Effect.fail(
              new GitCommandError({
                folderId,
                reason: err.message ?? String(err),
              }),
            ),
        }),
      );

    const log: GitService["Type"]["log"] = (folderId, limit) =>
      Effect.flatMap(resolvePath(folderId), (cwd) =>
        run(folderId, cwd, [
          "log",
          `-${Math.max(1, Math.floor(limit))}`,
          `--pretty=format:${LOG_FORMAT}`,
        ]).pipe(Effect.map(parseLogOutput)),
      );

    const status: GitService["Type"]["status"] = (folderId, worktreeId) =>
      Effect.flatMap(resolvePathForWorktree(folderId, worktreeId), (cwd) =>
        run(folderId, cwd, [
          "status",
          "--porcelain=v2",
          "--branch",
        ]).pipe(Effect.map(parseStatusOutput)),
      );

    const headSha = (folderId: FolderId) =>
      Effect.flatMap(resolvePath(folderId), (cwd) =>
        run(folderId, cwd, ["rev-parse", "HEAD"]).pipe(
          Effect.map((s) => s.trim()),
        ),
      );

    // `git remote get-url origin` exits non-zero when no remote is set; we
    // treat the resulting GitCommandError as "no origin" → null.
    const origin: GitService["Type"]["origin"] = (folderId) =>
      Effect.flatMap(resolvePath(folderId), (cwd) =>
        run(folderId, cwd, ["remote", "get-url", "origin"]).pipe(
          Effect.map((s) => parseRemoteUrl(s.trim())),
          Effect.catchTag("GitCommandError", () => Effect.succeed(null)),
        ),
      );

    // Run `gh ...` in `cwd`. Same shape as `run` but uses the GitHub CLI.
    // Missing `gh` (ENOENT) maps to GitNotInstalled — the caller catches it
    // and falls back to "no PR" so the renderer doesn't pop an error toast on
    // machines without `gh`.
    const ghRun = (
      folderId: FolderId,
      cwd: string,
      args: ReadonlyArray<string>,
    ) =>
      Effect.scoped(
        Effect.gen(function* () {
          const cmd = Command.make("gh", ...args).pipe(
            Command.workingDirectory(cwd),
          );
          const proc = yield* executor.start(cmd);
          const stdout = yield* collectText(proc.stdout);
          const stderr = yield* collectText(proc.stderr);
          const exitCode = yield* proc.exitCode;
          if (exitCode === 0) return stdout;
          return yield* Effect.fail(
            new GitCommandError({
              folderId,
              reason: stderr.trim() || `gh exited with code ${exitCode}`,
            }),
          );
        }),
      ).pipe(
        Effect.catchTags({
          SystemError: (err) =>
            err.reason === "NotFound"
              ? Effect.fail(new GitNotInstalledError({}))
              : Effect.fail(
                  new GitCommandError({
                    folderId,
                    reason: err.message ?? String(err),
                  }),
                ),
          BadArgument: (err) =>
            Effect.fail(
              new GitCommandError({
                folderId,
                reason: err.message ?? String(err),
              }),
            ),
        }),
      );

    const prState: GitService["Type"]["prState"] = (folderId) =>
      Effect.flatMap(resolvePath(folderId), (cwd) =>
        Effect.gen(function* () {
          const empty: GitPrInfo = GitPrInfo.make({
            state: "none",
            branch: null,
            baseBranch: null,
            additions: 0,
            deletions: 0,
            number: null,
            url: null,
            isDraft: false,
            checks: "none",
          });

          // `gh pr view --json` returns the PR for the current branch. Exits
          // non-zero when there's no PR, when the branch isn't pushed, or
          // when `gh` isn't authenticated. All of those collapse to "none".
          const stdout = yield* ghRun(folderId, cwd, [
            "pr",
            "view",
            "--json",
            "state,additions,deletions,number,url,headRefName,baseRefName,isDraft,statusCheckRollup",
          ]).pipe(
            Effect.catchTags({
              GitNotInstalledError: () => Effect.succeed(""),
              GitCommandError: () => Effect.succeed(""),
            }),
          );

          if (stdout.trim().length === 0) return empty;

          let parsed: {
            state?: string;
            additions?: number;
            deletions?: number;
            number?: number;
            url?: string;
            headRefName?: string;
            baseRefName?: string;
            isDraft?: boolean;
            statusCheckRollup?: ReadonlyArray<{
              status?: string;
              state?: string;
              conclusion?: string;
            }>;
          };
          try {
            parsed = JSON.parse(stdout) as typeof parsed;
          } catch {
            return empty;
          }

          // gh returns "OPEN" / "CLOSED" / "MERGED"; map to the wire literal.
          const raw = (parsed.state ?? "").toLowerCase();
          const state: GitPrInfo["state"] =
            raw === "open"
              ? "open"
              : raw === "merged"
                ? "merged"
                : raw === "closed"
                  ? "closed"
                  : "none";

          // statusCheckRollup is a heterogeneous array — gh actions use
          // `status` + `conclusion`, external checks use `state`. We collapse
          // both into a four-state aggregate.
          const checks: GitPrInfo["checks"] = aggregateChecks(
            parsed.statusCheckRollup ?? [],
          );

          return GitPrInfo.make({
            state,
            branch: parsed.headRefName ?? null,
            baseBranch: parsed.baseRefName ?? null,
            additions:
              typeof parsed.additions === "number" ? parsed.additions : 0,
            deletions:
              typeof parsed.deletions === "number" ? parsed.deletions : 0,
            number: typeof parsed.number === "number" ? parsed.number : null,
            url: parsed.url ?? null,
            isDraft: parsed.isDraft === true,
            checks,
          });
        }),
      );

    // Per-subscription stream: a forked fiber polls HEAD every 2s and pushes
    // into a Mailbox only when the SHA changes. The fiber is scoped to the
    // stream's lifetime, so interrupting the renderer's subscription stops
    // the polling.
    const subscribeHeadChanges: GitService["Type"]["subscribeHeadChanges"] = (
      folderId,
    ) =>
      Stream.unwrapScoped(
        Effect.gen(function* () {
          const mailbox = yield* Mailbox.make<
            { readonly sha: string },
            GitFailure
          >();
          const lastSha = yield* Ref.make<string | null>(null);

          const tick = Effect.gen(function* () {
            const sha = yield* headSha(folderId);
            const prev = yield* Ref.get(lastSha);
            if (sha !== prev) {
              yield* Ref.set(lastSha, sha);
              mailbox.unsafeOffer({ sha });
            }
          });

          yield* Effect.forkScoped(
            Effect.repeat(tick, Schedule.spaced(Duration.seconds(2))).pipe(
              Effect.catchAll((err) =>
                Effect.sync(() => mailbox.unsafeDone(Exit.fail(err))),
              ),
            ),
          );

          return Mailbox.toStream(mailbox);
        }),
      );

    return { log, status, subscribeHeadChanges, origin, prState } as const;
  }),
);
