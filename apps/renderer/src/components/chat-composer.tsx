import type { EditorView } from "@codemirror/view";
import { Check, ChevronDown, Gauge, Send, Square } from "lucide-react";
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
  setComposerDoc,
  type ActiveTrigger,
} from "~/lib/codemirror/composer";
import { clearChipsEffect } from "~/lib/codemirror/composer-chips";
import { cn } from "~/lib/utils";
import {
  matchBuiltin,
  type BuiltinCommand,
} from "../composer/builtin-commands.ts";
import { parseComposerInput } from "../composer/segment-parser.ts";
import { FileTagPopover } from "./composer/file-tag-popover.tsx";
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

// Stable empty-array reference; see chat-view.tsx for rationale.
const EMPTY_MESSAGES: ReadonlyArray<Message> = [];

type ReasoningLevel = "low" | "medium" | "high";
const REASONING_LEVELS: ReadonlyArray<ReasoningLevel> = [
  "low",
  "medium",
  "high",
];

export function ChatComposer({ session }: { session: Session }) {
  const sessionId: SessionId = session.id;
  const messages = useMessagesStore(
    (s) => s.messagesBySession[sessionId] ?? EMPTY_MESSAGES,
  );
  const inFlight = useMessagesStore(
    (s) => s.runningBySession[sessionId] === true,
  );
  const send = useMessagesStore((s) => s.send);
  const interrupt = useMessagesStore((s) => s.interrupt);

  const [hasText, setHasText] = useState(false);
  const [trigger, setTrigger] = useState<ActiveTrigger | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  // Submit reads through a ref so the keymap, captured at editor creation
  // time, always sees the current sessionId / send / inFlight without
  // recreating the editor on every render.
  const submitRef = useRef<() => boolean>(() => false);

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
      placeholderText: "Send a message…  Enter to send · Shift+Enter for newline",
      callbacks: {
        onSubmit: () => submitRef.current(),
        onChange: (doc) => setHasText(doc.trim().length > 0),
        onTrigger: (t) => setTrigger(t),
      },
    });
    editorViewRef.current = view;
    view.focus();

    return () => {
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

  const dispatchBuiltin = (parsed: { command: BuiltinCommand; args: string }): void => {
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

  const submit = (): boolean => {
    // Don't submit while a popover is open — Enter belongs to the popover.
    if (trigger !== null) return false;

    const view = editorViewRef.current;
    if (view === null) return false;
    const docText = composerDoc(view).trim();
    if (docText.length === 0) return false;

    const builtin = matchBuiltin(docText);
    if (builtin !== null) {
      clearComposer(view);
      dispatchBuiltin(builtin);
      return true;
    }

    const input = parseComposerInput(view.state, session.providerId);
    clearComposer(view);
    void send(sessionId, input);
    return true;
  };

  // Keep the keymap-bound submit pointing at the latest closure so it sees
  // the current sessionId after a session switch / re-render.
  submitRef.current = submit;

  return (
    <TooltipProvider>
      <div className="shrink-0 px-3 pb-3 pt-2">
        <div className="mx-auto max-w-3xl">
          <Frame className="bg-muted/40">
            <Card className="rounded-xl border-border/50">
              <CardPanel className="relative flex items-end gap-2 px-3 py-2">
                {trigger !== null && editorViewRef.current !== null ? (
                  trigger.kind === "slash" ? (
                    <SlashCommandPopover
                      trigger={trigger}
                      view={editorViewRef.current}
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
                {inFlight ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => void interrupt(sessionId)}
                          aria-label="Interrupt"
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-opacity hover:opacity-90"
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
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
                <TurnTimer messages={messages} inFlight={inFlight} />
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

const formatElapsed = (ms: number): string => {
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  return `${min}m ${sec.toFixed(1)}s`;
};

/**
 * Live elapsed time for the current turn. Anchors to the most recent user
 * message; ticks while the turn is in flight, then freezes the final value
 * once the assistant lands so the user can see how long the turn took.
 */
function TurnTimer({
  messages,
  inFlight,
}: {
  messages: ReadonlyArray<Message>;
  inFlight: boolean;
}) {
  const anchorMs = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.content._tag === "user") return m.createdAt.getTime();
    }
    return null;
  }, [messages]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!inFlight) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [inFlight]);

  if (anchorMs === null) {
    return <span className="text-[10px] text-muted-foreground">idle</span>;
  }

  // Freeze on the final assistant/tool-result timestamp once the turn ends, so
  // the displayed value matches the actual turn duration instead of "time
  // since user spoke".
  const endMs = inFlight
    ? now
    : (messages[messages.length - 1]?.createdAt.getTime() ?? now);
  const elapsed = Math.max(0, endMs - anchorMs);

  return (
    <span
      className={`tabular-nums text-[10px] ${
        inFlight ? "text-foreground" : "text-muted-foreground"
      }`}
      title={inFlight ? "Time on the current turn" : "Last turn duration"}
    >
      {inFlight ? "● " : ""}
      {formatElapsed(elapsed)}
    </span>
  );
}
