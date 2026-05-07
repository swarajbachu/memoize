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
  GitChange,
  GitCommandError,
  GitCommit,
  GitFolderNotFoundError,
  GitNotARepoError,
  GitNotInstalledError,
  GitOriginInfo,
  GitPrCheckRun,
  GitPrComment,
  GitPrDetails,
  GitPrFile,
  GitPrInfo,
  GitPrReview,
  GitStatusSummary,
  type FolderId,
  type GitChangeKind,
  type GitPrCheckRunConclusion,
  type GitPrCheckRunStatus,
  type GitPrReviewState,
} from "@forkzero/wire";

import { WorkspaceService } from "../../workspace/services/workspace-service.ts";
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

// Map a single porcelain-v2 status code (per `git status --porcelain=v2`):
//   '.' unmodified, 'M' modified, 'A' added, 'D' deleted, 'R' renamed,
//   'C' copied, 'U' unmerged, 'T' type changed.
const STATUS_CODE_TO_KIND: Record<string, GitChangeKind> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  U: "unmerged",
  T: "type_changed",
};

const codeToKind = (code: string): GitChangeKind | null => {
  const k = STATUS_CODE_TO_KIND[code];
  return k ?? null;
};

/**
 * Parse `git status --porcelain=v2` file entries into our wire shape.
 * Header lines (`# branch.*`) are skipped; this function focuses on the
 * file-entry lines.
 *
 * Format reference (git-scm):
 *   1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
 *   2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><tab><origPath>
 *   u <XY> ...                                                    (unmerged)
 *   ? <path>                                                      (untracked)
 *   ! <path>                                                      (ignored)
 *
 * The XY pair encodes (index, working-tree) state. If working-tree is
 * unchanged we report the index state (so a staged-only file still appears
 * as modified). `staged` is true whenever index ≠ '.'.
 */
const parseChangesOutput = (out: string): ReadonlyArray<GitChange> => {
  const changes: GitChange[] = [];
  for (const line of out.split("\n")) {
    if (line.length === 0) continue;
    const tag = line[0];
    if (tag === "1") {
      // "1 XY sub mH mI mW hH hI path"
      const parts = line.split(" ");
      const xy = parts[1] ?? "..";
      const x = xy[0] ?? ".";
      const y = xy[1] ?? ".";
      const path = parts.slice(8).join(" ");
      if (path.length === 0) continue;
      const kind = codeToKind(y === "." ? x : y);
      if (kind === null) continue;
      changes.push(GitChange.make({ path, staged: x !== ".", kind }));
    } else if (tag === "2") {
      // "2 XY sub mH mI mW hH hI Xscore path<TAB>origPath"
      const tabIdx = line.indexOf("\t");
      const head = tabIdx === -1 ? line : line.slice(0, tabIdx);
      const parts = head.split(" ");
      const xy = parts[1] ?? "..";
      const x = xy[0] ?? ".";
      const y = xy[1] ?? ".";
      const path = parts.slice(9).join(" ");
      if (path.length === 0) continue;
      const code = y === "." ? x : y;
      const kind: GitChangeKind = code === "C" ? "copied" : "renamed";
      changes.push(GitChange.make({ path, staged: x !== ".", kind: codeToKind(code) ?? kind }));
    } else if (tag === "u") {
      const parts = line.split(" ");
      const path = parts.slice(10).join(" ");
      if (path.length === 0) continue;
      changes.push(GitChange.make({ path, staged: false, kind: "unmerged" }));
    } else if (tag === "?") {
      const path = line.slice(2);
      if (path.length === 0) continue;
      changes.push(GitChange.make({ path, staged: false, kind: "untracked" }));
    } else if (tag === "!") {
      const path = line.slice(2);
      if (path.length === 0) continue;
      changes.push(GitChange.make({ path, staged: false, kind: "ignored" }));
    }
  }
  return changes;
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
    const executor = yield* CommandExecutor.CommandExecutor;

    const resolvePath = (
      folderId: FolderId,
    ): Effect.Effect<string, GitFolderNotFoundError> =>
      Effect.flatMap(workspace.findById(folderId), (folder) =>
        folder === null
          ? Effect.fail(new GitFolderNotFoundError({ folderId }))
          : Effect.succeed(folder.path),
      );

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

    const status: GitService["Type"]["status"] = (folderId) =>
      Effect.flatMap(resolvePath(folderId), (cwd) =>
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

    // Map gh's review state vocabulary (`APPROVED`, `CHANGES_REQUESTED`, ...)
    // to the wire's lowercase literal. Anything we don't recognize collapses
    // to "commented" — gh sometimes emits review entries with no state when
    // the review is just inline comments without a top-level summary verdict.
    const mapReviewState = (raw: string): GitPrReviewState => {
      switch (raw.toUpperCase()) {
        case "APPROVED":
          return "approved";
        case "CHANGES_REQUESTED":
          return "changes_requested";
        case "DISMISSED":
          return "dismissed";
        case "PENDING":
          return "pending";
        default:
          return "commented";
      }
    };

    const mapCheckStatus = (raw: string): GitPrCheckRunStatus => {
      switch (raw.toUpperCase()) {
        case "QUEUED":
          return "queued";
        case "IN_PROGRESS":
          return "in_progress";
        case "COMPLETED":
          return "completed";
        default:
          return "pending";
      }
    };

    const mapCheckConclusion = (
      raw: string,
    ): GitPrCheckRunConclusion | null => {
      switch (raw.toUpperCase()) {
        case "SUCCESS":
          return "success";
        case "FAILURE":
        case "ERROR":
          return "failure";
        case "CANCELLED":
          return "cancelled";
        case "SKIPPED":
          return "skipped";
        case "NEUTRAL":
          return "neutral";
        case "TIMED_OUT":
          return "timed_out";
        case "ACTION_REQUIRED":
          return "action_required";
        default:
          return null;
      }
    };

    const emptyDetails: GitPrDetails = GitPrDetails.make({
      state: "none",
      number: null,
      url: null,
      isDraft: false,
      checks: "none",
      additions: 0,
      deletions: 0,
      title: "",
      body: "",
      author: "",
      baseBranch: null,
      headBranch: null,
      comments: [],
      reviews: [],
      files: [],
      checkRuns: [],
    });

    const prDetails: GitService["Type"]["prDetails"] = (folderId) =>
      Effect.flatMap(resolvePath(folderId), (cwd) =>
        Effect.gen(function* () {
          const stdout = yield* ghRun(folderId, cwd, [
            "pr",
            "view",
            "--json",
            "state,additions,deletions,number,url,headRefName,baseRefName,isDraft,statusCheckRollup,title,body,author,comments,reviews,files",
          ]).pipe(
            Effect.catchTags({
              GitNotInstalledError: () => Effect.succeed(""),
              GitCommandError: () => Effect.succeed(""),
            }),
          );

          if (stdout.trim().length === 0) return emptyDetails;

          let parsed: {
            state?: string;
            additions?: number;
            deletions?: number;
            number?: number;
            url?: string;
            headRefName?: string;
            baseRefName?: string;
            isDraft?: boolean;
            title?: string;
            body?: string;
            author?: { login?: string };
            comments?: ReadonlyArray<{
              author?: { login?: string };
              body?: string;
              createdAt?: string;
            }>;
            reviews?: ReadonlyArray<{
              author?: { login?: string };
              state?: string;
              body?: string;
              submittedAt?: string | null;
            }>;
            files?: ReadonlyArray<{
              path?: string;
              additions?: number;
              deletions?: number;
            }>;
            statusCheckRollup?: ReadonlyArray<{
              name?: string;
              status?: string;
              state?: string;
              conclusion?: string;
              detailsUrl?: string;
              targetUrl?: string;
            }>;
          };
          try {
            parsed = JSON.parse(stdout) as typeof parsed;
          } catch {
            return emptyDetails;
          }

          const raw = (parsed.state ?? "").toLowerCase();
          const state: GitPrInfo["state"] =
            raw === "open"
              ? "open"
              : raw === "merged"
                ? "merged"
                : raw === "closed"
                  ? "closed"
                  : "none";

          const rollup = parsed.statusCheckRollup ?? [];
          const checks = aggregateChecks(rollup);

          const checkRuns = rollup.map((c) =>
            GitPrCheckRun.make({
              name: c.name ?? "(unnamed check)",
              // External "state" checks don't have a separate `status` field;
              // treat them as completed with the state mapped via conclusion.
              status: mapCheckStatus(
                c.status ?? (c.state !== undefined ? "completed" : "pending"),
              ),
              conclusion: mapCheckConclusion(
                c.conclusion !== undefined && c.conclusion.length > 0
                  ? c.conclusion
                  : (c.state ?? ""),
              ),
              url: c.detailsUrl ?? c.targetUrl ?? null,
            }),
          );

          const comments = (parsed.comments ?? [])
            .filter((c) => typeof c.createdAt === "string")
            .map((c) =>
              GitPrComment.make({
                author: c.author?.login ?? "",
                body: c.body ?? "",
                createdAt: new Date(c.createdAt as string),
              }),
            );

          const reviews = (parsed.reviews ?? []).map((r) =>
            GitPrReview.make({
              author: r.author?.login ?? "",
              state: mapReviewState(r.state ?? ""),
              body: r.body ?? "",
              submittedAt:
                typeof r.submittedAt === "string" && r.submittedAt.length > 0
                  ? new Date(r.submittedAt)
                  : null,
            }),
          );

          const files = (parsed.files ?? [])
            .filter((f) => typeof f.path === "string" && f.path.length > 0)
            .map((f) =>
              GitPrFile.make({
                path: f.path as string,
                additions: typeof f.additions === "number" ? f.additions : 0,
                deletions: typeof f.deletions === "number" ? f.deletions : 0,
              }),
            );

          return GitPrDetails.make({
            state,
            number: typeof parsed.number === "number" ? parsed.number : null,
            url: parsed.url ?? null,
            isDraft: parsed.isDraft === true,
            checks,
            additions:
              typeof parsed.additions === "number" ? parsed.additions : 0,
            deletions:
              typeof parsed.deletions === "number" ? parsed.deletions : 0,
            title: parsed.title ?? "",
            body: parsed.body ?? "",
            author: parsed.author?.login ?? "",
            baseBranch: parsed.baseRefName ?? null,
            headBranch: parsed.headRefName ?? null,
            comments,
            reviews,
            files,
            checkRuns,
          });
        }),
      );

    const changes: GitService["Type"]["changes"] = (folderId) =>
      Effect.flatMap(resolvePath(folderId), (cwd) =>
        run(folderId, cwd, [
          "status",
          "--porcelain=v2",
          "--untracked-files=all",
        ]).pipe(Effect.map(parseChangesOutput)),
      );

    /**
     * Auto-stage everything tracked + untracked, then create a single commit
     * with the user's message. Mirrors what the user would do in a basic
     * "commit all" UI; matches the GitHub Desktop "Commit Tracked + Untracked"
     * default. Returns the new HEAD sha so the caller can refresh status.
     */
    const commit: GitService["Type"]["commit"] = (folderId, message) =>
      Effect.flatMap(resolvePath(folderId), (cwd) =>
        Effect.gen(function* () {
          yield* run(folderId, cwd, ["add", "-A"]);
          yield* run(folderId, cwd, ["commit", "-m", message]);
          const sha = (yield* run(folderId, cwd, ["rev-parse", "HEAD"])).trim();
          return { sha };
        }),
      );

    /**
     * Push the current branch to its upstream. Sets upstream on first push so
     * a freshly-created branch lands on origin without an extra step. The
     * combined stdout+stderr is returned so the renderer can surface it.
     */
    const push: GitService["Type"]["push"] = (folderId) =>
      Effect.flatMap(resolvePath(folderId), (cwd) =>
        Effect.gen(function* () {
          const branch = (yield* run(folderId, cwd, [
            "rev-parse",
            "--abbrev-ref",
            "HEAD",
          ])).trim();
          if (branch.length === 0 || branch === "HEAD") {
            return yield* Effect.fail(
              new GitCommandError({
                folderId,
                reason: "Cannot push: HEAD is detached.",
              }),
            );
          }
          const out = yield* run(folderId, cwd, [
            "push",
            "--set-upstream",
            "origin",
            branch,
          ]);
          return { output: out };
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

    return {
      log,
      status,
      subscribeHeadChanges,
      origin,
      prState,
      prDetails,
      changes,
      commit,
      push,
    } as const;
  }),
);
