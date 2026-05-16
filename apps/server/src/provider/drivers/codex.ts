import { Effect, Mailbox, Stream } from "effect";

import {
  AgentSessionStartError,
  resolveModelSlug,
  type AgentEvent,
  type AgentItemId,
  type AgentSessionId,
  type AttachmentRef,
  type FileRef,
  type PermissionDecision,
  type PermissionKind,
  type PermissionMode,
  type SkillRef,
  type StartSessionInput,
  type UserQuestionAnswer,
} from "@memoize/wire";

import { AttachmentService } from "../../attachment/services/attachment-service.ts";
import { applyPlanModePrefix } from "./planMode.ts";
import { CodexAppServerClient } from "../codex-app-server-client.ts";
import type { ServerNotification } from "../codex-app-protocol/ServerNotification";
import type { ServerRequest } from "../codex-app-protocol/ServerRequest";
import type { SandboxPolicy } from "../codex-app-protocol/v2/SandboxPolicy";
import type { ThreadItem } from "../codex-app-protocol/v2/ThreadItem";
import type { UserInput } from "../codex-app-protocol/v2/UserInput";

const SUPPORTED_CODEX_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export type RequestPermission = (
  sessionId: AgentSessionId,
  kind: PermissionKind,
  options: { readonly forcePrompt: boolean },
) => Promise<PermissionDecision>;

const toSandboxMode = (
  mode: PermissionMode,
): "read-only" | "workspace-write" =>
  mode === "plan" ? "read-only" : "workspace-write";

const toSandboxPolicy = (mode: PermissionMode, cwd: string): SandboxPolicy =>
  mode === "plan"
    ? { type: "readOnly", networkAccess: false }
    : {
        type: "workspaceWrite",
        writableRoots: [cwd],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      };

export interface CodexSessionHandle {
  readonly events: Stream.Stream<AgentEvent>;
  readonly send: (
    text: string,
    attachments?: ReadonlyArray<AttachmentRef>,
    fileRefs?: ReadonlyArray<FileRef>,
    skillRefs?: ReadonlyArray<SkillRef>,
  ) => Effect.Effect<void>;
  readonly interrupt: () => Effect.Effect<void>;
  readonly close: () => Effect.Effect<void>;
  readonly setPermissionMode: (mode: PermissionMode) => Effect.Effect<void>;
  readonly answerQuestion: (
    itemId: AgentItemId,
    answers: ReadonlyArray<UserQuestionAnswer>,
  ) => Effect.Effect<void>;
}

let itemCounter = 0;
const nextItemId = (): AgentItemId =>
  `i_${Date.now()}_${++itemCounter}` as AgentItemId;

const firstLine = (text: string): string => text.split("\n", 1)[0] ?? "";

const asText = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2);

const decisionToCodex = (
  decision: PermissionDecision,
): "accept" | "acceptForSession" | "decline" =>
  decision._tag === "AllowForSession" || decision._tag === "AlwaysAllow"
    ? "acceptForSession"
    : decision._tag === "AllowOnce"
      ? "accept"
      : "decline";

const translateItem = (
  item: ThreadItem,
  phase: "started" | "completed",
): ReadonlyArray<AgentEvent> => {
  switch (item.type) {
    case "agentMessage":
      if (phase !== "completed") return [];
      return [{ _tag: "AssistantMessage", itemId: nextItemId(), text: item.text }];
    case "plan":
      if (phase !== "completed") return [];
      return [{ _tag: "AssistantMessage", itemId: nextItemId(), text: item.text }];
    case "reasoning": {
      if (phase !== "completed") return [];
      const text = [...item.summary, ...item.content].join("\n").trim();
      return text.length === 0
        ? []
        : [{ _tag: "Thinking", itemId: nextItemId(), text, redacted: false }];
    }
    case "commandExecution":
      if (phase === "started") {
        return [
          {
            _tag: "ToolUse",
            itemId: item.id as AgentItemId,
            tool: "command_execution",
            input: { command: item.command, cwd: item.cwd },
          },
        ];
      }
      return [
        {
          _tag: "ToolResult",
          itemId: item.id as AgentItemId,
          output: {
            command: item.command,
            exit_code: item.exitCode,
            output: item.aggregatedOutput ?? "",
          },
          isError: item.status === "failed",
        },
      ];
    case "fileChange":
      if (phase !== "completed") return [];
      return [
        {
          _tag: "ToolUse",
          itemId: item.id as AgentItemId,
          tool: "file_change",
          input: { changes: item.changes },
        },
        {
          _tag: "ToolResult",
          itemId: item.id as AgentItemId,
          output: { changes: item.changes, status: item.status },
          isError: item.status === "failed",
        },
      ];
    case "mcpToolCall":
      if (phase === "started") {
        return [
          {
            _tag: "ToolUse",
            itemId: item.id as AgentItemId,
            tool: `${item.server}/${item.tool}`,
            input: item.arguments,
          },
        ];
      }
      return [
        {
          _tag: "ToolResult",
          itemId: item.id as AgentItemId,
          output: item.result ?? item.error ?? null,
          isError: item.status === "failed",
        },
      ];
    case "dynamicToolCall":
      if (phase === "started") {
        return [
          {
            _tag: "ToolUse",
            itemId: item.id as AgentItemId,
            tool:
              item.namespace !== null
                ? `${item.namespace}/${item.tool}`
                : item.tool,
            input: item.arguments,
          },
        ];
      }
      return [
        {
          _tag: "ToolResult",
          itemId: item.id as AgentItemId,
          output: item.contentItems ?? null,
          isError: item.success === false,
        },
      ];
    case "webSearch":
      if (phase !== "completed") return [];
      // Use the Claude-canonical "WebSearch" tool name so the renderer's
      // tool-row switch picks up the globe icon + result rendering.
      // `query` is the canonical input key per the wire contract.
      return [
        {
          _tag: "ToolUse",
          itemId: item.id as AgentItemId,
          tool: "WebSearch",
          input: { query: item.query, action: item.action },
        },
      ];
    case "enteredReviewMode":
    case "exitedReviewMode":
      if (phase !== "completed") return [];
      return [
        {
          _tag: "AssistantMessage",
          itemId: item.id as AgentItemId,
          text:
            item.type === "enteredReviewMode"
              ? `Entered review mode: ${item.review}`
              : `Exited review mode: ${item.review}`,
        },
      ];
    case "contextCompaction":
      if (phase !== "completed") return [];
      return [
        {
          _tag: "AssistantMessage",
          itemId: item.id as AgentItemId,
          text: "Conversation context compacted.",
        },
      ];
    default:
      return [];
  }
};

export const startCodexSession = (
  input: StartSessionInput,
  cwd: string,
  apiKey: string | null,
  codexPath: string | null,
  sessionId: AgentSessionId,
  requestPermission: RequestPermission,
  resumeCursor: string | null = null,
): Effect.Effect<CodexSessionHandle, AgentSessionStartError, AttachmentService> =>
  Effect.gen(function* () {
    const attachments = yield* AttachmentService;
    const events = yield* Mailbox.make<AgentEvent>();
    let currentMode: PermissionMode = input.permissionMode ?? "default";
    let activeThreadId = resumeCursor;
    let currentTurnId: string | null = null;
    let latestDiff = "";
    let closed = false;
    let pending: Promise<void> = Promise.resolve();

    type QuestionWaiter = {
      readonly questionIds: ReadonlyArray<string>;
      readonly resolve: (answers: ReadonlyArray<UserQuestionAnswer>) => void;
    };
    const questionWaiters = new Map<string, QuestionWaiter>();

    const emit = (event: AgentEvent): void => {
      if (!closed) events.unsafeOffer(event);
    };

    const app = yield* Effect.tryPromise({
      try: () =>
        CodexAppServerClient.start({
          codexPath,
          onNotification: (notification) => {
            for (const event of translateNotification(notification)) emit(event);
          },
          onServerRequest: (request, respond) => {
            void handleServerRequest(request).then(respond).catch((cause) => {
              console.warn("[codex-app-server] request failed", cause);
              respond(defaultServerRequestResponse(request));
            });
          },
        }),
      catch: (cause) =>
        new AgentSessionStartError({
          providerId: "codex",
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });

    if (apiKey !== null && apiKey.length > 0) {
      // app-server uses the same CLI auth stack as the TUI. The key is still
      // accepted by the legacy SDK path, but app-server currently reads auth
      // from the user's Codex home; keep a visible note for future debugging.
      console.warn("[codex] API key credential present; app-server uses Codex CLI auth");
    }

    const commonThreadParams = {
      model: input.model ?? null,
      cwd,
      approvalPolicy: "never" as const,
      sandbox: toSandboxMode(currentMode),
      serviceName: "memoize",
    };

    const startOrResume = async (): Promise<void> => {
      if (activeThreadId !== null) {
        const resumed = await app.request<{ thread: { id: string } }>(
          "thread/resume",
          {
            threadId: activeThreadId,
            ...commonThreadParams,
          },
        );
        activeThreadId = resumed.thread.id;
      } else {
        const started = await app.request<{ thread: { id: string } }>(
          "thread/start",
          commonThreadParams,
        );
        activeThreadId = started.thread.id;
      }
      emit({
        _tag: "SessionCursor",
        cursor: activeThreadId,
        strategy: "codex-thread-id",
      });
    };

    yield* Effect.tryPromise({
      try: startOrResume,
      catch: (cause) =>
        new AgentSessionStartError({
          providerId: "codex",
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });

    const resolveImageInputs = async (
      refs: ReadonlyArray<AttachmentRef>,
    ): Promise<ReadonlyArray<UserInput>> => {
      const resolved: Array<UserInput | null> = await Promise.all(
        refs.map(async (ref) => {
          if (ref.id.startsWith("pending-")) return null;
          const normalizedMime =
            ref.mimeType.toLowerCase() === "image/jpg"
              ? "image/jpeg"
              : ref.mimeType.toLowerCase();
          if (!SUPPORTED_CODEX_IMAGE_MIME.has(normalizedMime)) return null;
          const meta = await Effect.runPromise(attachments.readPath(ref.id));
          return meta === null
            ? null
            : ({ type: "localImage", path: meta.path } as const);
        }),
      );
      return resolved.filter((item): item is UserInput => item !== null);
    };

    const findSkillPath = async (name: string): Promise<string | null> => {
      const response = await app.request<{
        data: ReadonlyArray<{
          skills: ReadonlyArray<{ name: string; path: string; enabled: boolean }>;
        }>;
      }>("skills/list", { cwds: [cwd], forceReload: false });
      for (const entry of response.data) {
        const found = entry.skills.find((s) => s.enabled && s.name === name);
        if (found !== undefined) return found.path;
      }
      return null;
    };

    const buildUserInput = async (
      text: string,
      attachmentRefs: ReadonlyArray<AttachmentRef>,
      fileRefs: ReadonlyArray<FileRef>,
      skillRefs: ReadonlyArray<SkillRef>,
    ): Promise<ReadonlyArray<UserInput>> => {
      const out: UserInput[] = [];
      for (const skill of skillRefs) {
        const path = await findSkillPath(skill.name);
        if (path !== null) {
          out.push({ type: "skill", name: skill.name, path });
        }
      }
      for (const file of fileRefs) {
        out.push({ type: "mention", name: file.relPath, path: file.absPath });
      }
      const skillPrefix = skillRefs[0]?.name;
      const cleanText =
        skillPrefix !== undefined
          ? text.replace(new RegExp(`^/${skillPrefix}\\s*`), "").trim()
          : text.trim();
      if (cleanText.length > 0) {
        out.push({ type: "text", text: cleanText, text_elements: [] });
      }
      out.push(...(await resolveImageInputs(attachmentRefs)));
      return out;
    };

    const runTurn = async (
      text: string,
      attachmentRefs: ReadonlyArray<AttachmentRef>,
      fileRefs: ReadonlyArray<FileRef>,
      skillRefs: ReadonlyArray<SkillRef>,
    ): Promise<void> => {
      if (closed || activeThreadId === null) return;
      const commandHandled =
        skillRefs.length === 0 && (await runSlashCommand(text));
      if (commandHandled) return;

      emit({ _tag: "Status", status: "running" });
      // Plan-mode emulation: Codex has no native "plan" runtime mode, so
      // prepend a developer-instructions block while plan mode is active.
      // The sandbox policy still gates writes, so this is belt-and-braces.
      const promptText = applyPlanModePrefix(currentMode, text);
      // Reasoning effort: forwarded from FE picker via
      // `input.modelOptions.reasoning`. Pass through low/medium/high
      // directly — Codex accepts the same literal set we use in wire's
      // `ReasoningLevel`.
      const reasoning = input.modelOptions?.["reasoning"];
      const effort: "low" | "medium" | "high" | null =
        reasoning === "low" || reasoning === "medium" || reasoning === "high"
          ? reasoning
          : null;
      const turn = await app.request<{ turn: { id: string } }>("turn/start", {
        threadId: activeThreadId,
        input: [...(await buildUserInput(promptText, attachmentRefs, fileRefs, skillRefs))],
        cwd,
        approvalPolicy: "never",
        sandboxPolicy: toSandboxPolicy(currentMode, cwd),
        model: input.model ?? null,
        ...(effort !== null ? { effort } : {}),
      });
      currentTurnId = turn.turn.id;
    };

    const enqueueTurn = (
      text: string,
      attachmentRefs: ReadonlyArray<AttachmentRef> = [],
      fileRefs: ReadonlyArray<FileRef> = [],
      skillRefs: ReadonlyArray<SkillRef> = [],
    ): void => {
      pending = pending
        .then(() => runTurn(text, attachmentRefs, fileRefs, skillRefs))
        .catch((cause) => {
          emit({
            _tag: "Error",
            message: cause instanceof Error ? cause.message : String(cause),
          });
          emit({ _tag: "Status", status: "idle" });
        });
    };

    const runSlashCommand = async (rawText: string): Promise<boolean> => {
      const trimmed = rawText.trim();
      const match = trimmed.match(/^\/([A-Za-z0-9_-]+)(?:\s+([\s\S]*))?$/);
      if (match === null || activeThreadId === null) return false;
      const command = match[1]!;
      const args = (match[2] ?? "").trim();
      const say = (text: string) =>
        emit({ _tag: "AssistantMessage", itemId: nextItemId(), text });

      switch (command) {
        case "compact":
          await app.request("thread/compact/start", { threadId: activeThreadId });
          say("Compaction started.");
          return true;
        case "fork": {
          const forked = await app.request<{ thread: { id: string } }>(
            "thread/fork",
            {
              threadId: activeThreadId,
              ...commonThreadParams,
            },
          );
          activeThreadId = forked.thread.id;
          emit({
            _tag: "SessionCursor",
            cursor: activeThreadId,
            strategy: "codex-thread-id",
          });
          say(`Forked Codex thread ${activeThreadId}.`);
          return true;
        }
        case "undo":
        case "rollback":
          await app.request("thread/rollback", {
            threadId: activeThreadId,
            numTurns: 1,
          });
          say("Rolled back the last Codex turn. Local file changes are not reverted by Codex app-server rollback.");
          return true;
        case "review":
          emit({ _tag: "Status", status: "running" });
          await app.request("review/start", {
            threadId: activeThreadId,
            target:
              args.length > 0
                ? { type: "custom", instructions: args }
                : { type: "uncommittedChanges" },
            delivery: "inline",
          });
          return true;
        case "status": {
          const status = await app.request<{
            thread: { id: string; status: string; modelProvider: string; cwd: string };
          }>("thread/read", { threadId: activeThreadId, includeTurns: false });
          say(
            `Codex thread ${status.thread.id}\nstatus: ${status.thread.status}\nprovider: ${status.thread.modelProvider}\ncwd: ${status.thread.cwd}`,
          );
          return true;
        }
        case "diff":
          say(latestDiff.length > 0 ? latestDiff : "No Codex turn diff is available yet.");
          return true;
        case "mcp": {
          const result = await app.request("mcpServerStatus/list", {});
          say(`MCP servers:\n${asText(result)}`);
          return true;
        }
        case "apps": {
          const result = await app.request("app/list", {});
          say(`Apps:\n${asText(result)}`);
          return true;
        }
        case "plugins": {
          const result = await app.request("plugin/list", {});
          say(`Plugins:\n${asText(result)}`);
          return true;
        }
        case "experimental": {
          const result = await app.request("experimentalFeature/list", {});
          say(`Experimental features:\n${asText(result)}`);
          return true;
        }
        case "debug-config": {
          const result = await app.request("config/read", {});
          say(`Codex config:\n${asText(result)}`);
          return true;
        }
        case "permissions":
          say("Codex approval policy is managed by this app. Current embedded policy: never.");
          return true;
        case "approval":
          say("Codex embedded approval policy is currently fixed at never; permission prompts are bridged through this app when app-server requests them.");
          return true;
        case "sandbox":
          if (
            args === "read-only" ||
            args === "plan" ||
            args === "readonly"
          ) {
            currentMode = "plan";
            emit({ _tag: "PermissionModeChanged", mode: "plan" });
            say("Codex sandbox set to read-only.");
          } else if (
            args === "workspace-write" ||
            args === "write" ||
            args === "default" ||
            args.length === 0
          ) {
            currentMode = "default";
            emit({ _tag: "PermissionModeChanged", mode: "default" });
            say("Codex sandbox set to workspace-write.");
          } else {
            say("Usage: /sandbox read-only | workspace-write");
          }
          return true;
        case "init":
          emit({ _tag: "Status", status: "running" });
          await app.request("turn/start", {
            threadId: activeThreadId,
            input: [
              {
                type: "text",
                text:
                  args.length > 0
                    ? `Initialize repository instructions. ${args}`
                    : "Initialize or update AGENTS.md with concise project instructions for Codex.",
                text_elements: [],
              },
            ],
            cwd,
          });
          return true;
        case "ps":
        case "stop":
        case "sandbox-add-read-dir":
        case "agent":
        case "personality":
        case "fast":
        case "mention":
        case "copy":
        case "theme":
        case "statusline":
        case "title":
        case "feedback":
        case "logout":
        case "resume":
        case "quit":
        case "exit":
          say("Closed the active Codex thread.");
          emit({ _tag: "Completed", reason: "ended" });
          closed = true;
          app.close();
          return true;
        default:
          return false;
      }
    };

    function translateNotification(
      notification: ServerNotification,
    ): ReadonlyArray<AgentEvent> {
      switch (notification.method) {
        case "thread/started":
          activeThreadId = notification.params.thread.id;
          return [
            {
              _tag: "SessionCursor",
              cursor: activeThreadId,
              strategy: "codex-thread-id",
            },
          ];
        case "turn/started":
          if (notification.params.threadId !== activeThreadId) return [];
          currentTurnId = notification.params.turn.id;
          return [{ _tag: "Status", status: "running" }];
        case "turn/completed":
          if (notification.params.threadId !== activeThreadId) return [];
          currentTurnId = null;
          return [{ _tag: "Status", status: "idle" }];
        case "turn/diff/updated":
          if (notification.params.threadId === activeThreadId) {
            latestDiff = notification.params.diff;
          }
          return [];
        case "item/started":
          if (notification.params.threadId !== activeThreadId) return [];
          return translateItem(notification.params.item, "started");
        case "item/completed":
          if (notification.params.threadId !== activeThreadId) return [];
          return translateItem(notification.params.item, "completed");
        case "error":
          return [{ _tag: "Error", message: notification.params.error.message }];
        default:
          return [];
      }
    }

    async function handleServerRequest(
      request: ServerRequest,
    ): Promise<unknown> {
      switch (request.method) {
        case "item/commandExecution/requestApproval": {
          const p = request.params;
          emit({
            _tag: "PermissionRequest",
            itemId: p.itemId as AgentItemId,
            kind: "command_execution",
            details: p,
          });
          const decision = await requestPermission(
            sessionId,
            { _tag: "Bash", command: p.command ?? "" },
            { forcePrompt: false },
          );
          return { decision: decisionToCodex(decision) };
        }
        case "item/fileChange/requestApproval": {
          const p = request.params;
          emit({
            _tag: "PermissionRequest",
            itemId: p.itemId as AgentItemId,
            kind: "file_change",
            details: p,
          });
          const decision = await requestPermission(
            sessionId,
            { _tag: "FileWrite", path: p.grantRoot ?? cwd },
            { forcePrompt: false },
          );
          return { decision: decisionToCodex(decision) };
        }
        case "item/permissions/requestApproval": {
          const p = request.params;
          emit({
            _tag: "PermissionRequest",
            itemId: p.itemId as AgentItemId,
            kind: "permissions",
            details: p,
          });
          const decision = await requestPermission(
            sessionId,
            {
              _tag: "Other",
              tool: "request_permissions",
              summary: p.reason ?? "Codex requested additional permissions",
            },
            { forcePrompt: false },
          );
          return decision._tag === "Deny"
            ? { permissions: {}, scope: "turn" }
            : { permissions: {}, scope: "session" };
        }
        case "item/tool/requestUserInput": {
          const p = request.params;
          const answers = await new Promise<ReadonlyArray<UserQuestionAnswer>>(
            (resolve) => {
              questionWaiters.set(p.itemId, {
                questionIds: p.questions.map((q) => q.id),
                resolve,
              });
              emit({
                _tag: "UserQuestion",
                itemId: p.itemId as AgentItemId,
                questions: p.questions.map((q) => ({
                  question: q.question,
                  options: (q.options ?? []).map(
                    (opt) => `${opt.label}: ${opt.description}`,
                  ),
                  multiSelect: false,
                })),
              });
            },
          );
          const waiter = questionWaiters.get(p.itemId);
          const questionIds = waiter?.questionIds ?? p.questions.map((q) => q.id);
          const out: Record<string, { answers: string[] }> = {};
          for (const answer of answers) {
            const question = p.questions[answer.questionIndex];
            const id = questionIds[answer.questionIndex];
            if (question === undefined || id === undefined) continue;
            const selected = answer.selected
              .map((idx) => question.options?.[idx]?.label)
              .filter((v): v is string => typeof v === "string");
            if (answer.other !== undefined) selected.push(answer.other);
            out[id] = { answers: selected };
          }
          return { answers: out };
        }
        case "mcpServer/elicitation/request": {
          const p = request.params;
          const itemId = nextItemId();
          const answers = await new Promise<ReadonlyArray<UserQuestionAnswer>>(
            (resolve) => {
              questionWaiters.set(itemId, {
                questionIds: ["elicitation"],
                resolve,
              });
              emit({
                _tag: "UserQuestion",
                itemId,
                questions: [
                  {
                    question: `${p.serverName}: ${p.message}`,
                    options: ["Accept", "Cancel"],
                    multiSelect: false,
                  },
                ],
              });
            },
          );
          const accept = answers[0]?.selected.includes(0) === true;
          return {
            action: accept ? "accept" : "cancel",
            content: null,
            _meta: null,
          };
        }
        default:
          return defaultServerRequestResponse(request);
      }
    }

    function defaultServerRequestResponse(request: ServerRequest): unknown {
      switch (request.method) {
        case "item/commandExecution/requestApproval":
          return { decision: "decline" };
        case "item/fileChange/requestApproval":
          return { decision: "decline" };
        case "item/permissions/requestApproval":
          return { permissions: {}, scope: "turn" };
        case "item/tool/requestUserInput":
          return { answers: {} };
        case "mcpServer/elicitation/request":
          return { action: "cancel", content: null, _meta: null };
        default:
          return {};
      }
    }

    if (input.initialPrompt !== undefined && input.initialPrompt.length > 0) {
      enqueueTurn(input.initialPrompt);
    }

    return {
      events: Mailbox.toStream(events),
      send: (text, attachmentRefs, fileRefs, skillRefs) =>
        Effect.sync(() => {
          enqueueTurn(
            text,
            attachmentRefs ?? [],
            fileRefs ?? [],
            skillRefs ?? [],
          );
        }),
      interrupt: () =>
        Effect.promise(async () => {
          if (activeThreadId !== null && currentTurnId !== null) {
            await app.request("turn/interrupt", {
              threadId: activeThreadId,
              turnId: currentTurnId,
            });
          }
        }),
      close: () =>
        Effect.sync(() => {
          emit({ _tag: "Completed", reason: "ended" });
          closed = true;
          app.close();
          void Effect.runPromise(events.end);
        }),
      setPermissionMode: (mode) =>
        Effect.sync(() => {
          currentMode = mode;
          emit({ _tag: "PermissionModeChanged", mode });
        }),
      answerQuestion: (itemId, answers) =>
        Effect.sync(() => {
          const waiter = questionWaiters.get(itemId);
          if (waiter === undefined) return;
          questionWaiters.delete(itemId);
          waiter.resolve(answers);
        }),
    };
  });
