import type { EditorView } from "@codemirror/view";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  FolderClosed,
  GitBranch,
  Gauge,
  Lock,
  Map,
  Paperclip,
  Search as SearchIcon,
  Send,
  Square,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  MODELS_BY_PROVIDER,
  findModelDescriptor,
  type AgentAvailability,
  type ChatId,
  type Message,
  type PermissionMode,
  type PermissionRequest,
  type ProviderId,
  type RuntimeMode,
  type SelectOptionDescriptor,
  type Session,
  type SessionId,
} from "@memoize/wire";

import { Card, CardPanel } from "~/components/ui/card";
import { Frame, FrameFooter } from "~/components/ui/frame";
import { Button } from "~/components/ui/button";
import {
  composerDoc,
  createComposerView,
  reconfigureComposerKeymap,
  replaceWithChip,
  setComposerDoc,
  type ActiveTrigger,
} from "~/lib/codemirror/composer";
import { useKeybindingsStore } from "../store/keybindings";
import {
  addChipEffect,
  clearChipsEffect,
  updateImageChipEffect,
} from "~/lib/codemirror/composer-chips";
import { useAttachmentsStore } from "../store/attachments.ts";
import { useComposerBridge } from "../store/composer-bridge.ts";
import { cn } from "~/lib/utils";
import {
  matchBuiltin,
  type BuiltinCommand,
} from "../composer/builtin-commands.ts";
import { parseComposerInput } from "../composer/segment-parser.ts";
import { FileChipHover } from "./composer/file-chip-hover.tsx";
import { FileTagPopover } from "./composer/file-tag-popover.tsx";
import { QueueTray } from "./composer/queue-tray.tsx";
import { SlashCommandPopover } from "./composer/slash-command-popover.tsx";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";
import {
  Popover,
  PopoverPrimitive,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  pushModelPickerEvent,
  readModelPickerEvents,
  topRecents,
  type ModelPickerEvent,
  type ModelPickerRecent,
} from "~/lib/model-picker-recents";
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useMessagesStore } from "../store/messages.ts";
import { useOpencodeInventory } from "../store/opencode-inventory.ts";
import { useProvidersStore } from "../store/providers.ts";
import { useSettingsStore } from "../store/settings.ts";
import { usePermissionsStore } from "../store/permissions.ts";
import { useChatsStore } from "../store/chats.ts";
import { useSessionsStore } from "../store/sessions.ts";
import { useUiStore } from "../store/ui.ts";
import { EMPTY_WORKTREES, useWorktreesStore } from "../store/worktrees.ts";
import { PermissionCard } from "./permission-card.tsx";
import { QuestionCard } from "./question-card.tsx";
import { ProviderIcon } from "./provider-icons.tsx";
import { MODES_ORDER, MODE_META } from "./runtime-mode-meta.ts";

const MIN_HEIGHT = 56;
const MAX_HEIGHT = 240;
const MAX_ATTACHMENTS_PER_TURN = 20;


export function ChatComposer({ session }: { session: Session }) {
  const sessionId: SessionId = session.id;
  const inFlight = useMessagesStore(
    (s) => s.runningBySession[sessionId] === true,
  );
  const send = useMessagesStore((s) => s.send);
  const interrupt = useMessagesStore((s) => s.interrupt);
  const queue = useMessagesStore((s) => s.queue);

  // Pending AskUserQuestion takes over the composer slot — that's where
  // the user types anyway, and floating it inline above the chat
  // crowded the timeline. Swap to QuestionCard while one is unanswered;
  // otherwise render the normal editor.
  //
  // Select the stable message-list reference (Zustand interns the array
  // — same identity until a new message arrives) and derive the
  // pending-question shape with `useMemo`. Returning a freshly-built
  // object directly from a Zustand selector breaks
  // `useSyncExternalStore`'s snapshot-equality check and infinite-loops
  // the renderer.
  const sessionMessages = useMessagesStore(
    (s) => s.messagesBySession[sessionId],
  );
  const pendingQuestion = useMemo(() => {
    const list = sessionMessages ?? [];
    const answered = new Set<string>();
    for (const m of list) {
      if (m.content._tag === "user_question_answer") {
        answered.add(m.content.itemId as string);
      }
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]!;
      if (
        m.content._tag === "user_question" &&
        !answered.has(m.content.itemId as string)
      ) {
        return {
          itemId: m.content.itemId,
          questions: m.content.questions,
        };
      }
    }
    return null;
  }, [sessionMessages]);

  // Pending permission requests also take over the composer slot. Same
  // motivation as AskUserQuestion: the user's eyes are already on the
  // composer, so put the decision there. Permissions outrank questions
  // because the agent is already mid-tool-call.
  const requestsById = usePermissionsStore((s) => s.requestsById);
  const hydratePermissions = usePermissionsStore((s) => s.hydrate);
  const pendingPermissions = useMemo(() => {
    const out: PermissionRequest[] = [];
    for (const req of Object.values(requestsById)) {
      if (req.sessionId !== sessionId) continue;
      // ExitPlanMode is approved on the plan card itself.
      if (req.kind._tag === "Other" && req.kind.tool === "ExitPlanMode") {
        continue;
      }
      out.push(req);
    }
    out.sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
    return out;
  }, [requestsById, sessionId]);
  useEffect(() => {
    void hydratePermissions(sessionId);
  }, [sessionId, hydratePermissions]);
  // Reconcile permission requests whenever the running flag transitions
  // true → false. A turn that ended (or aborted) sometimes leaves a stale
  // pending-permission row in the client cache — the row's UI then takes
  // over the composer slot and looks like the input is disabled. Re-asking
  // the server clears anything it already resolved.
  useEffect(() => {
    if (inFlight) return;
    void hydratePermissions(sessionId);
  }, [inFlight, sessionId, hydratePermissions]);
  const headPermission = pendingPermissions[0];

  const [hasText, setHasText] = useState(false);
  const [trigger, setTrigger] = useState<ActiveTrigger | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const uploadOne = useAttachmentsStore((s) => s.uploadOne);
  const forgetActive = useAttachmentsStore((s) => s.forgetActive);
  // Submit reads through a ref so the keymap, captured at editor creation
  // time, always sees the current sessionId / send / inFlight without
  // recreating the editor on every render.
  const submitRef = useRef<() => boolean>(() => false);
  // Same indirection for file drops — the editor extension is bound once
  // and we want it to call the latest closure with the current sessionId.
  const filesDroppedRef = useRef<(files: ReadonlyArray<File>) => void>(
    () => undefined,
  );
  // Same pattern for the Shift+Tab plan-mode toggle. Latest session +
  // mode without reconstructing the editor on every state change.
  const togglePlanModeRef = useRef<() => void>(() => undefined);

  const setModel = useSessionsStore((s) => s.setModel);
  const setRuntimeMode = useSessionsStore((s) => s.setRuntimeMode);
  const setPermissionMode = useSessionsStore((s) => s.setPermissionMode);
  const setRightSidebarOpen = useUiStore((s) => s.setRightSidebarOpen);
  const setActiveRightTab = useUiStore((s) => s.setActiveRightTab);
  const setView = useUiStore((s) => s.setView);
  const setSettingsSection = useUiStore((s) => s.setSettingsSection);

  const canSend = hasText;

  // Mount the CodeMirror view once per ChatComposer instance. Switching
  // sessions remounts the component (`session.id` is the chat-view key),
  // so we don't have to swap docs in-place here.
  useEffect(() => {
    const host = editorHostRef.current;
    if (host === null) return;

    const callbacks = {
      onSubmit: () => submitRef.current(),
      onChange: (doc: string) => setHasText(doc.trim().length > 0),
      onTrigger: (t: ActiveTrigger | null) => setTrigger(t),
      onFilesDropped: (files: ReadonlyArray<File>) =>
        filesDroppedRef.current(files),
      onTogglePlanMode: () => togglePlanModeRef.current(),
    };
    const view = createComposerView({
      parent: host,
      placeholderText:
        "Ask to make changes at the @ mentioned files or run slash commands, shift enter for next line.",
      callbacks,
    });
    editorViewRef.current = view;
    view.focus();

    // Live-reconfigure the composer keymap when the user edits keybindings.
    // The compartment swap is a single CodeMirror transaction, so the
    // cursor / selection / pending text are preserved.
    const unsubKeybindings = useKeybindingsStore.subscribe(() => {
      reconfigureComposerKeymap(view, callbacks);
    });

    // Register imperative entrypoints on the composer bridge so the file tree
    // (and the top-bar workflow buttons) can drop chips / text into this view
    // without prop-drilling the EditorView ref.
    const bridge = useComposerBridge.getState();
    bridge.setAttachFile((ref) => {
      const v = editorViewRef.current;
      if (v === null) return;
      const sel = v.state.selection.main;
      const token = `@${ref.relPath}`;
      replaceWithChip(v, sel.head, sel.head, token, {
        kind: "file",
        relPath: ref.relPath,
        absPath: ref.absPath,
        entryKind: ref.kind,
      });
    });
    bridge.setInsertText((text) => {
      const v = editorViewRef.current;
      if (v === null) return;
      const sel = v.state.selection.main;
      const insert = text + " ";
      v.dispatch({
        changes: { from: sel.head, to: sel.head, insert },
        selection: { anchor: sel.head + insert.length },
      });
      v.focus();
    });
    bridge.setFocus(() => {
      editorViewRef.current?.focus();
    });

    return () => {
      unsubKeybindings();
      const b = useComposerBridge.getState();
      b.setAttachFile(null);
      b.setInsertText(null);
      b.setFocus(null);
      view.destroy();
      editorViewRef.current = null;
    };
  }, []);

  // Picker-triggered session changes (model / provider) can shift the
  // composer's surrounding layout — chip icon swap, CliUpgradeBanner
  // appearing or disappearing for the new provider, etc. CodeMirror's
  // internal measurement occasionally lags those shifts, leaving the
  // contentDOM mis-sized so typed keystrokes land in state but aren't
  // painted until the editor is forced to re-measure. Forcing it here
  // also returns focus to the editor after the Menu closes, so the user
  // can type immediately without re-clicking into the composer.
  useEffect(() => {
    const view = editorViewRef.current;
    if (view === null) return;
    view.requestMeasure();
    view.focus();
  }, [session.providerId, session.model]);

  const clearComposer = (view: EditorView): void => {
    setComposerDoc(view, "");
    view.dispatch({ effects: clearChipsEffect.of() });
    setHasText(false);
    setTrigger(null);
  };

  const dispatchBuiltin = (parsed: {
    command: BuiltinCommand;
    args: string;
  }): void => {
    switch (parsed.command.name) {
      case "clear":
        // Editor is already cleared by the caller; nothing else to do.
        break;
      case "model":
        if (parsed.args) void setModel(sessionId, parsed.args);
        break;
      case "mode":
        if (
          parsed.args === "approval-required" ||
          parsed.args === "auto-accept-edits" ||
          parsed.args === "full-access"
        ) {
          void setRuntimeMode(sessionId, parsed.args);
        }
        break;
      case "plan":
        void setPermissionMode(sessionId, "plan");
        break;
      case "run":
        void setPermissionMode(sessionId, "default");
        break;
      case "diff":
        setRightSidebarOpen(true);
        setActiveRightTab("changes");
        break;
      case "copy": {
        const latest = [...(sessionMessages ?? [])].reverse().find((m) =>
          m.content._tag === "assistant" || m.content._tag === "thinking"
        );
        const text =
          latest?.content._tag === "assistant" ||
          latest?.content._tag === "thinking"
            ? latest.content.text
            : "";
        if (text.length > 0) void navigator.clipboard?.writeText(text);
        break;
      }
      case "theme":
      case "statusline":
      case "title":
        setView("settings");
        setSettingsSection({ kind: "general" });
        break;
      case "new":
      case "help":
        // `/new` and `/help` are wired in a follow-up — for 0.03 we accept
        // them silently rather than show an error toast that doesn't yet
        // have a destination.
        break;
    }
  };

  /**
   * Insert chips for `files`. Image files render with a thumbnail; other types
   * (PDFs, docs, archives) get a generic file-icon chip. The chip's underlying
   * token swaps from a temp id to a `memoize://attachments/<id>` URL once the
   * upload resolves. Files beyond the per-turn cap are dropped with a warning.
   */
  const attachFiles = (files: readonly File[]): void => {
    const view = editorViewRef.current;
    if (view === null || files.length === 0) return;

    const accepted = files.slice(0, MAX_ATTACHMENTS_PER_TURN);
    if (files.length > MAX_ATTACHMENTS_PER_TURN) {
      console.warn(
        `Maximum ${MAX_ATTACHMENTS_PER_TURN} attachments per turn — ${
          files.length - MAX_ATTACHMENTS_PER_TURN
        } file(s) dropped`,
      );
    }

    for (const file of accepted) {
      const tempId = `pending-${Math.random().toString(36).slice(2, 10)}`;
      const isImage = file.type.startsWith("image/");
      const blobUrl = isImage ? URL.createObjectURL(file) : "";
      const token = `[image:${tempId}]`;
      const sel = view.state.selection.main;
      const insertText = token + " ";
      const chipFrom = sel.from;
      const chipTo = sel.from + token.length;

      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: insertText },
        selection: { anchor: sel.from + insertText.length },
        effects: addChipEffect.of({
          from: chipFrom,
          to: chipTo,
          meta: {
            kind: "image",
            id: tempId,
            mimeType: file.type || "application/octet-stream",
            originalName: file.name,
            previewUrl: blobUrl,
          },
        }),
      });

      void uploadOne(sessionId, file)
        .then((ref) => {
          const finalUrl = isImage ? `memoize://attachments/${ref.id}` : "";
          editorViewRef.current?.dispatch({
            effects: updateImageChipEffect.of({
              previousId: tempId,
              meta: {
                kind: "image",
                id: ref.id,
                mimeType: ref.mimeType,
                originalName: ref.originalName,
                previewUrl: finalUrl,
              },
            }),
          });
        })
        .catch((err) => {
          console.error("[chat-composer] upload failed", err);
        })
        .finally(() => {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
        });
    }
  };

  // Paperclip → hidden file input.
  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files === null) return;
    attachFiles(Array.from(files));
    e.target.value = "";
  };

  // Paste handler — accepts any file type pasted into the composer (images,
  // PDFs, docs, etc.).
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      attachFiles(files);
    }
  };

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("Files")) {
      // Both calls are required: preventDefault marks the element as a
      // valid drop target, dropEffect tells the OS what cursor to show.
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDragLeave = () => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) attachFiles(files);
  };

  // Forget any stale tempId-keyed attachments when the composer unmounts —
  // the heartbeat tracks ids, so dropping unattached blobs is enough to
  // let the GC reap them.
  useEffect(
    () => () => {
      // No-op for now: forgetActive is called per-id only when a chip is
      // dropped explicitly. Server GC handles long-lived orphans.
      void forgetActive;
    },
    [forgetActive],
  );

  const submit = (): boolean => {
    // Don't submit while a popover is open — Enter belongs to the popover.
    if (trigger !== null) return false;

    const view = editorViewRef.current;
    if (view === null) return false;
    const docText = composerDoc(view).trim();
    if (docText.length === 0) return false;

    const builtin = matchBuiltin(docText, session.providerId);
    if (builtin !== null) {
      clearComposer(view);
      dispatchBuiltin(builtin);
      return true;
    }

    const input = parseComposerInput(view.state, session.providerId);
    clearComposer(view);
    if (inFlight) {
      // Mid-turn submit becomes a queue chip; auto-flushed when the turn
      // ends or steered manually.
      queue(sessionId, input);
    } else {
      void send(sessionId, input);
    }
    return true;
  };

  // Keep the keymap-bound submit pointing at the latest closure so it sees
  // the current sessionId after a session switch / re-render.
  submitRef.current = submit;
  togglePlanModeRef.current = () => {
    void setPermissionMode(
      sessionId,
      session.permissionMode === "plan" ? "default" : "plan",
    );
  };
  filesDroppedRef.current = (files) => {
    // CM's drop handler stops propagation so our React onDrop never fires —
    // clear the drag overlay state here instead.
    dragDepthRef.current = 0;
    setIsDragging(false);
    attachFiles(files);
  };

  const inPlanMode = session.permissionMode === "plan";
  // Keep the editor mounted at all times. Permissions / questions render as
  // a sibling above it, and we hide the editor block with `display: none`
  // while a card is up. Unmounting the editor branch detaches the CodeMirror
  // view from the DOM, and the view-creation `useEffect` (empty deps) never
  // re-runs to re-attach it — so the host reappears blank: no placeholder,
  // cursor won't land. Staying mounted also preserves any in-progress draft
  // when a permission prompt interrupts mid-typing.
  const showCard = headPermission !== undefined || pendingQuestion !== null;

  return (
    <TooltipProvider delay={0}>
      {showCard ? (
        <div className="shrink-0 px-3 pb-3 pt-2">
          <div className="mx-auto">
            {headPermission !== undefined ? (
              <PermissionCard
                head={headPermission}
                queueSize={pendingPermissions.length}
              />
            ) : pendingQuestion !== null ? (
              <QuestionCard
                sessionId={sessionId}
                itemId={pendingQuestion.itemId}
                questions={pendingQuestion.questions}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        className="shrink-0 px-3 pb-3 pt-2"
        style={showCard ? { display: "none" } : undefined}
        aria-hidden={showCard || undefined}
      >
        <div className="mx-auto">
          <Frame>
            <Card
              className={cn(
                "rounded-xl min-h-30 transition-colors",
                inPlanMode
                  ? "border-2 border-dashed border-rose-300/60 dark:border-rose-300/40"
                  : "border-border/50",
              )}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onPaste={onPaste}
            >
              {isDragging && (
                <div className="pointer-events-none absolute inset-1 z-40 flex items-center justify-center rounded-lg border border-dashed border-accent-foreground/40 bg-popover/80 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Upload className="size-3.5" />
                    <span>Drop files to attach</span>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={onPickFiles}
              />
              <QueueTray sessionId={sessionId} />
              <CardPanel className="relative flex items-stretch gap-2 px-3 py-2">
                {trigger !== null && editorViewRef.current !== null ? (
                  trigger.kind === "slash" ? (
                    <SlashCommandPopover
                      trigger={trigger}
                      view={editorViewRef.current}
                      sessionId={sessionId}
                      providerId={session.providerId}
                      onClose={() => setTrigger(null)}
                    />
                  ) : (
                    <FileTagPopover
                      trigger={trigger}
                      view={editorViewRef.current}
                      projectId={session.projectId}
                      worktreeId={session.worktreeId}
                      onClose={() => setTrigger(null)}
                    />
                  )
                ) : null}
                <div
                  ref={editorHostRef}
                  className="flex-1 overflow-y-auto bg-transparent text-sm leading-relaxed outline-none"
                  style={{
                    minHeight: MIN_HEIGHT,
                    maxHeight: MAX_HEIGHT,
                  }}
                  onClick={() => editorViewRef.current?.focus()}
                />
                <FileChipHover
                  hostRef={editorHostRef}
                  projectId={session.projectId}
                />
              </CardPanel>
            </Card>
            {/* Single action row: model + reasoning sit on the left, send /
                runtime / timer sit on the right — so the user's eye lands on
                the same line for "what model is this" and "send." Sub-agent
                config moved to settings; it doesn't belong in the per-turn
                strip. */}
            <FrameFooter className="flex items-center justify-between gap-2 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="Attach files"
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      >
                        <Paperclip className="size-3.5" />
                      </button>
                    }
                  />
                  <TooltipPopup>
                    Attach files (paste / drop also work)
                  </TooltipPopup>
                </Tooltip>
                <ModelPicker
                  sessionId={sessionId}
                  chatId={session.chatId}
                  runtimeMode={session.runtimeMode}
                  providerId={session.providerId}
                  currentModel={session.model}
                />
                <ReasoningPicker
                  sessionId={sessionId}
                  providerId={session.providerId}
                  model={session.model}
                />
                {(findModelDescriptor(session.providerId, session.model)
                  ?.supportsPlanMode ?? true) && (
                  <PlanModeToggle
                    sessionId={sessionId}
                    current={session.permissionMode}
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <RuntimeModeToggle
                  sessionId={sessionId}
                  current={session.runtimeMode}
                />
                <SessionTimer sessionId={sessionId} inFlight={inFlight} />
                {inFlight ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={() => void interrupt(sessionId)}
                          aria-label="Interrupt"
                        >
                          <Square className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipPopup>Interrupt the running turn</TooltipPopup>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="default"
                          size="icon-sm"
                          onClick={() => void submit()}
                          disabled={!canSend}
                          aria-label="Send"
                        >
                          <Send className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipPopup>Send (Enter)</TooltipPopup>
                  </Tooltip>
                )}
              </div>
            </FrameFooter>
            <div className="flex items-center justify-between gap-2 border-t border-border/40 px-2 py-1 text-[11px] text-muted-foreground">
              <WorkspacePicker session={session} />
              <WorkspaceBranchLabel session={session} />
            </div>
          </Frame>
        </div>
      </div>
    </TooltipProvider>
  );
}

/**
 * Per-session permission posture, picked from a menu so each option can carry
 * a description. The mode is stored on the session row and read live by the
 * SDK's canUseTool callback — flipping it mid-turn applies to the next tool
 * call without restarting the conversation.
 */
function RuntimeModeToggle({
  sessionId,
  current,
}: {
  sessionId: SessionId;
  current: RuntimeMode;
}) {
  const setRuntimeMode = useSessionsStore((s) => s.setRuntimeMode);
  const meta = MODE_META[current];
  const TriggerIcon = meta.Icon;

  const onSelect = (mode: RuntimeMode) => {
    if (mode !== current) void setRuntimeMode(sessionId, mode);
  };

  return (
    <Menu>
      <MenuTrigger
        className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground shadow-xs/5 transition-colors hover:bg-muted/60 data-[popup-open]:bg-muted/60"
        aria-label={`Permissions: ${meta.label}`}
      >
        <TriggerIcon className="size-3.5" />
        <span>{meta.label}</span>
        <ChevronDown className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup side="top" align="end" className="w-72 p-1">
        {MODES_ORDER.map((mode) => {
          const m = MODE_META[mode];
          const ItemIcon = m.Icon;
          const active = mode === current;
          return (
            <MenuItem
              key={mode}
              onClick={() => onSelect(mode)}
              className={cn(
                "grid grid-cols-[1rem_auto_1fr] items-start gap-x-2.5 rounded-md px-2 py-2 text-sm",
                active
                  ? "bg-accent/40 text-accent-foreground data-highlighted:bg-accent/60"
                  : undefined,
              )}
            >
              <span className="col-start-1 row-start-1 flex h-5 items-center justify-center">
                {active && <Check className="size-3.5 opacity-90" />}
              </span>
              <ItemIcon className="col-start-2 row-start-1 mt-0.5 size-4 shrink-0" />
              <div className="col-start-3 row-start-1 flex flex-col gap-0.5">
                <span className="font-medium leading-none">{m.label}</span>
                <span className="text-xs text-muted-foreground leading-snug">
                  {m.description}
                </span>
              </div>
            </MenuItem>
          );
        })}
      </MenuPopup>
    </Menu>
  );
}

/**
 * Binary plan-mode toggle. Off → just the map icon (tooltip explains).
 * On → map icon + "Plan" label with a peach accent so it pops next to
 * the other small chips. `Shift+Tab` from the composer flips the same
 * toggle. The runtime-mode (Supervised / Auto-accept / Full access)
 * chip on the right cluster is independent — plan mode is its own axis.
 */
function PlanModeToggle({
  sessionId,
  current,
}: {
  sessionId: SessionId;
  current: PermissionMode;
}) {
  const setPermissionMode = useSessionsStore((s) => s.setPermissionMode);
  const isPlan = current === "plan";

  // Toggle is binary: pressing flips between `default` and `plan`. The
  // wider mode space (`acceptEdits`) lives on the runtime-mode chip — a
  // user wanting auto-accept-edits goes there, not here.
  const onClick = () => {
    void setPermissionMode(sessionId, isPlan ? "default" : "plan");
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            aria-label={isPlan ? "Exit plan mode" : "Enter plan mode"}
            aria-pressed={isPlan}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors",
              isPlan
                ? "bg-rose-300/15 text-rose-200 dark:text-rose-200 hover:bg-rose-300/25"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Map className="size-3.5" />
            {isPlan ? <span>Plan</span> : null}
          </button>
        }
      />
      <TooltipPopup>
        {isPlan ? "Exit plan mode" : "Enter plan mode"}
        <span className="ml-2 opacity-60">⇧Tab</span>
      </TooltipPopup>
    </Tooltip>
  );
}

const PROVIDER_LABEL: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  grok: "Grok",
  cursor: "Cursor",
  gemini: "Gemini",
  opencode: "OpenCode",
};

interface ModelPickerEntry {
  providerId: ProviderId;
  modelId: string;
  label: string;
}

type Scope = ProviderId | "all";

function ModelPicker({
  sessionId,
  chatId,
  runtimeMode,
  providerId,
  currentModel,
}: {
  sessionId: SessionId;
  chatId: ChatId;
  runtimeMode: RuntimeMode;
  providerId: ProviderId;
  currentModel: string;
}) {
  const setModel = useSessionsStore((s) => s.setModel);
  const setProvider = useSessionsStore((s) => s.setProvider);
  const createSession = useSessionsStore((s) => s.create);
  const providerEnabled = useSettingsStore((s) => s.providerEnabled);
  const availability = useProvidersStore((s) => s.availability);
  const opencodeInventory = useOpencodeInventory((s) => s.inventory);
  const ensureOpencodeInventory = useOpencodeInventory(
    (s) => s.ensureLoaded,
  );
  const userMessageCount = useMessagesStore((s) => {
    const list = s.messagesBySession[sessionId] ?? [];
    let count = 0;
    for (const m of list) {
      if (m.role === "user") count += 1;
    }
    return count;
  });
  // Mid-chat (`!isFresh`), cross-provider picks spawn a new session inside
  // the same chat rather than swapping the active one in place — the CLI
  // for a new provider can't read the prior CLI's transcript.
  const isFresh = userMessageCount === 0;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [events, setEvents] = useState<ModelPickerEvent[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<ProviderId | null>(
    providerId,
  );
  const popupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void ensureOpencodeInventory();
  }, [ensureOpencodeInventory]);

  // Reset transient state every time the popover opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setEvents(readModelPickerEvents());
      setScope("all");
      setExpandedGroup(providerId);
    }
  }, [open, providerId]);

  // For opencode: prefer the live `provider.list()` snapshot over the static
  // seed. Other providers always use the static `MODELS_BY_PROVIDER` table.
  const modelsForProvider = useCallback(
    (pid: ProviderId): ReadonlyArray<{ id: string; label: string }> => {
      if (pid !== "opencode" || opencodeInventory === null) {
        return MODELS_BY_PROVIDER[pid] ?? [];
      }
      return opencodeInventory.providers.flatMap((p) =>
        p.models.map((m) => ({ id: m.id, label: m.label })),
      );
    },
    [opencodeInventory],
  );

  // A provider is pickable when: user hasn't toggled it off in Settings AND
  // the server-side health probe didn't return `error` (e.g. CLI missing).
  // The current session's provider is always included so the user can see
  // their selection even if its toggle just got flipped.
  const availabilityById = useMemo(() => {
    const m = new globalThis.Map<ProviderId, AgentAvailability>();
    for (const a of availability) m.set(a.providerId, a);
    return m;
  }, [availability]);
  const pickableProviders = useMemo<ReadonlyArray<ProviderId>>(() => {
    return (Object.keys(MODELS_BY_PROVIDER) as ReadonlyArray<ProviderId>).filter(
      (pid) => {
        if (pid === providerId) return true;
        if (pid === "cursor") return false;
        if (providerEnabled[pid] === false) return false;
        const a = availabilityById.get(pid);
        if (a !== undefined && a.status === "error") return false;
        return true;
      },
    );
  }, [providerId, providerEnabled, availabilityById]);

  const allModels = useMemo<ModelPickerEntry[]>(() => {
    const out: ModelPickerEntry[] = [];
    for (const pid of pickableProviders) {
      for (const m of modelsForProvider(pid)) {
        out.push({ providerId: pid, modelId: m.id, label: m.label });
      }
    }
    return out;
  }, [pickableProviders, modelsForProvider]);

  const countByProvider = useMemo(() => {
    const map = new globalThis.Map<ProviderId, number>();
    for (const m of allModels) {
      map.set(m.providerId, (map.get(m.providerId) ?? 0) + 1);
    }
    return map;
  }, [allModels]);
  const totalCount = allModels.length;

  // Filtered by chip scope + search query. Used by the flat-list states
  // (scoped chip, or any search). The accordion path doesn't read this.
  const flatMatches = useMemo<ModelPickerEntry[]>(() => {
    const q = query.trim().toLowerCase();
    return allModels.filter((m) => {
      if (scope !== "all" && m.providerId !== scope) return false;
      if (q === "") return true;
      return (
        m.label.toLowerCase().includes(q) ||
        m.modelId.toLowerCase().includes(q)
      );
    });
  }, [allModels, scope, query]);

  // Top recents in the 30-day window, scoped by the active chip.
  const scopedRecents = useMemo<
    Array<ModelPickerEntry & { count: number }>
  >(() => {
    const top: ModelPickerRecent[] = topRecents(events, scope, 4);
    const out: Array<ModelPickerEntry & { count: number }> = [];
    for (const r of top) {
      const match = allModels.find(
        (m) => m.providerId === r.providerId && m.modelId === r.modelId,
      );
      if (match === undefined) continue;
      out.push({ ...match, count: r.count });
    }
    return out;
  }, [events, scope, allModels]);

  // Accordion view = scope === "all" && no query. Current provider expanded
  // by default; other providers collapsed until clicked.
  const accordionGroups = useMemo(() => {
    if (scope !== "all" || query.trim() !== "") return [];
    const order: ProviderId[] = [
      providerId,
      ...pickableProviders.filter((p) => p !== providerId),
    ];
    return order
      .map((pid) => ({
        providerId: pid,
        models: allModels.filter((m) => m.providerId === pid),
      }))
      .filter((g) => g.models.length > 0);
  }, [scope, query, allModels, pickableProviders, providerId]);

  const handlePick = (pid: ProviderId, modelId: string) => {
    const isCross = pid !== providerId;
    if (isCross && !isFresh) {
      // Mid-chat provider switch → new session inside the same chat. The
      // new tab inherits the current session's runtime mode for continuity.
      void createSession(chatId, pid, modelId, { runtimeMode });
    } else if (isCross) {
      void setProvider(sessionId, pid, modelId);
    } else if (modelId !== currentModel) {
      void setModel(sessionId, modelId);
    }
    pushModelPickerEvent({ providerId: pid, modelId });
    setOpen(false);
  };

  const currentLabel =
    modelsForProvider(providerId).find((m) => m.id === currentModel)?.label ??
    currentModel;

  const showEmpty =
    flatMatches.length === 0 &&
    scopedRecents.length === 0 &&
    accordionGroups.length === 0;

  const inAccordionView = scope === "all" && query.trim() === "";

  // Build the ordered list of "shortcut-able" entries — recents first, then
  // the current view's primary list (flat matches when scoped/searching;
  // models inside the currently expanded accordion group otherwise). The
  // first 9 of these get visible 1–9 labels and ⌘1–9 keyboard shortcuts.
  const shortcutTargets = useMemo<ModelPickerEntry[]>(() => {
    const out: ModelPickerEntry[] = [];
    for (const r of scopedRecents) {
      out.push({
        providerId: r.providerId,
        modelId: r.modelId,
        label: r.label,
      });
    }
    if (inAccordionView) {
      const group = accordionGroups.find(
        (g) => g.providerId === expandedGroup,
      );
      if (group !== undefined) out.push(...group.models);
    } else {
      out.push(...flatMatches);
    }
    return out;
  }, [
    scopedRecents,
    inAccordionView,
    accordionGroups,
    expandedGroup,
    flatMatches,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey || e.shiftKey) return;
      if (e.key < "1" || e.key > "9") return;
      const idx = Number(e.key) - 1;
      const target = shortcutTargets[idx];
      if (target === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      handlePick(target.providerId, target.modelId);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, shortcutTargets, handlePick]);

  // Index of the row's shortcut digit (or null when out of range). Recents
  // are slots 1..N, then the in-view list continues from N+1.
  const shortcutFor = (pid: ProviderId, modelId: string): number | null => {
    const i = shortcutTargets.findIndex(
      (t) => t.providerId === pid && t.modelId === modelId,
    );
    if (i < 0 || i >= 9) return null;
    return i + 1;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-foreground hover:bg-muted/60 data-[popup-open]:bg-muted/60"
        aria-label="Change model"
        title="Change model — applies to next message"
      >
        <ProviderIcon providerId={providerId} className="size-3" />
        <span>{currentLabel}</span>
        <ChevronDown className="size-3 opacity-60" />
      </PopoverTrigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          align="start"
          side="top"
          sideOffset={6}
          className="z-50"
        >
          <PopoverPrimitive.Popup
            ref={popupRef}
            className="flex max-h-[480px] w-[320px] flex-col overflow-hidden rounded-2xl border bg-popover/85 text-popover-foreground shadow-lg/10 outline-none backdrop-blur-md backdrop-saturate-150 transition-[scale,opacity] data-starting-style:scale-98 data-starting-style:opacity-0"
          >
            <div className="flex flex-col gap-1.5 p-2.5">
              <SearchField
                value={query}
                onChange={setQuery}
                totalCount={totalCount}
                scope={scope}
              />
              <div className="flex flex-wrap gap-1 px-0.5 pt-1">
                <ChipButton
                  active={scope === "all"}
                  onClick={() => setScope("all")}
                >
                  <span>all</span>
                  <ChipCount>{totalCount}</ChipCount>
                </ChipButton>
                {pickableProviders.map((pid) => {
                  const live = pid === "opencode" && opencodeInventory !== null;
                  return (
                    <ChipButton
                      key={pid}
                      active={scope === pid}
                      onClick={() => setScope(pid)}
                    >
                      <span>{PROVIDER_CHIP_LABEL[pid]}</span>
                      <ChipCount>{countByProvider.get(pid) ?? 0}</ChipCount>
                      {live && (
                        <span
                          className="size-1.5 rounded-full bg-primary"
                          title="Live from local daemon"
                        />
                      )}
                    </ChipButton>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {showEmpty && (
                <div className="px-3 py-6 text-center text-muted-foreground text-xs">
                  No models match.
                </div>
              )}

              {scopedRecents.length > 0 && (
                <>
                  <SectionLabel
                    title={
                      scope === "all"
                        ? "recents"
                        : `recents in ${PROVIDER_CHIP_LABEL[scope]}`
                    }
                    meta="last 30 days"
                  />
                  {scopedRecents.map((m) => (
                    <ModelRow
                      key={`recent-${m.providerId}-${m.modelId}`}
                      entry={m}
                      currentProviderId={providerId}
                      currentModelId={currentModel}
                      isFresh={isFresh}
                      onSelect={handlePick}
                      countSuffix={`${m.count}×`}
                      showNowBadge
                      shortcut={shortcutFor(m.providerId, m.modelId)}
                    />
                  ))}
                </>
              )}

              {inAccordionView ? (
                <>
                  <SectionLabel title={`all ${totalCount} by provider`} />
                  {accordionGroups.map((g) => {
                    const expanded = expandedGroup === g.providerId;
                    return (
                      <div key={g.providerId}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedGroup(expanded ? null : g.providerId)
                          }
                          aria-expanded={expanded}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                        >
                          <span className="flex size-3 items-center justify-center text-muted-foreground">
                            {expanded ? (
                              <ChevronDown className="size-3" />
                            ) : (
                              <ChevronRight className="size-3" />
                            )}
                          </span>
                          <ProviderIcon
                            providerId={g.providerId}
                            className="size-3.5"
                          />
                          <span className="flex-1 font-medium">
                            {PROVIDER_LABEL[g.providerId]}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {g.models.length}
                          </span>
                        </button>
                        {expanded && (
                          <div className="ml-3 border-l border-border/60 pl-2">
                            {g.models.map((m) => (
                              <ModelRow
                                key={`${m.providerId}-${m.modelId}`}
                                entry={m}
                                currentProviderId={providerId}
                                currentModelId={currentModel}
                                isFresh={isFresh}
                                onSelect={handlePick}
                                dense
                                shortcut={shortcutFor(m.providerId, m.modelId)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              ) : (
                flatMatches.length > 0 && (
                  <>
                    <SectionLabel
                      title={
                        scope === "all"
                          ? `${flatMatches.length} match${flatMatches.length === 1 ? "" : "es"}`
                          : `all ${flatMatches.length} models`
                      }
                    />
                    {flatMatches.map((m) => (
                      <ModelRow
                        key={`${m.providerId}-${m.modelId}`}
                        entry={m}
                        currentProviderId={providerId}
                        currentModelId={currentModel}
                        isFresh={isFresh}
                        onSelect={handlePick}
                        shortcut={shortcutFor(m.providerId, m.modelId)}
                      />
                    ))}
                  </>
                )
              )}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </Popover>
  );
}

const PROVIDER_CHIP_LABEL: Record<ProviderId, string> = {
  claude: "claude",
  codex: "codex",
  grok: "grok",
  cursor: "cursor",
  gemini: "gemini",
  opencode: "oc",
};

function SearchField({
  value,
  onChange,
  totalCount,
  scope,
}: {
  value: string;
  onChange: (next: string) => void;
  totalCount: number;
  scope: Scope;
}) {
  const placeholder =
    scope === "all"
      ? `filter ${totalCount} models…`
      : `in ${PROVIDER_CHIP_LABEL[scope]}…`;
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 focus-within:border-foreground/60 focus-within:ring-2 focus-within:ring-primary/30">
      <SearchIcon className="size-3.5 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // biome-ignore lint/a11y/noAutofocus: popover trigger
        autoFocus
        className="flex-1 bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground/70"
      />
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-muted/60",
      )}
    >
      {children}
    </button>
  );
}

function ChipCount({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] opacity-60 tabular-nums">{children}</span>
  );
}

function SectionLabel({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between px-2 pt-3 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
      <span>{title}</span>
      {meta !== undefined && (
        <span className="text-[9px] text-muted-foreground/70 normal-case tracking-normal">
          {meta}
        </span>
      )}
    </div>
  );
}

function ModelRow({
  entry,
  currentProviderId,
  currentModelId,
  isFresh,
  onSelect,
  dense = false,
  countSuffix,
  showNowBadge = false,
  shortcut,
}: {
  entry: ModelPickerEntry;
  currentProviderId: ProviderId;
  currentModelId: string;
  isFresh: boolean;
  onSelect: (providerId: ProviderId, modelId: string) => void;
  dense?: boolean;
  countSuffix?: string;
  showNowBadge?: boolean;
  shortcut?: number | null;
}) {
  const isActive =
    entry.providerId === currentProviderId && entry.modelId === currentModelId;
  const isCross = entry.providerId !== currentProviderId;
  // Mid-chat, picking a cross-provider row creates a new session inside the
  // current chat — surface that with the ↗ icon + tooltip.
  const opensNewTab = isCross && !isFresh;
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.providerId, entry.modelId)}
      aria-current={isActive || undefined}
      title={opensNewTab ? "Open in new tab" : undefined}
      className={cn(
        "group relative flex w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
        dense ? "py-1" : "py-1.5",
        isActive
          ? "bg-primary/12 text-foreground"
          : "text-foreground hover:bg-muted/60",
      )}
    >
      {isActive && (
        <span className="-translate-y-1/2 absolute top-1/2 left-0 h-4 w-0.5 rounded-full bg-primary" />
      )}
      {!dense && (
        <ProviderIcon
          providerId={entry.providerId}
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      )}
      <span className="flex-1 truncate">{entry.label}</span>
      {opensNewTab && (
        <ArrowUpRight
          className="size-3 text-muted-foreground/70"
          aria-label="Open in new tab"
        />
      )}
      {countSuffix !== undefined && (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {countSuffix}
        </span>
      )}
      {showNowBadge && isActive && (
        <span className="rounded bg-primary px-1.5 py-px font-medium text-[9px] text-primary-foreground uppercase tracking-wider">
          now
        </span>
      )}
      {shortcut !== undefined && shortcut !== null && (
        <kbd className="ml-0.5 rounded bg-muted/70 px-1 py-px font-medium text-[10px] text-muted-foreground tabular-nums">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

/**
 * Reasoning / variant selector. For non-opencode providers this reads
 * the static `reasoning` SelectOptionDescriptor from `MODELS_BY_PROVIDER`.
 * For opencode, the per-model variant list comes from the live inventory
 * (`useOpencodeInventory`) so models like `anthropic/claude-sonnet-4-5`
 * show their actual variants (`high`/`medium`/…) and models without
 * variants render nothing.
 *
 * Selection persists per-session; the messages store reads it back at
 * send time and forwards it as `modelOptions.reasoning` — which the
 * opencode driver in turn translates into the prompt body's `model.variant`.
 */
function ReasoningPicker({
  sessionId,
  providerId,
  model,
}: {
  sessionId: SessionId;
  providerId: ProviderId;
  model: string;
}) {
  const opencodeInventory = useOpencodeInventory((s) => s.inventory);

  // For opencode, the variant list is per-model and lives on the live
  // inventory (`provider.list()` → `model.variants`). For other providers
  // it's the static reasoning descriptor curated in `MODELS_BY_PROVIDER`.
  const resolved = useMemo((): {
    label: string;
    options: ReadonlyArray<{ id: string; label: string }>;
    defaultId: string;
  } | null => {
    if (providerId === "opencode") {
      if (opencodeInventory === null) return null;
      for (const p of opencodeInventory.providers) {
        const m = p.models.find((mm) => mm.id === model);
        if (m === undefined) continue;
        if (m.variants.length === 0) return null;
        return {
          label: "Reasoning",
          options: m.variants.map((v) => ({ id: v, label: v })),
          defaultId: m.variants.includes("medium")
            ? "medium"
            : m.variants.includes("high")
              ? "high"
              : m.variants[0]!,
        };
      }
      return null;
    }
    const descriptor = findModelDescriptor(providerId, model);
    const reasoningDescriptor = descriptor?.optionDescriptors?.find(
      (d): d is SelectOptionDescriptor =>
        d.kind === "select" && d.id === "reasoning",
    );
    if (reasoningDescriptor === undefined) return null;
    return {
      label: reasoningDescriptor.label,
      options: reasoningDescriptor.options,
      defaultId: reasoningDescriptor.defaultId ?? "medium",
    };
  }, [providerId, model, opencodeInventory]);

  const defaultId = resolved?.defaultId ?? "medium";
  const storageKey = `memoize.reasoning.${sessionId}`;
  const [level, setLevel] = useState<string>(() => {
    if (typeof window === "undefined") return defaultId;
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored !== null) return stored;
    return defaultId;
  });

  if (resolved === null) return null;

  const options = resolved.options;

  const onChange = (next: string) => {
    if (!options.some((o) => o.id === next)) return;
    setLevel(next);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(storageKey, next);
    }
  };

  const activeLabel = options.find((o) => o.id === level)?.label ?? level;

  return (
    <Menu>
      <MenuTrigger
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-foreground hover:bg-muted/60 data-[popup-open]:bg-muted/60"
        aria-label={resolved.label}
        title={`${resolved.label} for the next message`}
      >
        <Gauge className="size-3" />
        <span>{activeLabel}</span>
        <ChevronDown className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup side="top" align="start" className="w-44">
        <MenuGroup>
          <MenuGroupLabel>{resolved.label}</MenuGroupLabel>
          <MenuRadioGroup value={level} onValueChange={onChange}>
            {options.map((o) => (
              <MenuRadioItem key={o.id} value={o.id}>
                {o.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

const formatCoarse = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  const mins = min - hours * 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
};

/**
 * Sum of every turn's duration in this session — start = user message,
 * end = last message of that turn (or `now` for the in-flight turn). Idle
 * gaps between a finished assistant reply and the next user prompt are
 * NOT counted, so an old session that's been sitting open doesn't claim
 * "47h" of work.
 */
function SessionTimer({
  sessionId,
  inFlight,
}: {
  sessionId: SessionId;
  inFlight: boolean;
}) {
  const messages = useMessagesStore(
    (s) => s.messagesBySession[sessionId] ?? EMPTY_MESSAGES,
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!inFlight) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [inFlight]);

  const totalElapsed = useMemo(() => {
    let total = 0;
    let turnStart: number | null = null;
    let turnLastMs: number | null = null;
    let turnIsLast = false;

    const closeTurn = (endOverride?: number) => {
      if (turnStart === null) return;
      const end = endOverride ?? turnLastMs ?? turnStart;
      total += Math.max(0, end - turnStart);
    };

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]!;
      if (m.content._tag === "user" || m.content._tag === "user_rich") {
        if (turnStart !== null) closeTurn();
        turnStart = m.createdAt.getTime();
        turnLastMs = turnStart;
        turnIsLast = i === messages.length - 1;
      } else if (turnStart !== null) {
        turnLastMs = m.createdAt.getTime();
        turnIsLast = i === messages.length - 1;
      }
    }
    if (turnStart !== null) {
      // The in-flight turn keeps growing until the next message lands; for
      // a completed last turn we freeze at its final message timestamp.
      closeTurn(inFlight && turnIsLast !== false ? now : undefined);
    }
    return total;
  }, [messages, inFlight, now]);

  if (messages.length === 0) return null;

  return (
    <span
      className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground"
      title="Total time spent across all turns in this session"
    >
      {formatCoarse(totalElapsed)}
    </span>
  );
}

/**
 * Pick the workspace this session runs in: the project's main checkout or
 * a freshly-created git worktree. Editable only on a brand-new session
 * (zero user messages); once the first message is sent, the chip becomes
 * a read-only label with a lock glyph — cwd cannot move under a running
 * agent.
 */
function WorkspacePicker({ session }: { session: Session }) {
  const setChatWorktree = useChatsStore((s) => s.setWorktree);
  const create = useWorktreesStore((s) => s.create);
  const refresh = useWorktreesStore((s) => s.refresh);
  const worktrees = useWorktreesStore(
    (s) => s.byProject[session.projectId] ?? EMPTY_WORKTREES,
  );
  const userMessageCount = useMessagesStore((s) => {
    const list = s.messagesBySession[session.id] ?? [];
    let count = 0;
    for (const m of list) {
      if (m.role === "user") count += 1;
    }
    return count;
  });
  const locked = userMessageCount > 0;

  // Hydrate the worktree list once per session so the popover renders
  // names (not just "New worktree") on first open.
  useEffect(() => {
    void refresh(session.projectId);
  }, [refresh, session.projectId]);

  const current = useMemo(
    () =>
      session.worktreeId === null
        ? null
        : worktrees.find((w) => w.id === session.worktreeId) ?? null,
    [session.worktreeId, worktrees],
  );

  const triggerLabel =
    session.worktreeId === null
      ? "Current checkout"
      : current?.name ?? "Worktree";
  const TriggerIcon =
    session.worktreeId === null ? FolderClosed : GitBranch;

  if (locked) {
    return (
      <span
        className="flex items-center gap-1.5 rounded-md px-2 py-1"
        title="Workspace locked — first message already sent"
      >
        <TriggerIcon className="size-3.5" />
        <span>{triggerLabel}</span>
        <Lock className="size-3 opacity-60" />
      </span>
    );
  }

  const onPickCurrent = () => {
    if (session.worktreeId === null) return;
    void setChatWorktree(session.chatId, null);
  };
  const onPickNewWorktree = async () => {
    const wt = await create(session.projectId);
    if (wt === null) return;
    await setChatWorktree(session.chatId, wt.id);
  };

  return (
    <Menu>
      <MenuTrigger
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-foreground hover:bg-muted/60 data-[popup-open]:bg-muted/60"
        aria-label="Change workspace"
        title="Change workspace — locks once the first message is sent"
      >
        <TriggerIcon className="size-3.5" />
        <span>{triggerLabel}</span>
        <ChevronDown className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup side="top" align="start" className="w-64 p-1">
        <MenuItem
          onClick={onPickCurrent}
          className={cn(
            "grid grid-cols-[1rem_auto_1fr] items-start gap-x-2.5 rounded-md px-2 py-2 text-sm",
            session.worktreeId === null
              ? "bg-accent/40 text-accent-foreground data-highlighted:bg-accent/60"
              : undefined,
          )}
        >
          <span className="col-start-1 row-start-1 flex h-5 items-center justify-center">
            {session.worktreeId === null && (
              <Check className="size-3.5 opacity-90" />
            )}
          </span>
          <FolderClosed className="col-start-2 row-start-1 mt-0.5 size-4 shrink-0" />
          <div className="col-start-3 row-start-1 flex flex-col gap-0.5">
            <span className="font-medium leading-none">Current checkout</span>
            <span className="text-xs text-muted-foreground leading-snug">
              Run in the project's main working tree.
            </span>
          </div>
        </MenuItem>
        <MenuItem
          onClick={() => void onPickNewWorktree()}
          className="grid grid-cols-[1rem_auto_1fr] items-start gap-x-2.5 rounded-md px-2 py-2 text-sm"
        >
          <span className="col-start-1 row-start-1 flex h-5 items-center justify-center">
            {session.worktreeId !== null && (
              <Check className="size-3.5 opacity-90" />
            )}
          </span>
          <GitBranch className="col-start-2 row-start-1 mt-0.5 size-4 shrink-0" />
          <div className="col-start-3 row-start-1 flex flex-col gap-0.5">
            <span className="font-medium leading-none">New worktree</span>
            <span className="text-xs text-muted-foreground leading-snug">
              Branch off the current HEAD into a fresh worktree.
            </span>
          </div>
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

/**
 * Right-aligned label that surfaces the worktree's branch when the session
 * is running on one. Empty when running in the main checkout — the file
 * tree / status pane already shows the project's HEAD branch in that case.
 */
function WorkspaceBranchLabel({ session }: { session: Session }) {
  const worktrees = useWorktreesStore(
    (s) => s.byProject[session.projectId] ?? EMPTY_WORKTREES,
  );
  if (session.worktreeId === null) return null;
  const wt = worktrees.find((w) => w.id === session.worktreeId);
  if (wt === undefined) return null;
  return (
    <span
      className="flex items-center gap-1 truncate font-mono text-foreground/80"
      title={`Branch ${wt.branch}`}
    >
      <GitBranch className="size-3 shrink-0 opacity-70" />
      <span className="truncate font-medium">{wt.branch}</span>
    </span>
  );
}

const EMPTY_MESSAGES: ReadonlyArray<Message> = [];
