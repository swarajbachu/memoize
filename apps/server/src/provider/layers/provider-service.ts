import { CommandExecutor, FileSystem } from "@effect/platform";
import { Effect, Layer, Ref, Runtime, Stream } from "effect";

import {
  AgentSessionId,
  AgentSessionNotFoundError,
  AgentSessionStartError,
  DEFAULT_RUNTIME_MODE,
  type AgentAvailability,
  type AgentEvent,
  type FolderId,
  type PermissionDecision,
  type PermissionKind,
  type ProviderId,
} from "@forkzero/wire";

import { probeAllProviders, resolveCliPath } from "../availability.ts";
import {
  startClaudeSession,
  type ClaudeSessionHandle,
} from "../drivers/claude.ts";
import {
  startCodexSession,
  type CodexSessionHandle,
} from "../drivers/codex.ts";
import { AttachmentService } from "../../attachment/services/attachment-service.ts";
import { CredentialsService } from "../services/credentials-service.ts";
import { PermissionService } from "../services/permission-service.ts";
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
    const fs = yield* FileSystem.FileSystem;
    const credentials = yield* CredentialsService;
    const workspace = yield* WorkspaceService;
    const permissions = yield* PermissionService;
    const attachmentService = yield* AttachmentService;
    const runtime = yield* Effect.runtime<never>();
    const sessions = yield* Ref.make<Map<AgentSessionId, SessionEntry>>(
      new Map(),
    );

    // The Claude SDK's `canUseTool` callback returns a Promise; here we
    // shim PermissionService.request into that signature using the live
    // runtime captured at layer construction. `projectId` is bound at
    // start() time so the driver doesn't need to know about projects.
    const buildRequestPermission =
      (projectId: FolderId) =>
      (
        sessionId: AgentSessionId,
        kind: PermissionKind,
        options: { readonly forcePrompt: boolean },
      ): Promise<PermissionDecision> =>
        Runtime.runPromise(runtime)(
          permissions.request(sessionId, kind, {
            projectId,
            forcePrompt: options.forcePrompt,
          }),
        );

    const availability = () =>
      Effect.gen(function* () {
        const list = yield* probeAllProviders.pipe(
          Effect.provideService(CommandExecutor.CommandExecutor, executor),
          Effect.provideService(FileSystem.FileSystem, fs),
        );
        // listConfigured is best-effort — a keychain failure here shouldn't
        // wipe out the CLI-logged-in picture, which is the primary auth path
        // and works without any keychain entry of ours.
        const configured = yield* credentials.listConfigured().pipe(
          Effect.catchAll(() =>
            Effect.succeed([] as ReadonlyArray<ProviderId>),
          ),
        );
        const configuredSet = new Set<ProviderId>(configured);
        return list.map(
          (a): AgentAvailability => ({
            ...a,
            hasApiKey: configuredSet.has(a.providerId),
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
      start: (input, resumeCursor = null, getRuntimeMode) =>
        Effect.gen(function* () {
          const runtimeModeGetter =
            getRuntimeMode ?? (() => DEFAULT_RUNTIME_MODE);
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
          const sessionId = input.sessionId ?? nextSessionId();
          let handle: SessionHandle;
          if (input.providerId === "claude") {
            // Point the SDK at the user's installed `claude` binary; the
            // SDK's bundled CLI is shipped as an optional native dep that
            // doesn't always install. Falls through to bundled if not found.
            const claudePath = yield* resolveCliPath("claude").pipe(
              Effect.provideService(CommandExecutor.CommandExecutor, executor),
            );
            handle = yield* startClaudeSession(
              input,
              folder.path,
              apiKey,
              claudePath,
              sessionId,
              buildRequestPermission(input.folderId),
              runtimeModeGetter,
              resumeCursor,
            ).pipe(Effect.provideService(AttachmentService, attachmentService));
          } else {
            // Codex SDK currently has no public resume API matching our
            // cursor-based model; reject early with a stable reason the
            // renderer can route to "Session ended — start new session".
            if (resumeCursor !== null) {
              return yield* Effect.fail(
                new AgentSessionStartError({
                  providerId: "codex",
                  reason: "resume_unsupported",
                }),
              );
            }
            handle = yield* startCodexSession(
              input,
              folder.path,
              apiKey,
              sessionId,
            );
          }
          yield* Ref.update(sessions, (map) => {
            const next = new Map(map);
            next.set(sessionId, { providerId: input.providerId, handle });
            return next;
          });
          return { sessionId };
        }),
      send: (sessionId, text, attachments) =>
        Effect.flatMap(lookup(sessionId), ({ handle }) =>
          handle.send(text, attachments),
        ),
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
