import { Context, type Effect } from "effect";

import type { ProviderId } from "@memoize/wire";

import type { CredentialsError } from "../errors.ts";

/**
 * OS-keychain-backed credential store keyed by `providerId`. Used by the SDK
 * adapters to retrieve API keys without ever surfacing them to renderer code.
 * Set via the `agent.setCredential` RPC; never returned over the wire — only
 * `listConfigured()` is renderer-visible, surfaced as the `hasApiKey` flag
 * on `AgentAvailability`. CLI-login credentials (the primary auth path)
 * never touch this service.
 */
export interface CredentialsServiceShape {
  readonly get: (
    providerId: ProviderId,
  ) => Effect.Effect<string | null, CredentialsError>;
  readonly set: (
    providerId: ProviderId,
    apiKey: string,
  ) => Effect.Effect<void, CredentialsError>;
  readonly remove: (
    providerId: ProviderId,
  ) => Effect.Effect<void, CredentialsError>;
  readonly listConfigured: () => Effect.Effect<
    ReadonlyArray<ProviderId>,
    CredentialsError
  >;
}

export class CredentialsService extends Context.Tag(
  "memoize/CredentialsService",
)<CredentialsService, CredentialsServiceShape>() {}
