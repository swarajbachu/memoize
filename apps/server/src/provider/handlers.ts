import { CredentialStoreError, ForkzeroRpcs, type ProviderId } from "@forkzero/wire";
import { Effect, Layer, Stream } from "effect";

import { MessageStore } from "./services/message-store.ts";
import { PermissionService } from "./services/permission-service.ts";
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
  Effect.flatMap(MessageStore, (svc) =>
    svc.createSession({
      projectId: input.projectId,
      providerId: input.providerId,
      model: input.model,
      title: input.title,
      initialPrompt: input.initialPrompt,
      runtimeMode: input.runtimeMode,
      agents: input.agents,
      enableSubagents: input.enableSubagents,
      worktreeId: input.worktreeId ?? null,
      permissionMode: input.permissionMode,
      toolSearch: input.toolSearch,
    }),
  ),
);

const SessionRename = ForkzeroRpcs.toLayerHandler(
  "session.rename",
  ({ sessionId, title }) =>
    Effect.flatMap(MessageStore, (svc) => svc.renameSession(sessionId, title)),
);

const SessionSetModel = ForkzeroRpcs.toLayerHandler(
  "session.setModel",
  ({ sessionId, model }) =>
    Effect.flatMap(MessageStore, (svc) => svc.setModel(sessionId, model)),
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

const SessionResume = ForkzeroRpcs.toLayerHandler(
  "session.resume",
  ({ sessionId }) =>
    Effect.flatMap(MessageStore, (svc) => svc.resumeSession(sessionId)),
);

const SessionSetRuntimeMode = ForkzeroRpcs.toLayerHandler(
  "session.setRuntimeMode",
  ({ sessionId, runtimeMode }) =>
    Effect.flatMap(MessageStore, (svc) =>
      svc.setRuntimeMode(sessionId, runtimeMode),
    ),
);

const SessionSetPermissionMode = ForkzeroRpcs.toLayerHandler(
  "session.setPermissionMode",
  ({ sessionId, mode }) =>
    Effect.flatMap(MessageStore, (svc) =>
      svc.setPermissionMode(sessionId, mode),
    ),
);

const SessionAnswerQuestion = ForkzeroRpcs.toLayerHandler(
  "session.answerQuestion",
  ({ sessionId, itemId, answers }) =>
    Effect.flatMap(MessageStore, (svc) =>
      svc.answerQuestion(
        sessionId,
        itemId as import("@forkzero/wire").AgentItemId,
        answers,
      ),
    ),
);

const SessionSetWorktree = ForkzeroRpcs.toLayerHandler(
  "session.setWorktree",
  ({ sessionId, worktreeId }) =>
    Effect.flatMap(MessageStore, (svc) =>
      svc.setWorktree(sessionId, worktreeId),
    ),
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

const SessionStreamStatus = ForkzeroRpcs.toLayerHandler(
  "session.streamStatus",
  ({ sessionId }) =>
    Stream.unwrap(
      Effect.map(MessageStore, (svc) => svc.streamStatus(sessionId)),
    ),
);

const MessagesSend = ForkzeroRpcs.toLayerHandler(
  "messages.send",
  ({ sessionId, text, input }) => {
    console.log(
      `[rpc.messages.send] sessionId=${sessionId} hasInput=${input !== undefined} attachments=${
        input?.attachments?.length ?? 0
      } fileRefs=${input?.fileRefs?.length ?? 0} skillRefs=${
        input?.skillRefs?.length ?? 0
      } textLen=${(input?.text ?? text ?? "").length}`,
    );
    if (input?.attachments !== undefined && input.attachments.length > 0) {
      console.log(
        `[rpc.messages.send] attachments: ${JSON.stringify(input.attachments)}`,
      );
    }
    return Effect.flatMap(MessageStore, (svc) =>
      svc.sendMessage(
        sessionId,
        input?.text ?? text ?? "",
        input?.attachments,
        input?.fileRefs,
        input?.skillRefs,
      ),
    );
  },
);

const MessagesInterrupt = ForkzeroRpcs.toLayerHandler(
  "messages.interrupt",
  ({ sessionId }) =>
    Effect.flatMap(MessageStore, (svc) => svc.interruptSession(sessionId)),
);

// ---------------------------------------------------------------------------
// permission.* — Phase 4 surface. The renderer subscribes to
// `permission.requests`, shows a toast, and posts back via `permission.decide`.
// `listPending` is the cold-load helper used on session mount.
// ---------------------------------------------------------------------------

const PermissionRequests = ForkzeroRpcs.toLayerHandler(
  "permission.requests",
  () =>
    Stream.unwrap(Effect.map(PermissionService, (svc) => svc.requests())),
);

const PermissionDecide = ForkzeroRpcs.toLayerHandler(
  "permission.decide",
  ({ requestId, decision }) =>
    Effect.flatMap(PermissionService, (svc) => svc.decide(requestId, decision)),
);

const PermissionListPending = ForkzeroRpcs.toLayerHandler(
  "permission.listPending",
  ({ sessionId }) =>
    Effect.flatMap(PermissionService, (svc) => svc.listPending(sessionId)),
);

const PermissionListDecisions = ForkzeroRpcs.toLayerHandler(
  "permission.listDecisions",
  ({ projectId }) =>
    Effect.flatMap(PermissionService, (svc) =>
      svc.listDecisions({ projectId }),
    ),
);

const PermissionRevokeDecision = ForkzeroRpcs.toLayerHandler(
  "permission.revokeDecision",
  ({ requestId }) =>
    Effect.flatMap(PermissionService, (svc) => svc.revokeDecision(requestId)),
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
  SessionSetModel,
  SessionArchive,
  SessionUnarchive,
  SessionDelete,
  SessionResume,
  SessionSetRuntimeMode,
  SessionSetPermissionMode,
  SessionAnswerQuestion,
  SessionSetWorktree,
  SessionStreamStatus,
  MessagesList,
  MessagesStream,
  MessagesSend,
  MessagesInterrupt,
  PermissionRequests,
  PermissionDecide,
  PermissionListPending,
  PermissionListDecisions,
  PermissionRevokeDecision,
);
