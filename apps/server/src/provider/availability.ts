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
  {
    providerId: "opencode",
    displayName: "OpenCode",
    cliBinary: "opencode",
    // The SDK we bundle (`@opencode-ai/sdk`) targets the v2 HTTP shape that
    // landed in `opencode` 1.3.15. Older binaries respond to
    // `client.session.prompt` with a 404 (route renamed) — pin the floor
    // so we surface the upgrade card before the user hits that.
    minVersion: { major: 1, minor: 3, patch: 15, raw: "1.3.15" },
    upgradeCommand: "curl -fsSL https://opencode.ai/install | bash",
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
  // Claude Code agent usage requires a paid plan. Free / unknown tiers
  // surface as "Requires …" so the renderer's existing subscription-gate
  // rail (matches authLabel.includes("require")) disables the toggle and
  // shows the Subscribe CTA, same as Grok/Cursor.
  free: "Requires Claude Pro",
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
  // Missing or unrecognised subscription tier → treat as needing Claude Pro,
  // matching the explicit `free` branch in CLAUDE_SUB_LABEL.
  const authLabel =
    sub && CLAUDE_SUB_LABEL[sub]
      ? CLAUDE_SUB_LABEL[sub]
      : "Requires Claude Pro";
  return {
    authStatus: "authenticated",
    authType: "oauth",
    authLabel,
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

interface GrokAuthEntry {
  readonly key?: string; // JWT access token (contains "tier" claim)
  readonly email?: string;
  readonly first_name?: string;
}

/**
 * Minimum `tier` value from the xAI OIDC JWT that includes SuperGrok Heavy
 * (the plan required for full Grok coding agent / `grok agent stdio` access).
 * Lower tiers will be treated as "requires subscription" (disabled + nag).
 */
const MIN_SUPERGROK_HEAVY_TIER = 5;

/** Base64url decode + parse a JWT payload (no signature verification). */
const decodeJwtPayload = (jwt: string): Record<string, unknown> | null => {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payloadPart = parts[1];
    if (!payloadPart) return null;
    let b64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    // Pad to multiple of 4
    b64 += "===".slice((b64.length + 3) % 4);
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const parseGrokAuthJson = (raw: string): AccountInfo => {
  try {
    const data = JSON.parse(raw) as Record<string, GrokAuthEntry>;
    const entry = Object.values(data)[0];
    if (!entry) {
      return {
        authStatus: "authenticated",
        authType: "cli",
        authLabel: "Requires SuperGrok Heavy",
      } satisfies AccountInfo;
    }

    const email = entry.email?.trim();
    let authLabel = "Requires SuperGrok Heavy";

    if (entry.key) {
      const claims = decodeJwtPayload(entry.key);
      const tier = claims?.tier;
      if (typeof tier === "number" && tier >= MIN_SUPERGROK_HEAVY_TIER) {
        authLabel = "SuperGrok Heavy";
      }
    }

    return {
      authStatus: "authenticated",
      authType: "cli",
      ...(email ? { authEmail: email } : {}),
      authLabel,
    } satisfies AccountInfo;
  } catch {
    // Unparseable auth.json → conservative: treat as needing the plan.
    return {
      authStatus: "authenticated",
      authType: "cli",
      authLabel: "Requires SuperGrok Heavy",
    } satisfies AccountInfo;
  }
};

// Grok stores OIDC credentials (JWT + email + tier claim) in `~/.grok/auth.json`
// after `grok login`. We parse the JWT to read the `tier` claim and decide the
// plan status:
//
// - tier >= 5 → authLabel: "SuperGrok Heavy"   (good, card shows plan, toggle enabled)
// - lower / no JWT / unreadable → authLabel: "Requires SuperGrok Heavy" (disabled + violet nag)
//
// This gives real plan details in the UI while keeping the safety net for
// accounts that don't have the required SuperGrok Heavy plan. The final gate
// is still enforced server-side by the Grok ACP.
const probeGrokAccount: Effect.Effect<AccountInfo, never, FileSystem.FileSystem> =
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = join(homedir(), ".grok");
    const authPath = join(dir, "auth.json");

    const authExists = yield* fs
      .exists(authPath)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (authExists) {
      const raw = yield* fs
        .readFileString(authPath)
        .pipe(Effect.catchAll(() => Effect.succeed("")));
      if (raw.length > 0) {
        return parseGrokAuthJson(raw);
      }
    }

    // No auth.json (legacy dir, API key only, or first-run state).
    // We conservatively report "Requires SuperGrok Heavy" so the UI disables
    // the toggle and shows the subscription notice (same as before for unknown plans).
    const dirExists = yield* fs
      .exists(dir)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));
    return dirExists
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

// Strip ANSI escape sequences (cursor-positioning, colors, etc). The
// cursor-agent CLI emits a TUI-style status frame before its final answer,
// e.g. ` Starting login process...\n[2K[1A[2K[G\n Not logged in`. We only
// want to read the final human-readable line.
const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const stripAnsi = (raw: string): string => raw.replace(ANSI_PATTERN, "");

// `cursor-agent status` is the CLI's own auth signal. It prints either
// "Not logged in" or a positive line — `Logged in as <email>` on newer
// builds, `Login successful!` on older ones. The directory at
// `~/.local/share/cursor-agent/` is created on install regardless of
// login state, so we never trust it.
//
// We don't set the "Requires Cursor Pro" gating label, even though the
// ACP runtime does need a paid plan: cursor-agent has no `whoami`/`me`
// subcommand, so once a user is signed in we have no way to tell Pro
// from non-Pro. Falsely labelling every signed-in user as gated nags
// people who already pay. The ACP server enforces the real check at
// session start and surfaces a clear error there if the plan is missing.
const CURSOR_EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.\w+/;

const parseCursorStatusOutput = (raw: string): AccountInfo => {
  const cleanedRaw = stripAnsi(raw);
  const cleaned = cleanedRaw.toLowerCase();
  if (cleaned.includes("not logged in") || cleaned.includes("not signed in")) {
    return { authStatus: "unauthenticated" };
  }
  const emailMatch = cleanedRaw.match(CURSOR_EMAIL_PATTERN);
  if (
    cleaned.includes("logged in as") ||
    cleaned.includes("signed in as") ||
    cleaned.includes("login successful") ||
    cleaned.includes("authenticated") ||
    emailMatch !== null
  ) {
    return {
      authStatus: "authenticated",
      authType: "cli",
      ...(emailMatch !== null ? { authEmail: emailMatch[0] } : {}),
    } satisfies AccountInfo;
  }
  return { authStatus: "unknown" };
};

const probeCursorAccount: Effect.Effect<
  AccountInfo,
  never,
  CommandExecutor.CommandExecutor
> = Effect.gen(function* () {
  const executor = yield* CommandExecutor.CommandExecutor;
  const result = yield* Effect.gen(function* () {
    const proc = yield* executor.start(Command.make("cursor-agent", "status"));
    const stdout = yield* collectText(proc.stdout);
    const stderr = yield* collectText(proc.stderr);
    const exitCode = yield* proc.exitCode;
    return { stdout, stderr, exitCode };
  }).pipe(
    Effect.scoped,
    Effect.timeoutOption(PROBE_TIMEOUT),
    Effect.catchAll(() => Effect.succeedNone),
  );
  if (result._tag !== "Some") {
    return { authStatus: "unknown" } satisfies AccountInfo;
  }
  // Exit code is not a reliable signal — the CLI returns 0 even when not
  // logged in. Parse the text instead.
  return parseCursorStatusOutput(`${result.value.stdout}\n${result.value.stderr}`);
});

// OpenCode stores per-provider credentials in `~/.local/share/opencode/auth.json`
// after `opencode auth login <provider>`. Each top-level key is a provider id
// (anthropic, openai, …) and the value carries the access token or API key.
// We treat a non-empty file with at least one entry as "authenticated"; the
// renderer then surfaces "Connected to N providers" once we wire the
// dynamic inventory in. Falling back to the directory presence check
// matches the Gemini/Cursor pattern when the file is missing but the CLI
// has been installed.
interface OpencodeAuthBlob {
  readonly [providerId: string]: unknown;
}

const parseOpencodeAuth = (raw: string): AccountInfo => {
  let parsed: OpencodeAuthBlob;
  try {
    parsed = JSON.parse(raw) as OpencodeAuthBlob;
  } catch {
    return { authStatus: "authenticated", authType: "cli" };
  }
  const providerIds = Object.keys(parsed).filter(
    (k) => parsed[k] !== null && parsed[k] !== undefined,
  );
  if (providerIds.length === 0) {
    return { authStatus: "unauthenticated" };
  }
  return {
    authStatus: "authenticated",
    authType: "cli",
    authLabel:
      providerIds.length === 1
        ? `Connected to ${providerIds[0]}`
        : `Connected to ${providerIds.length} providers`,
  };
};

const probeOpencodeAccount: Effect.Effect<
  AccountInfo,
  never,
  FileSystem.FileSystem
> = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const authPath = join(
    homedir(),
    ".local",
    "share",
    "opencode",
    "auth.json",
  );
  const exists = yield* fs
    .exists(authPath)
    .pipe(Effect.catchAll(() => Effect.succeed(false)));
  if (!exists) {
    return { authStatus: "unauthenticated" } satisfies AccountInfo;
  }
  const raw = yield* fs
    .readFileString(authPath)
    .pipe(Effect.catchAll(() => Effect.succeed("")));
  return raw.length === 0
    ? { authStatus: "authenticated", authType: "cli" }
    : parseOpencodeAuth(raw);
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
    case "opencode":
      return probeOpencodeAccount;
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
