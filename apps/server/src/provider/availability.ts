import { Command, CommandExecutor } from "@effect/platform";
import { Duration, Effect, Stream } from "effect";

import { AgentAvailability, type ProviderId } from "@forkzero/wire";

interface ProviderProbe {
  readonly providerId: ProviderId;
  readonly displayName: string;
  readonly cliBinary: string;
}

const PROBES: ReadonlyArray<ProviderProbe> = [
  { providerId: "claude", displayName: "Claude Code", cliBinary: "claude" },
  { providerId: "codex", displayName: "Codex", cliBinary: "codex" },
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

const probeOne = (
  probe: ProviderProbe,
): Effect.Effect<AgentAvailability, never, CommandExecutor.CommandExecutor> =>
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
        sdkConfigured: false,
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

    return AgentAvailability.make({
      providerId: probe.providerId,
      displayName: probe.displayName,
      cliInstalled: true,
      cliVersion,
      cliPath,
      sdkConfigured: false,
    });
  });

/**
 * Probe each known provider for CLI install status + version. Pure helper —
 * `ProviderService.availability()` calls this and adds the SDK-configured
 * field once `CredentialsService` lands in PR 4.
 */
export const probeAllProviders: Effect.Effect<
  ReadonlyArray<AgentAvailability>,
  never,
  CommandExecutor.CommandExecutor
> = Effect.all(PROBES.map(probeOne), { concurrency: "unbounded" });
