import { CommandExecutor } from "@effect/platform";
import { Effect, Layer, Ref, Stream } from "effect";

import {
  AgentSessionId,
  AgentSessionNotFoundError,
  AgentSessionStartError,
  type AgentAvailability,
  type AgentEvent,
  type ProviderId,
} from "@forkzero/wire";

import { probeAllProviders } from "../availability.ts";
import {
  startClaudeSession,
  type ClaudeSessionHandle,
} from "../drivers/claude.ts";
import {
  startCodexSession,
  type CodexSessionHandle,
} from "../drivers/codex.ts";
import { CredentialsService } from "../services/credentials-service.ts";
import { ProviderService } from "../services/provider-service.ts";
import { WorkspaceService } from "../../workspace/services/workspace-service.ts";

/**
 * Live `ProviderService`. PR 5 wires the Claude SDK driver behind the session
 * RPCs. Codex (PR 6) lands as a second adapter and the session map will
 * generalize over `providerId` then. For now `start` only knows Claude.
 *
 * Sessions live in a `Ref<Map>` keyed by branded `AgentSessionId`; handles
 * own their own scope so `close()` is the canonical teardown — there is no
 * autocleanup tied to the renderer subscription.
 */
type SessionHandle = ClaudeSessionHandle | CodexSessionHandle;
type SessionEntry = {
  readonly providerId: ProviderId;
  readonly handle: SessionHandle;
};

let sessionCounter = 0;
const nextSessionId = (): AgentSessionId =>
  `s_${Date.now()}_${++sessionCounter}` as AgentSessionId;

export const ProviderServiceLive = Layer.effect(
  ProviderService,
  Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;
    const credentials = yield* CredentialsService;
    const workspace = yield* WorkspaceService;
    const sessions = yield* Ref.make<Map<AgentSessionId, SessionEntry>>(
      new Map(),
    );

    const availability = () =>
      Effect.gen(function* () {
        const list = yield* probeAllProviders.pipe(
          Effect.provideService(CommandExecutor.CommandExecutor, executor),
        );
        // listConfigured is best-effort — a keychain failure here shouldn't
        // wipe out the CLI-installed picture, since the launcher still works
        // for spawn-CLI without an API key.
        const configured = yield* credentials.listConfigured().pipe(
          Effect.catchAll(() =>
            Effect.succeed([] as ReadonlyArray<ProviderId>),
          ),
        );
        const configuredSet = new Set<ProviderId>(configured);
        return list.map(
          (a): AgentAvailability => ({
            ...a,
            sdkConfigured: configuredSet.has(a.providerId),
          }),
        );
      });

    const lookup = (
      sessionId: AgentSessionId,
    ): Effect.Effect<SessionEntry, AgentSessionNotFoundError> =>
      Effect.flatMap(Ref.get(sessions), (map) => {
        const entry = map.get(sessionId);
        return entry === undefined
          ? Effect.fail(new AgentSessionNotFoundError({ sessionId }))
          : Effect.succeed(entry);
      });

    return {
      availability,
      start: (input) =>
        Effect.gen(function* () {
          const folder = yield* workspace.findById(input.folderId);
          if (folder === null) {
            return yield* Effect.fail(
              new AgentSessionStartError({
                providerId: input.providerId,
                reason: `Folder ${input.folderId} not found.`,
              }),
            );
          }
          const apiKey = yield* credentials.get(input.providerId).pipe(
            Effect.catchAll(() => Effect.succeed<string | null>(null)),
          );
          const sessionId = nextSessionId();
          const handle: SessionHandle =
            input.providerId === "claude"
              ? yield* startClaudeSession(input, folder.path, apiKey, sessionId)
              : yield* startCodexSession(input, folder.path, apiKey, sessionId);
          yield* Ref.update(sessions, (map) => {
            const next = new Map(map);
            next.set(sessionId, { providerId: input.providerId, handle });
            return next;
          });
          return { sessionId };
        }),
      send: (sessionId, text) =>
        Effect.flatMap(lookup(sessionId), ({ handle }) => handle.send(text)),
      interrupt: (sessionId) =>
        Effect.flatMap(lookup(sessionId), ({ handle }) => handle.interrupt()),
      close: (sessionId) =>
        Effect.flatMap(lookup(sessionId), ({ handle }) =>
          handle.close().pipe(
            Effect.zipRight(
              Ref.update(sessions, (map) => {
                const next = new Map(map);
                next.delete(sessionId);
                return next;
              }),
            ),
          ),
        ),
      events: (sessionId) =>
        Stream.unwrap(
          Effect.map(lookup(sessionId), ({ handle }) => handle.events),
        ) as Stream.Stream<AgentEvent, AgentSessionNotFoundError>,
      setCredential: (providerId, apiKey) =>
        credentials.set(providerId, apiKey),
    };
  }),
);
