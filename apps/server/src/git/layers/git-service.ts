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
  GitStatusSummary,
  type FolderId,
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
// commits. Fields in this order — match `spec/features/git-history.md`.
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

    return { log, status, subscribeHeadChanges, origin } as const;
  }),
);
