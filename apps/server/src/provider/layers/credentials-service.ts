import keytar from "keytar";
import { Effect, Layer } from "effect";

import { type ProviderId } from "@memoize/wire";

import { CredentialsError } from "../errors.ts";
import { CredentialsService } from "../services/credentials-service.ts";

const SERVICE_NAME = "memoize";

/**
 * Keychain entries are namespaced as `apiKey:<providerId>` under the
 * `memoize` service. Listing uses `findCredentials(SERVICE_NAME)` and filters
 * to the `apiKey:` prefix — keeps room for future credential kinds (refresh
 * tokens, OAuth state) without colliding with API keys.
 */
const accountFor = (providerId: ProviderId): string => `apiKey:${providerId}`;

/**
 * Browser credentials share the `memoize` keychain service but use a separate
 * `browserCred:` prefix so they never collide with `apiKey:` entries. The
 * origin is normalized (scheme + host[:port]) so `https://x.com/login` and
 * `https://x.com/` resolve to the same saved credential.
 */
const BROWSER_PREFIX = "browserCred:";
const browserAccountFor = (origin: string): string =>
  `${BROWSER_PREFIX}${normalizeOrigin(origin)}`;

const normalizeOrigin = (input: string): string => {
  try {
    return new URL(input).origin;
  } catch {
    // Not a full URL — best effort: strip any path/query and lowercase host.
    return input.trim().replace(/\/.*$/, "").toLowerCase();
  }
};

interface BrowserCred {
  readonly username: string;
  readonly password: string;
}

const parseBrowserCred = (raw: string | null): BrowserCred | null => {
  if (raw === null) return null;
  try {
    const obj = JSON.parse(raw) as Partial<BrowserCred>;
    if (typeof obj.username === "string" && typeof obj.password === "string") {
      return { username: obj.username, password: obj.password };
    }
  } catch {
    // Corrupt entry — treat as absent.
  }
  return null;
};

const KNOWN_PROVIDERS: ReadonlyArray<ProviderId> = [
  "claude",
  "codex",
  "grok",
  "gemini",
  "cursor",
];

const isKnownProvider = (id: string): id is ProviderId =>
  (KNOWN_PROVIDERS as ReadonlyArray<string>).includes(id);

const tryKeychain = <A>(
  providerId: ProviderId | "*",
  thunk: () => Promise<A>,
): Effect.Effect<A, CredentialsError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) =>
      new CredentialsError({
        providerId: providerId === "*" ? "" : providerId,
        reason: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });

export const CredentialsServiceLive = Layer.succeed(
  CredentialsService,
  CredentialsService.of({
    get: (providerId) =>
      tryKeychain(providerId, () =>
        keytar.getPassword(SERVICE_NAME, accountFor(providerId)),
      ),
    set: (providerId, apiKey) =>
      tryKeychain(providerId, () =>
        keytar.setPassword(SERVICE_NAME, accountFor(providerId), apiKey),
      ),
    remove: (providerId) =>
      tryKeychain(providerId, () =>
        keytar.deletePassword(SERVICE_NAME, accountFor(providerId)),
      ).pipe(Effect.asVoid),
    listConfigured: () =>
      tryKeychain("*", () => keytar.findCredentials(SERVICE_NAME)).pipe(
        Effect.map((entries) => {
          const out: ProviderId[] = [];
          for (const { account } of entries) {
            const idx = account.indexOf(":");
            if (idx === -1 || account.slice(0, idx) !== "apiKey") continue;
            const id = account.slice(idx + 1);
            if (isKnownProvider(id) && !out.includes(id)) out.push(id);
          }
          return out;
        }),
      ),
    setBrowser: (origin, username, password) =>
      tryKeychain("*", () =>
        keytar.setPassword(
          SERVICE_NAME,
          browserAccountFor(origin),
          JSON.stringify({ username, password }),
        ),
      ),
    getBrowser: (origin) =>
      tryKeychain("*", () =>
        keytar.getPassword(SERVICE_NAME, browserAccountFor(origin)),
      ).pipe(Effect.map(parseBrowserCred)),
    removeBrowser: (origin) =>
      tryKeychain("*", () =>
        keytar.deletePassword(SERVICE_NAME, browserAccountFor(origin)),
      ).pipe(Effect.asVoid),
    listBrowser: () =>
      tryKeychain("*", () => keytar.findCredentials(SERVICE_NAME)).pipe(
        Effect.map((entries) => {
          const out: Array<{ origin: string; username: string }> = [];
          for (const { account, password } of entries) {
            if (!account.startsWith(BROWSER_PREFIX)) continue;
            const origin = account.slice(BROWSER_PREFIX.length);
            const cred = parseBrowserCred(password);
            out.push({ origin, username: cred?.username ?? "" });
          }
          return out;
        }),
      ),
  }),
);
