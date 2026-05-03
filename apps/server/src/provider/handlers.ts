import { CredentialStoreError, ForkzeroRpcs, type ProviderId } from "@forkzero/wire";
import { Effect, Layer, Stream } from "effect";

import { MessageStore } from "./services/message-store.ts";
import { ProviderService } from "./services/provider-service.ts";

/**
 * Provider-domain RPC handlers. Each subsequent PR adds a `toLayerHandler`
 * here as it registers its RPC into `ForkzeroRpcs` (in `@forkzero/wire`):
 *
 *   PR 3 — `agent.availability`         ← here
 *   PR 4 — `agent.setCredential`        ← here
 *   PR 5/6 — `agent.start` / `send` / `interrupt` / `close` / `events`
 */
const Availability = ForkzeroRpcs.toLayerHandler("agent.availability", () =>
  Effect.flatMap(ProviderService, (svc) => svc.availability()),
);

const SetCredential = ForkzeroRpcs.toLayerHandler(
  "agent.setCredential",
  ({ providerId, apiKey }) =>
    Effect.flatMap(ProviderService, (svc) =>
      svc.setCredential(providerId, apiKey).pipe(
        Effect.catchTag("CredentialsError", (err) =>
          Effect.fail(
            new CredentialStoreError({
              providerId: err.providerId as ProviderId,
              reason: err.reason,
            }),
          ),
        ),
      ),
    ),
);

const Start = ForkzeroRpcs.toLayerHandler("agent.start", (input) =>
  Effect.flatMap(ProviderService, (svc) => svc.start(input)),
);

const Send = ForkzeroRpcs.toLayerHandler("agent.send", ({ sessionId, text }) =>
  Effect.flatMap(ProviderService, (svc) => svc.send(sessionId, text)),
);

const Interrupt = ForkzeroRpcs.toLayerHandler(
  "agent.interrupt",
  ({ sessionId, turnId }) =>
    Effect.flatMap(ProviderService, (svc) => svc.interrupt(sessionId, turnId)),
);

const Close = ForkzeroRpcs.toLayerHandler("agent.close", ({ sessionId }) =>
  Effect.flatMap(ProviderService, (svc) => svc.close(sessionId)),
);

const Events = ForkzeroRpcs.toLayerHandler("agent.events", ({ sessionId }) =>
  Stream.unwrap(
    Effect.map(ProviderService, (svc) => svc.events(sessionId)),
  ),
);

// ---------------------------------------------------------------------------
// session.* / messages.* — chat-MVP surface backed by `MessageStore`.
// `agent.*` handlers above stay live (renderer no longer calls them, but the
// store composes them and they're useful for low-level testing).
// ---------------------------------------------------------------------------

const SessionList = ForkzeroRpcs.toLayerHandler(
  "session.list",
  ({ projectId, includeArchived }) =>
    Effect.flatMap(MessageStore, (svc) =>
      svc.listSessions(projectId, includeArchived ?? false),
    ),
);

const SessionGet = ForkzeroRpcs.toLayerHandler(
  "session.get",
  ({ sessionId }) =>
    Effect.flatMap(MessageStore, (svc) => svc.getSession(sessionId)),
);

const SessionCreate = ForkzeroRpcs.toLayerHandler("session.create", (input) =>
  Effect.flatMap(MessageStore, (svc) => svc.createSession(input)),
);

const SessionRename = ForkzeroRpcs.toLayerHandler(
  "session.rename",
  ({ sessionId, title }) =>
    Effect.flatMap(MessageStore, (svc) => svc.renameSession(sessionId, title)),
);

const SessionArchive = ForkzeroRpcs.toLayerHandler(
  "session.archive",
  ({ sessionId }) =>
    Effect.flatMap(MessageStore, (svc) => svc.archiveSession(sessionId)),
);

const SessionUnarchive = ForkzeroRpcs.toLayerHandler(
  "session.unarchive",
  ({ sessionId }) =>
    Effect.flatMap(MessageStore, (svc) => svc.unarchiveSession(sessionId)),
);

const SessionDelete = ForkzeroRpcs.toLayerHandler(
  "session.delete",
  ({ sessionId }) =>
    Effect.flatMap(MessageStore, (svc) => svc.deleteSession(sessionId)),
);

const MessagesList = ForkzeroRpcs.toLayerHandler(
  "messages.list",
  ({ sessionId }) =>
    Effect.flatMap(MessageStore, (svc) => svc.listMessages(sessionId)),
);

const MessagesStream = ForkzeroRpcs.toLayerHandler(
  "messages.stream",
  ({ sessionId }) =>
    Stream.unwrap(
      Effect.map(MessageStore, (svc) => svc.streamMessages(sessionId)),
    ),
);

const MessagesSend = ForkzeroRpcs.toLayerHandler(
  "messages.send",
  ({ sessionId, text }) =>
    Effect.flatMap(MessageStore, (svc) => svc.sendMessage(sessionId, text)),
);

const MessagesInterrupt = ForkzeroRpcs.toLayerHandler(
  "messages.interrupt",
  ({ sessionId }) =>
    Effect.flatMap(MessageStore, (svc) => svc.interruptSession(sessionId)),
);

export const ProviderHandlersLayer = Layer.mergeAll(
  Availability,
  SetCredential,
  Start,
  Send,
  Interrupt,
  Close,
  Events,
  SessionList,
  SessionGet,
  SessionCreate,
  SessionRename,
  SessionArchive,
  SessionUnarchive,
  SessionDelete,
  MessagesList,
  MessagesStream,
  MessagesSend,
  MessagesInterrupt,
);
