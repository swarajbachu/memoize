import { describe, expect, it } from "bun:test";
import { SqlClient } from "@effect/sql";
// The server ships on `@effect/sql-sqlite-node` (better-sqlite3), which Bun
// cannot dlopen. `@effect/sql-sqlite-bun` produces the same generic
// `SqlClient` tag on top of the built-in `bun:sqlite`, so MessageStoreLive
// runs unchanged under `bun test`. Test-only — the app keeps the node client.
import { SqliteClient } from "@effect/sql-sqlite-bun";
import { Effect, Layer, ManagedRuntime, Schedule, Stream } from "effect";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  AgentEvent,
  AgentSessionId,
  FolderId,
  SessionId,
} from "@memoize/wire";

import { NdjsonLogger } from "../src/persistence/ndjson-logger.ts";
import { Migration0001Initial } from "../src/persistence/migrations/0001_initial.ts";
import { Migration0002Permissions } from "../src/persistence/migrations/0002_permissions.ts";
import { Migration0003ResumeAndExport } from "../src/persistence/migrations/0003_resume_and_export.ts";
import { Migration0004PermissionScope } from "../src/persistence/migrations/0004_permission_scope.ts";
import { Migration0005RuntimeMode } from "../src/persistence/migrations/0005_runtime_mode.ts";
import { Migration0006Attachments } from "../src/persistence/migrations/0006_attachments.ts";
import { Migration0007Subagents } from "../src/persistence/migrations/0007_subagents.ts";
import { Migration0008WorktreesAndRepoSettings } from "../src/persistence/migrations/0008_worktrees_and_repo_settings.ts";
import { Migration0009PermissionModeAndToolSearch } from "../src/persistence/migrations/0009_permission_mode_and_tool_search.ts";
import { Migration0010NestedSessions } from "../src/persistence/migrations/0010_nested_sessions.ts";
import { Migration0011ChatsTable } from "../src/persistence/migrations/0011_chats_table.ts";
import { Migration0012ChatIdNotNull } from "../src/persistence/migrations/0012_chat_id_not_null.ts";
import { WorktreeService } from "../src/worktree/services/worktree-service.ts";
import { MessageStore } from "../src/provider/services/message-store.ts";
import { ProviderService } from "../src/provider/services/provider-service.ts";
import { MessageStoreLive } from "../src/provider/layers/message-store.ts";

const PROJECT_ID = "proj-test" as FolderId;

/**
 * Scripted provider events the stub replays on `events()` for the next
 * created session. The MessageStore boot path subscribes to this stream and
 * persists each renderable event — letting us assert the full
 * provider-event → messages-table pipeline without a real agent CLI.
 */
let scriptedEvents: ReadonlyArray<AgentEvent> = [];

/** A no-op ProviderService: starts/sends succeed; events replay the script. */
const StubProviderLive = Layer.succeed(ProviderService, {
  availability: () => Effect.succeed([]),
  start: (input) =>
    Effect.succeed({ sessionId: input.sessionId ?? ("stub" as AgentSessionId) }),
  send: () => Effect.void,
  interrupt: () => Effect.void,
  close: () => Effect.void,
  events: () => Stream.fromIterable(scriptedEvents),
  setCredential: () => Effect.void,
  setPermissionMode: () => Effect.void,
  answerQuestion: () => Effect.void,
});

/** Worktrees are never used (all sessions run worktreeId=null). */
const StubWorktreeLive = Layer.succeed(WorktreeService, {
  create: () => Effect.die("not used"),
  list: () => Effect.succeed([]),
  get: () => Effect.succeed(null),
  remove: () => Effect.void,
});

/** NdjsonLogger writes audit lines; in tests we swallow them. */
const StubNdjsonLive = Layer.succeed(NdjsonLogger, {
  append: () => Effect.void,
  close: () => Effect.void,
});

// Run every numbered migration in order against the generic SqlClient. We run
// them directly instead of via the node `SqliteMigrator` so the schema builds
// on top of the bun client too — a fresh test DB needs no migration tracking.
const runAllMigrations = Effect.all(
  [
    Migration0001Initial,
    Migration0002Permissions,
    Migration0003ResumeAndExport,
    Migration0004PermissionScope,
    Migration0005RuntimeMode,
    Migration0006Attachments,
    Migration0007Subagents,
    Migration0008WorktreesAndRepoSettings,
    Migration0009PermissionModeAndToolSearch,
    Migration0010NestedSessions,
    Migration0011ChatsTable,
    Migration0012ChatIdNotNull,
  ],
  { discard: true },
);

const makeRuntime = (dbPath: string) => {
  const SqlLive = SqliteClient.layer({ filename: dbPath });
  // Run migrations during layer build, and re-export SqlClient downstream.
  const Migrated = Layer.effectDiscard(runAllMigrations).pipe(
    Layer.provideMerge(SqlLive),
  );
  const TestLayer = MessageStoreLive.pipe(
    Layer.provide(StubProviderLive),
    Layer.provide(StubWorktreeLive),
    Layer.provide(StubNdjsonLive),
    // provideMerge (not provide) so SqlClient stays in the runtime context —
    // the test seeds the `projects` row through it directly.
    Layer.provideMerge(Migrated),
  );
  return ManagedRuntime.make(TestLayer);
};

const withRuntime = async <A>(
  fn: (run: <X>(eff: Effect.Effect<X, unknown, MessageStore | SqlClient.SqlClient>) => Promise<X>) => Promise<A>,
): Promise<A> => {
  const dir = mkdtempSync(join(tmpdir(), "mz-msgstore-"));
  const dbPath = join(dir, "test.sqlite");
  const runtime = makeRuntime(dbPath);
  const run = <X>(eff: Effect.Effect<X, unknown, MessageStore | SqlClient.SqlClient>): Promise<X> =>
    runtime.runPromise(eff as Effect.Effect<X, unknown, never>);
  try {
    // Seed the project row through the runtime's own SqlClient.
    await run(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const now = new Date().toISOString();
        yield* sql`
          INSERT INTO projects (id, path, name, created_at, updated_at)
          VALUES (${PROJECT_ID}, ${"/tmp/project"}, ${"Test"}, ${now}, ${now})
        `;
      }),
    );
    return await fn(run);
  } finally {
    await runtime.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
};

const store = MessageStore;

describe("MessageStore — chat & session lifecycle", () => {
  it("createChat persists a chat, an initial session, and the user message", async () => {
    await withRuntime(async (run) => {
      const result = await run(
        Effect.flatMap(store, (s) =>
          s.createChat({
            projectId: PROJECT_ID,
            providerId: "claude",
            model: "claude-opus-4-8",
            initialPrompt: "fix the bug",
          }),
        ),
      );

      expect(result.chat.projectId).toBe(PROJECT_ID);
      expect(result.initialSession.providerId).toBe("claude");
      expect(result.initialSession.chatId).toBe(result.chat.id);
      // hasInitial → session boots straight into "running".
      expect(result.initialSession.status).toBe("running");
      expect(result.initialMessage?.role).toBe("user");
      expect(result.initialMessage?.content).toMatchObject({
        _tag: "user",
        text: "fix the bug",
      });
    });
  });

  it("listSessions and getSession read the persisted row back", async () => {
    await withRuntime(async (run) => {
      const { initialSession } = await run(
        Effect.flatMap(store, (s) =>
          s.createChat({
            projectId: PROJECT_ID,
            providerId: "grok",
            model: "grok-code",
          }),
        ),
      );

      const listed = await run(
        Effect.flatMap(store, (s) => s.listSessions(PROJECT_ID, false)),
      );
      expect(listed.map((x) => x.id)).toContain(initialSession.id);

      const got = await run(
        Effect.flatMap(store, (s) => s.getSession(initialSession.id)),
      );
      expect(got.id).toBe(initialSession.id);
      expect(got.providerId).toBe("grok");
    });
  });

  it("getSession fails with SessionNotFoundError for an unknown id", async () => {
    await withRuntime(async (run) => {
      const exit = await run(
        Effect.flatMap(store, (s) =>
          s.getSession("does-not-exist" as SessionId),
        ).pipe(Effect.either),
      );
      expect(exit._tag).toBe("Left");
      if (exit._tag === "Left") {
        expect((exit.left as { _tag: string })._tag).toBe(
          "SessionNotFoundError",
        );
      }
    });
  });

  it("renameSession, setRuntimeMode and setPermissionMode persist", async () => {
    await withRuntime(async (run) => {
      const { initialSession } = await run(
        Effect.flatMap(store, (s) =>
          s.createChat({
            projectId: PROJECT_ID,
            providerId: "claude",
            model: "claude-opus-4-8",
          }),
        ),
      );
      const id = initialSession.id;

      await run(
        Effect.flatMap(store, (s) =>
          Effect.all([
            s.renameSession(id, "Renamed"),
            s.setRuntimeMode(id, "full-access"),
            s.setPermissionMode(id, "plan"),
          ]),
        ),
      );

      const got = await run(Effect.flatMap(store, (s) => s.getSession(id)));
      expect(got.title).toBe("Renamed");
      expect(got.runtimeMode).toBe("full-access");
      expect(got.permissionMode).toBe("plan");
    });
  });

  it("sendMessage appends a user message to the log", async () => {
    await withRuntime(async (run) => {
      const { initialSession } = await run(
        Effect.flatMap(store, (s) =>
          s.createChat({
            projectId: PROJECT_ID,
            providerId: "claude",
            model: "claude-opus-4-8",
          }),
        ),
      );
      const id = initialSession.id;

      await run(Effect.flatMap(store, (s) => s.sendMessage(id, "hello there")));

      const messages = await run(
        Effect.flatMap(store, (s) => s.listMessages(id)),
      );
      const user = messages.filter((m) => m.role === "user");
      expect(user.length).toBeGreaterThanOrEqual(1);
      expect(user.at(-1)?.content).toMatchObject({
        _tag: "user",
        text: "hello there",
      });
    });
  });

  it("archiveSession hides the row unless includeArchived is set", async () => {
    await withRuntime(async (run) => {
      const { initialSession } = await run(
        Effect.flatMap(store, (s) =>
          s.createChat({
            projectId: PROJECT_ID,
            providerId: "claude",
            model: "claude-opus-4-8",
          }),
        ),
      );
      const id = initialSession.id;

      await run(Effect.flatMap(store, (s) => s.archiveSession(id)));

      const active = await run(
        Effect.flatMap(store, (s) => s.listSessions(PROJECT_ID, false)),
      );
      expect(active.map((x) => x.id)).not.toContain(id);

      const all = await run(
        Effect.flatMap(store, (s) => s.listSessions(PROJECT_ID, true)),
      );
      expect(all.map((x) => x.id)).toContain(id);
    });
  });
});

describe("MessageStore — provider event persistence", () => {
  it("persists a scripted AssistantMessage event as an assistant message", async () => {
    scriptedEvents = [
      { _tag: "AssistantMessage", itemId: "i_a1" as never, text: "all done" },
      { _tag: "Completed", reason: "ended" },
    ];
    try {
      await withRuntime(async (run) => {
        const { initialSession } = await run(
          Effect.flatMap(store, (s) =>
            s.createChat({
              projectId: PROJECT_ID,
              providerId: "claude",
              model: "claude-opus-4-8",
              initialPrompt: "go",
            }),
          ),
        );
        const id = initialSession.id;

        // The event pump is a forked daemon — poll until the assistant row
        // lands (or give up after a bounded number of tries).
        const findAssistant = Effect.flatMap(store, (s) =>
          s.listMessages(id),
        ).pipe(
          Effect.map((msgs) => msgs.find((m) => m.role === "assistant")),
          Effect.flatMap((found) =>
            found !== undefined
              ? Effect.succeed(found)
              : Effect.fail("not yet" as const),
          ),
          Effect.retry(
            Schedule.spaced("10 millis").pipe(
              Schedule.intersect(Schedule.recurs(100)),
            ),
          ),
          Effect.either,
        );

        const assistant = await run(findAssistant);
        expect(assistant._tag).toBe("Right");
        if (assistant._tag === "Right") {
          expect(assistant.right.content).toMatchObject({
            _tag: "assistant",
            text: "all done",
          });
        }
      });
    } finally {
      scriptedEvents = [];
    }
  });
});
