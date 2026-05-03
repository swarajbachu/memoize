import { Context, type Effect } from "effect";

import type { ProviderId } from "@forkzero/wire";

import type { CredentialsError } from "../errors.ts";

/**
 * OS-keychain-backed credential store keyed by `providerId`. Used by the SDK
 * adapters (PR 5/6) to retrieve API keys without ever surfacing them to
 * renderer code. Set via the `agent.setCredential` RPC; never returned over
 * the wire — only `listConfigured()` is renderer-visible (used by the
 * `sdkConfigured` flag in `AgentAvailability`).
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
  "forkzero/CredentialsService",
)<CredentialsService, CredentialsServiceShape>() {}
