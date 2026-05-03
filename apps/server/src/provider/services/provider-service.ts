import { Context, type Effect, type Stream } from "effect";

import type {
  AgentAvailability,
  AgentEvent,
  AgentSessionId,
  AgentSessionNotFoundError,
  AgentSessionStartError,
  AgentTurnId,
  ProviderId,
  ProviderNotAvailableError,
  StartSessionInput,
} from "@forkzero/wire";

import type { CredentialsError } from "../errors.ts";

/**
 * Public-facing service that the RPC handlers bind to. Every wire RPC
 * (`agent.availability`, `agent.start`, `agent.send`, …) maps to one method
 * here. The live impl (PR 5+) composes `ProviderRegistry`, `Credentials`, and
 * the spawn-CLI helper to satisfy these.
 */
export interface ProviderServiceShape {
  readonly availability: () => Effect.Effect<ReadonlyArray<AgentAvailability>>;

  readonly start: (
    input: StartSessionInput,
  ) => Effect.Effect<
    { readonly sessionId: AgentSessionId },
    ProviderNotAvailableError | AgentSessionStartError
  >;

  readonly send: (
    sessionId: AgentSessionId,
    text: string,
  ) => Effect.Effect<void, AgentSessionNotFoundError>;

  readonly interrupt: (
    sessionId: AgentSessionId,
    turnId?: AgentTurnId,
  ) => Effect.Effect<void, AgentSessionNotFoundError>;

  readonly close: (
    sessionId: AgentSessionId,
  ) => Effect.Effect<void, AgentSessionNotFoundError>;

  readonly events: (
    sessionId: AgentSessionId,
  ) => Stream.Stream<AgentEvent, AgentSessionNotFoundError>;

  readonly setCredential: (
    providerId: ProviderId,
    apiKey: string,
  ) => Effect.Effect<void, CredentialsError>;
}

export class ProviderService extends Context.Tag("forkzero/ProviderService")<
  ProviderService,
  ProviderServiceShape
>() {}
