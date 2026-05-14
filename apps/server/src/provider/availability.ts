import { Command, CommandExecutor, FileSystem } from "@effect/platform";
import { Duration, Effect, Stream } from "effect";
import { homedir, platform } from "node:os";
import { join } from "node:path";

import {
  AgentAvailability,
  type CliVersionStatus,
  type ProviderId,
} from "@memoize/wire";

interface ProviderProbe {
  readonly providerId: ProviderId;
  readonly displayName: string;
  readonly cliBinary: string;
  /**
   * Minimum CLI version the bundled SDK requires. `null` means we don't
   * enforce a floor for this provider — version status is reported as
   * `"unknown"` and the renderer treats it as "let them try".
   */
  readonly minVersion: CliVersion | null;
  /**
   * Suggested one-liner the renderer shows in the upgrade card. Per-provider
   * because npm vs brew vs cargo channels differ.
   */
  readonly upgradeCommand: string | null;
}

const PROBES: ReadonlyArray<ProviderProbe> = [
  {
    providerId: "claude",
    displayName: "Claude Code",
    cliBinary: "claude",
    // Claude Agent SDK 0.2 doesn't break on older CLIs the way codex-sdk
    // 0.128 does — leave the floor open until we see a concrete failure
    // mode we can pin to a version.
    minVersion: null,
    upgradeCommand: null,
  },
  {
    providerId: "codex",
    displayName: "Codex",
    cliBinary: "codex",
    minVersion: { major: 0, minor: 128, patch: 0, raw: "0.128.0" },
    upgradeCommand: "npm i -g @openai/codex@latest",
  },
];

const PROBE_TIMEOUT = Duration.seconds(4);

const collectText = (
  s: Stream.Stream<Uint8Array, import("@effect/platform/Error").PlatformError>,
) =>
  s.pipe(
    Stream.decodeText("utf-8"),
    Stream.runFold("", (acc, chunk) => acc + chunk),
  );

const runCapture = (cmd: Command.Command) =>
  Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;
    const proc = yield* executor.start(cmd);
    const stdout = yield* collectText(proc.stdout);
    const exitCode = yield* proc.exitCode;
    return { stdout: stdout.trim(), exitCode };
  }).pipe(Effect.scoped);

/**
 * Resolve the absolute path to a provider's CLI binary on PATH, or `null` if
 * not found. Used by `ProviderService.start` to feed the SDK's
 * `pathToClaudeCodeExecutable` option (the SDK ships its own bundled CLI as
 * an optional native dep that may not install in every environment).
 */
export const resolveCliPath = (
  cliBinary: string,
): Effect.Effect<string | null, never, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const result = yield* runCapture(Command.make("which", cliBinary)).pipe(
      Effect.timeoutOption(PROBE_TIMEOUT),
      Effect.catchAll(() => Effect.succeedNone),
    );
    if (result._tag !== "Some" || result.value.exitCode !== 0) return null;
    const path = result.value.stdout;
    return path.length > 0 ? path : null;
  });

export interface CliVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly raw: string;
}

// Codex SDK 0.128 unconditionally invokes `codex exec --experimental-json`;
// that flag landed in the matching CLI release, so any older codex binary
// crashes inside the SDK with "unexpected argument '--experimental-json'".
// Keep in lock-step with the `@openai/codex-sdk` pin in apps/server/package.json.
export const MIN_CODEX_CLI_VERSION: CliVersion = {
  major: 0,
  minor: 128,
  patch: 0,
  raw: "0.128.0",
};

// `codex --version` prints `codex-cli 0.27.0`; `claude --version` prints
// `1.0.123 (Claude Code)`. Pull the first dotted triple we can find; ignore
// surrounding labels and pre-release suffixes — the comparator only cares
// about the major.minor.patch baseline.
export const parseCliVersion = (raw: string): CliVersion | null => {
  const match = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  if (match === null) return null;
  return {
    major: Number.parseInt(match[1]!, 10),
    minor: Number.parseInt(match[2]!, 10),
    patch: Number.parseInt(match[3]!, 10),
    raw: raw.trim(),
  };
};

export const compareCliVersion = (a: CliVersion, b: CliVersion): number => {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
};

/**
 * Run `<cliBinary> --version` and parse the output. Returns `null` for any
 * failure (timeout, non-zero exit, unparsable output) so callers can choose
 * between "block on a probe miss" (strict) and "let the SDK speak for itself"
 * (lenient). The codex driver uses the lenient policy.
 */
export const probeCliVersion = (
  cliBinary: string,
): Effect.Effect<CliVersion | null, never, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const result = yield* runCapture(
      Command.make(cliBinary, "--version"),
    ).pipe(
      Effect.timeoutOption(PROBE_TIMEOUT),
      Effect.catchAll(() => Effect.succeedNone),
    );
    if (result._tag !== "Some" || result.value.exitCode !== 0) return null;
    return parseCliVersion(result.value.stdout);
  });

// Heuristic existence checks for local CLI login. We never read the
// credential contents — only confirm the artifact is there. The SDK validates
// on actual use; if the token is stale the first turn fails with an Error
// agent event and we surface it in the UI.
const probeClaudeLogin: Effect.Effect<
  boolean,
  never,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor
> =
  Effect.gen(function* () {
    if (platform() === "darwin") {
      // macOS: `claude /login` writes an OAuth token to keychain entry
      // "Claude Code-credentials". `security find-generic-password` exits 0
      // when present and non-zero otherwise; we only check the exit code.
      const exists = yield* runCapture(
        Command.make(
          "security",
          "find-generic-password",
          "-s",
          "Claude Code-credentials",
        ),
      ).pipe(
        Effect.timeoutOption(PROBE_TIMEOUT),
        Effect.map((opt) =>
          opt._tag === "Some" && opt.value.exitCode === 0,
        ),
        Effect.catchAll(() => Effect.succeed(false)),
      );
      return exists;
    }
    // Linux / Windows: best-effort filesystem probe. Newer Claude CLIs write
    // `~/.claude/.credentials.json`; older builds keep tokens elsewhere. If
    // either is missing we still let the user try — the SDK will report the
    // real auth state on first turn.
    const fs = yield* FileSystem.FileSystem;
    const path = join(homedir(), ".claude", ".credentials.json");
    return yield* fs.exists(path).pipe(Effect.catchAll(() => Effect.succeed(false)));
  });

const probeCodexLogin: Effect.Effect<boolean, never, FileSystem.FileSystem> =
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = join(homedir(), ".codex", "auth.json");
    return yield* fs.exists(path).pipe(Effect.catchAll(() => Effect.succeed(false)));
  });

const probeLogin = (
  providerId: ProviderId,
): Effect.Effect<boolean, never, FileSystem.FileSystem | CommandExecutor.CommandExecutor> => {
  switch (providerId) {
    case "claude":
      return probeClaudeLogin;
    case "codex":
      return probeCodexLogin;
  }
};

const probeOne = (
  probe: ProviderProbe,
): Effect.Effect<
  AgentAvailability,
  never,
  CommandExecutor.CommandExecutor | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const whichResult = yield* runCapture(Command.make("which", probe.cliBinary)).pipe(
      Effect.timeoutOption(PROBE_TIMEOUT),
      Effect.catchAll(() => Effect.succeedNone),
    );

    const cliPath =
      whichResult._tag === "Some" && whichResult.value.exitCode === 0
        ? whichResult.value.stdout
        : undefined;

    if (cliPath === undefined || cliPath.length === 0) {
      return AgentAvailability.make({
        providerId: probe.providerId,
        displayName: probe.displayName,
        cliInstalled: false,
        cliLoggedIn: false,
        hasApiKey: false,
      });
    }

    const versionResult = yield* runCapture(
      Command.make(probe.cliBinary, "--version"),
    ).pipe(
      Effect.timeoutOption(PROBE_TIMEOUT),
      Effect.catchAll(() => Effect.succeedNone),
    );

    const cliVersion =
      versionResult._tag === "Some" && versionResult.value.exitCode === 0
        ? versionResult.value.stdout.split(/\r?\n/)[0]?.trim() || undefined
        : undefined;

    // Compute the version verdict alongside the raw string so the renderer
    // doesn't need its own parser. `unknown` covers both "no min tracked for
    // this provider" and "we tried to parse and failed" — both are
    // "let them try" cases as far as the upgrade card is concerned.
    let cliVersionStatus: CliVersionStatus = "unknown";
    let cliVersionMinRequired: string | undefined;
    let cliUpgradeCommand: string | undefined;
    if (probe.minVersion !== null) {
      cliVersionMinRequired = probe.minVersion.raw;
      cliUpgradeCommand = probe.upgradeCommand ?? undefined;
      const parsed =
        cliVersion !== undefined ? parseCliVersion(cliVersion) : null;
      if (parsed === null) {
        cliVersionStatus = "unknown";
      } else if (compareCliVersion(parsed, probe.minVersion) < 0) {
        cliVersionStatus = "outdated";
      } else {
        cliVersionStatus = "ok";
      }
    }

    const cliLoggedIn = yield* probeLogin(probe.providerId);

    return AgentAvailability.make({
      providerId: probe.providerId,
      displayName: probe.displayName,
      cliInstalled: true,
      cliVersion,
      cliPath,
      cliLoggedIn,
      hasApiKey: false,
      cliVersionStatus,
      cliVersionMinRequired,
      cliUpgradeCommand,
    });
  });

/**
 * Probe each known provider for CLI install status, version, and local-login
 * state. `ProviderService.availability()` calls this and overlays `hasApiKey`
 * from the keychain.
 */
export const probeAllProviders: Effect.Effect<
  ReadonlyArray<AgentAvailability>,
  never,
  CommandExecutor.CommandExecutor | FileSystem.FileSystem
> = Effect.all(PROBES.map(probeOne), { concurrency: "unbounded" });
