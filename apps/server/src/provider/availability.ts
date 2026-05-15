import { Command, CommandExecutor, FileSystem } from "@effect/platform";
import { Duration, Effect, Stream } from "effect";
import { homedir, platform } from "node:os";
import { join } from "node:path";

import {
  AgentAvailability,
  type CliVersionStatus,
  type ProviderAuthStatus,
  type ProviderHealthStatus,
  type ProviderId,
} from "@memoize/wire";

import type { Account } from "./codex-app-protocol/v2/Account.ts";
import type { GetAccountResponse } from "./codex-app-protocol/v2/GetAccountResponse.ts";
import type { PlanType } from "./codex-app-protocol/PlanType.ts";
import { CodexAppServerClient } from "./codex-app-server-client.ts";

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
  {
    providerId: "grok",
    displayName: "Grok",
    cliBinary: "grok",
    // No floor yet — xAI ships Grok Build CLI as a single official channel
    // and hasn't published an SDK we'd need to keep in lock-step with.
    // Revisit if a future release breaks the streaming-json contract.
    minVersion: null,
    upgradeCommand: "curl -fsSL https://x.ai/cli/install.sh | bash",
  },
  {
    providerId: "gemini",
    displayName: "Gemini",
    cliBinary: "gemini",
    // We speak ACP directly via `gemini --experimental-acp`, so there's no
    // SDK pin to keep in lock-step with. Revisit if Google renames the
    // flag or breaks the handshake.
    minVersion: null,
    upgradeCommand: "npm i -g @google/gemini-cli",
  },
  {
    providerId: "cursor",
    displayName: "Cursor",
    cliBinary: "cursor-agent",
    // No version floor yet. ACP support landed in a recent `cursor-agent`
    // release; older builds will surface a handshake timeout when the user
    // tries to start a session. Revisit once we pin the exact
    // ACP-introducing version.
    minVersion: null,
    upgradeCommand: "curl https://cursor.com/install -fsS | bash",
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

// ---------------------------------------------------------------------------
// Verified-auth probes per provider.
//
// `cliLoggedIn` proves a credential *file* exists; `AccountInfo` proves we
// could actually parse the credential and extract a user identity (email +
// subscription tier). The renderer uses both: `cliLoggedIn` lights up the dot
// before the slow per-driver verification finishes, and `AccountInfo`
// upgrades the card to "Authenticated as <email> · <subscription>".
// ---------------------------------------------------------------------------

interface AccountInfo {
  readonly authStatus: ProviderAuthStatus;
  readonly authEmail?: string;
  readonly authLabel?: string;
  readonly authType?: string;
  /**
   * One-line probe error to display under the "Needs attention" headline
   * when verification failed even though a credential file is present.
   */
  readonly statusMessage?: string;
}

const ACCOUNT_PROBE_TIMEOUT = Duration.seconds(5);

const CODEX_PLAN_LABEL: Partial<Record<PlanType, string>> = {
  plus: "ChatGPT Plus Subscription",
  pro: "ChatGPT Pro Subscription",
  prolite: "ChatGPT Pro Lite Subscription",
  team: "ChatGPT Team Subscription",
  enterprise: "ChatGPT Enterprise Subscription",
  enterprise_cbp_usage_based: "ChatGPT Enterprise Subscription",
  business: "ChatGPT Business Subscription",
  self_serve_business_usage_based: "ChatGPT Business Subscription",
  edu: "ChatGPT Edu",
  go: "ChatGPT Go",
  free: "Free",
};

const codexAccountLabel = (account: Account): string | undefined => {
  switch (account.type) {
    case "apiKey":
      return "OpenAI API Key";
    case "amazonBedrock":
      return "Amazon Bedrock";
    case "chatgpt":
      return CODEX_PLAN_LABEL[account.planType] ?? "ChatGPT Subscription";
  }
};

const ACCOUNT_PROBE_TIMEOUT_MS = 5_000;

/**
 * Spawn a short-lived `codex app-server`, call `account/read`, and pull
 * email + plan label off the response. Always resolves to an `AccountInfo`
 * — spawn failures, timeouts, and protocol errors all flow through to a
 * tagged "unknown" result with the error message in `statusMessage` so the
 * UI can show "Needs attention" without crashing the whole availability
 * RPC.
 */
const probeCodexAccount = (codexPath: string): Effect.Effect<AccountInfo> =>
  Effect.promise(async () => {
    let client: CodexAppServerClient | null = null;
    let timer: NodeJS.Timeout | null = null;
    try {
      const startWithTimeout = new Promise<CodexAppServerClient>(
        (resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error("Codex auth probe timed out"));
          }, ACCOUNT_PROBE_TIMEOUT_MS);
          CodexAppServerClient.start({
            codexPath,
            onNotification: () => {},
            onServerRequest: (_req, respond) => respond(null),
          }).then(resolve, reject);
        },
      );
      client = await startWithTimeout;
      const response = await client.request<GetAccountResponse>(
        "account/read",
        {},
      );
      if (response.account === null) {
        return {
          authStatus: "unauthenticated",
          ...(response.requiresOpenaiAuth
            ? { statusMessage: "Sign in required" }
            : {}),
        } satisfies AccountInfo;
      }
      const account = response.account;
      const label = codexAccountLabel(account);
      return {
        authStatus: "authenticated",
        authType: account.type,
        ...(label ? { authLabel: label } : {}),
        ...(account.type === "chatgpt" && account.email.length > 0
          ? { authEmail: account.email }
          : {}),
      } satisfies AccountInfo;
    } catch (err) {
      return {
        authStatus: "unknown",
        statusMessage:
          err instanceof Error ? err.message : "Could not verify Codex auth",
      } satisfies AccountInfo;
    } finally {
      if (timer !== null) clearTimeout(timer);
      // Kill the child process — without this the `codex app-server`
      // subprocess leaks for several minutes per probe.
      client?.close();
    }
  });

const CLAUDE_SUB_LABEL: Record<string, string> = {
  max: "Claude Max Subscription",
  pro: "Claude Pro Subscription",
  free: "Free",
};

interface ClaudeCredentialBlob {
  readonly claudeAiOauth?: {
    readonly subscriptionType?: string;
    readonly emailAddress?: string;
    readonly email?: string;
  };
}

const parseClaudeCredentials = (raw: string): AccountInfo => {
  let parsed: ClaudeCredentialBlob;
  try {
    parsed = JSON.parse(raw) as ClaudeCredentialBlob;
  } catch {
    return { authStatus: "authenticated" };
  }
  const oauth = parsed.claudeAiOauth;
  if (!oauth) return { authStatus: "authenticated" };
  const sub = oauth.subscriptionType?.toLowerCase();
  const email = oauth.emailAddress ?? oauth.email;
  return {
    authStatus: "authenticated",
    authType: "oauth",
    ...(sub && CLAUDE_SUB_LABEL[sub]
      ? { authLabel: CLAUDE_SUB_LABEL[sub] }
      : sub
        ? { authLabel: `Claude ${sub[0]!.toUpperCase()}${sub.slice(1)}` }
        : {}),
    ...(email ? { authEmail: email } : {}),
  };
};

const probeClaudeAccount: Effect.Effect<
  AccountInfo,
  never,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor
> = Effect.gen(function* () {
  if (platform() === "darwin") {
    // macOS: `security find-generic-password -w` prints the password (the
    // OAuth credential blob) to stdout when present, exits non-zero
    // otherwise. The presence-check (without `-w`) used to live in
    // `probeClaudeLogin`; we now read the value so we can extract the
    // subscription tier and email.
    const result = yield* runCapture(
      Command.make(
        "security",
        "find-generic-password",
        "-s",
        "Claude Code-credentials",
        "-w",
      ),
    ).pipe(
      Effect.timeoutOption(ACCOUNT_PROBE_TIMEOUT),
      Effect.catchAll(() => Effect.succeedNone),
    );
    if (result._tag !== "Some" || result.value.exitCode !== 0) {
      return { authStatus: "unauthenticated" } satisfies AccountInfo;
    }
    return parseClaudeCredentials(result.value.stdout);
  }
  const fs = yield* FileSystem.FileSystem;
  const path = join(homedir(), ".claude", ".credentials.json");
  const exists = yield* fs
    .exists(path)
    .pipe(Effect.catchAll(() => Effect.succeed(false)));
  if (!exists) return { authStatus: "unauthenticated" };
  const raw = yield* fs
    .readFileString(path)
    .pipe(Effect.catchAll(() => Effect.succeed("")));
  return raw.length === 0
    ? { authStatus: "authenticated" }
    : parseClaudeCredentials(raw);
});

// Grok writes browser-OAuth credentials + `config.toml` under `~/.grok/`
// on first authenticated launch; directory presence is a cheap proxy for
// "completed at least one login". If only `GROK_CODE_XAI_API_KEY` is set,
// the dir may not exist — the renderer still flips to "ready" via
// `hasApiKey` once a key lands in the keychain.
//
// We can't currently verify the user's subscription tier from the CLI
// alone — Grok's agent CLI requires an active SuperGrok Heavy plan to
// actually drive sessions, but the OAuth artifact alone doesn't tell us
// whether that plan is active. Carry the requirement in `authLabel` so
// the card surfaces "Requires SuperGrok Heavy subscription" + a subscribe
// CTA, and the user finds out before they hit a session-runtime 403.
const probeGrokAccount: Effect.Effect<AccountInfo, never, FileSystem.FileSystem> =
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = join(homedir(), ".grok");
    const exists = yield* fs
      .exists(path)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));
    return exists
      ? ({
          authStatus: "authenticated",
          authType: "cli",
          authLabel: "Requires SuperGrok Heavy",
        } satisfies AccountInfo)
      : ({ authStatus: "unauthenticated" } satisfies AccountInfo);
  });

// Gemini CLI writes OAuth tokens + settings under `~/.gemini/` after the
// first interactive sign-in. Same file-existence heuristic as Grok — we
// don't yet have a verified-auth call we can make to the gemini CLI to
// extract email/plan, so the card stays at "Authenticated" without the
// subscription label.
const probeGeminiAccount: Effect.Effect<AccountInfo, never, FileSystem.FileSystem> =
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = join(homedir(), ".gemini");
    const exists = yield* fs
      .exists(path)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));
    return exists
      ? ({ authStatus: "authenticated", authType: "cli" } satisfies AccountInfo)
      : ({ authStatus: "unauthenticated" } satisfies AccountInfo);
  });

// Cursor Agent stores OAuth credentials under `~/.local/share/cursor-agent/`
// after `cursor-agent login`. The directory is also created on first install
// regardless of auth state, so its mere presence isn't a perfect proxy — but
// it's the best we have without driving the ACP probe. The renderer also
// flips to "ready" via `hasApiKey` once a key lands in the keychain.
const probeCursorAccount: Effect.Effect<AccountInfo, never, FileSystem.FileSystem> =
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = join(homedir(), ".local", "share", "cursor-agent");
    const exists = yield* fs
      .exists(path)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));
    return exists
      ? ({ authStatus: "authenticated", authType: "cli" } satisfies AccountInfo)
      : ({ authStatus: "unauthenticated" } satisfies AccountInfo);
  });

const probeAccount = (
  providerId: ProviderId,
  cliPath: string,
): Effect.Effect<
  AccountInfo,
  never,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor
> => {
  switch (providerId) {
    case "claude":
      return probeClaudeAccount;
    case "codex":
      return probeCodexAccount(cliPath);
    case "grok":
      return probeGrokAccount;
    case "gemini":
      return probeGeminiAccount;
    case "cursor":
      return probeCursorAccount;
  }
};

/**
 * Roll the per-field signals (`cliInstalled`, `cliVersionStatus`, `authStatus`)
 * up into the single dot color the renderer paints. Mirrors t3code's
 * `getProviderSummary` precedence so server-derived status agrees with the
 * client-side fallback when both run.
 */
const computeHealthStatus = (input: {
  cliInstalled: boolean;
  cliVersionStatus: CliVersionStatus;
  authStatus: ProviderAuthStatus;
}): ProviderHealthStatus => {
  if (!input.cliInstalled) return "error";
  if (input.cliVersionStatus === "outdated") return "warning";
  if (input.authStatus === "authenticated") return "ready";
  if (input.authStatus === "unauthenticated") return "warning";
  return "warning";
};

const probeOne = (
  probe: ProviderProbe,
): Effect.Effect<
  AgentAvailability,
  never,
  CommandExecutor.CommandExecutor | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const lastCheckedAt = new Date();
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
        status: "error",
        statusMessage: `${probe.displayName} CLI not found on PATH.`,
        lastCheckedAt,
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

    const account = yield* probeAccount(probe.providerId, cliPath);
    const cliLoggedIn = account.authStatus === "authenticated";

    const status = computeHealthStatus({
      cliInstalled: true,
      cliVersionStatus,
      authStatus: account.authStatus,
    });

    const statusMessage =
      account.statusMessage ??
      (cliVersionStatus === "outdated"
        ? `Update required — ${probe.displayName} ${cliVersion ?? ""} below ${
            cliVersionMinRequired ?? "minimum"
          }.`
        : undefined);

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
      authStatus: account.authStatus,
      authEmail: account.authEmail,
      authLabel: account.authLabel,
      authType: account.authType,
      status,
      statusMessage,
      lastCheckedAt,
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
