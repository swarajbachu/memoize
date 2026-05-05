import type { EditorView } from "@codemirror/view";
import {
  Check,
  ChevronDown,
  Gauge,
  Paperclip,
  Send,
  Square,
  Upload,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  MODELS_BY_PROVIDER,
  type Message,
  type ProviderId,
  type RuntimeMode,
  type Session,
  type SessionId,
} from "@forkzero/wire";

import { Card, CardPanel } from "~/components/ui/card";
import { Frame, FrameFooter } from "~/components/ui/frame";
import {
  composerDoc,
  createComposerView,
  replaceWithChip,
  setComposerDoc,
  type ActiveTrigger,
} from "~/lib/codemirror/composer";
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
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useMessagesStore } from "../store/messages.ts";
import { useSessionsStore } from "../store/sessions.ts";
import { ProviderIcon } from "./provider-icons.tsx";
import { MODES_ORDER, MODE_META } from "./runtime-mode-meta.ts";

const MIN_HEIGHT = 56;
const MAX_HEIGHT = 240;
const MAX_ATTACHMENTS_PER_TURN = 20;

type ReasoningLevel = "low" | "medium" | "high";
const REASONING_LEVELS: ReadonlyArray<ReasoningLevel> = [
  "low",
  "medium",
  "high",
];

export function ChatComposer({ session }: { session: Session }) {
  const sessionId: SessionId = session.id;
  const inFlight = useMessagesStore(
    (s) => s.runningBySession[sessionId] === true,
  );
  const send = useMessagesStore((s) => s.send);
  const interrupt = useMessagesStore((s) => s.interrupt);
  const queue = useMessagesStore((s) => s.queue);

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

  const setModel = useSessionsStore((s) => s.setModel);
  const setRuntimeMode = useSessionsStore((s) => s.setRuntimeMode);

  const canSend = hasText;

  // Mount the CodeMirror view once per ChatComposer instance. Switching
  // sessions remounts the component (`session.id` is the chat-view key),
  // so we don't have to swap docs in-place here.
  useEffect(() => {
    const host = editorHostRef.current;
    if (host === null) return;

    const view = createComposerView({
      parent: host,
      placeholderText:
        "Ask to make changes at the @ mentioned files or run slash commands, shift enter for next line.",
      callbacks: {
        onSubmit: () => submitRef.current(),
        onChange: (doc) => setHasText(doc.trim().length > 0),
        onTrigger: (t) => setTrigger(t),
        onFilesDropped: (files) => filesDroppedRef.current(files),
      },
    });
    editorViewRef.current = view;
    view.focus();

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

    return () => {
      const b = useComposerBridge.getState();
      b.setAttachFile(null);
      b.setInsertText(null);
      view.destroy();
      editorViewRef.current = null;
    };
  }, []);

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
   * token swaps from a temp id to a `forkzero://attachments/<id>` URL once the
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
          const finalUrl = isImage ? `forkzero://attachments/${ref.id}` : "";
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
  filesDroppedRef.current = (files) => {
    // CM's drop handler stops propagation so our React onDrop never fires —
    // clear the drag overlay state here instead.
    dragDepthRef.current = 0;
    setIsDragging(false);
    attachFiles(files);
  };

  return (
    <TooltipProvider delay={0}>
      <div className="shrink-0 px-3 pb-3 pt-2">
        <div className="mx-auto">
          <Frame>
            <Card
              className="rounded-xl border-border/50 min-h-30"
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
                {inFlight ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => void interrupt(sessionId)}
                          aria-label="Interrupt"
                          className="flex size-8 shrink-0 self-end items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                        >
                          <Square className="size-3.5" />
                        </button>
                      }
                    />
                    <TooltipPopup>Interrupt the running turn</TooltipPopup>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => void submit()}
                          disabled={!canSend}
                          aria-label="Send"
                          className="flex size-8 shrink-0 self-end items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Send className="size-3.5" />
                        </button>
                      }
                    />
                    <TooltipPopup>Send (Enter)</TooltipPopup>
                  </Tooltip>
                )}
              </CardPanel>
            </Card>
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
                  providerId={session.providerId}
                  currentModel={session.model}
                />
                <ReasoningPicker sessionId={sessionId} />
              </div>
              <div className="flex items-center gap-2">
                <RuntimeModeToggle
                  sessionId={sessionId}
                  current={session.runtimeMode}
                />
                <SessionTimer sessionId={sessionId} inFlight={inFlight} />
              </div>
            </FrameFooter>
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

const PROVIDER_LABEL: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

function ModelPicker({
  sessionId,
  providerId,
  currentModel,
}: {
  sessionId: SessionId;
  providerId: ProviderId;
  currentModel: string;
}) {
  const setModel = useSessionsStore((s) => s.setModel);
  const models = MODELS_BY_PROVIDER[providerId] ?? [];
  const current = models.find((m) => m.id === currentModel);
  const label = current?.label ?? currentModel;

  return (
    <Menu>
      <MenuTrigger
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-foreground hover:bg-muted/60 data-[popup-open]:bg-muted/60"
        aria-label="Change model"
        title="Change model — applies to next message"
      >
        <ProviderIcon providerId={providerId} className="size-3" />
        <span>{label}</span>
        <ChevronDown className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup side="top" align="start" className="w-72">
        {(Object.keys(MODELS_BY_PROVIDER) as ReadonlyArray<ProviderId>).map(
          (pid, i) => (
            <Fragment key={pid}>
              {i > 0 && <MenuSeparator />}
              <MenuGroup>
                <MenuGroupLabel>{PROVIDER_LABEL[pid]}</MenuGroupLabel>
                {MODELS_BY_PROVIDER[pid].map((m) => {
                  const active = pid === providerId && m.id === currentModel;
                  return (
                    <MenuItem
                      key={m.id}
                      onClick={() => {
                        // For now, only switch within the current provider —
                        // cross-provider model changes need a fresh session.
                        if (pid !== providerId) return;
                        if (m.id !== currentModel)
                          void setModel(sessionId, m.id);
                      }}
                      disabled={pid !== providerId}
                      className={
                        active
                          ? "bg-accent/60 text-accent-foreground data-highlighted:bg-accent"
                          : undefined
                      }
                    >
                      <ProviderIcon providerId={pid} className="size-3.5" />
                      <span className="flex-1 truncate">{m.label}</span>
                      {active && <Check className="size-3.5 opacity-90" />}
                    </MenuItem>
                  );
                })}
              </MenuGroup>
            </Fragment>
          ),
        )}
      </MenuPopup>
    </Menu>
  );
}

/**
 * Reasoning effort selector. UI-only for now — wire integration is a
 * follow-up (codex driver needs to forward `--reasoning-effort`, claude
 * driver maps to thinking budget). State is per-session and lives in
 * sessionStorage so reloads keep the chosen level visible.
 */
function ReasoningPicker({ sessionId }: { sessionId: SessionId }) {
  const storageKey = `forkzero.reasoning.${sessionId}`;
  const [level, setLevel] = useState<ReasoningLevel>(() => {
    if (typeof window === "undefined") return "medium";
    const stored = window.sessionStorage.getItem(storageKey);
    return stored === "low" || stored === "high" ? stored : "medium";
  });

  const onChange = (next: string) => {
    if (next !== "low" && next !== "medium" && next !== "high") return;
    setLevel(next);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(storageKey, next);
    }
  };

  return (
    <Menu>
      <MenuTrigger
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-foreground hover:bg-muted/60 data-[popup-open]:bg-muted/60"
        aria-label="Reasoning effort"
        title="Reasoning effort for the next message"
      >
        <Gauge className="size-3" />
        <span className="capitalize">{level}</span>
        <ChevronDown className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup side="top" align="start" className="w-44">
        <MenuGroup>
          <MenuGroupLabel>Reasoning effort</MenuGroupLabel>
          <MenuRadioGroup value={level} onValueChange={onChange}>
            {REASONING_LEVELS.map((l) => (
              <MenuRadioItem key={l} value={l}>
                <span className="capitalize">{l}</span>
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
      if (m.content._tag === "user") {
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

const EMPTY_MESSAGES: ReadonlyArray<Message> = [];
