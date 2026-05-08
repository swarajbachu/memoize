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

const KNOWN_PROVIDERS: ReadonlyArray<ProviderId> = ["claude", "codex"];

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
  }),
);
