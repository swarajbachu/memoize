import {
  Check,
  ChevronDown,
  Gauge,
  Send,
  ShieldAlert,
  ShieldCheck,
  Square,
  Zap,
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

const MIN_HEIGHT = 56;
const MAX_HEIGHT = 240;

// Stable empty-array reference; see chat-view.tsx for rationale.
const EMPTY_MESSAGES: ReadonlyArray<Message> = [];

/**
 * Heuristic for "we're awaiting an LLM response": the most recent message is
 * either the user's submit or a tool_use without its paired tool_result yet.
 * Coarse but stable; PR 7 may swap it for a real session-status subscription.
 */
const inferInFlight = (messages: ReadonlyArray<Message>): boolean => {
  if (messages.length === 0) return false;
  const last = messages[messages.length - 1]!;
  return last.content._tag === "user" || last.content._tag === "tool_use";
};

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
  const send = useMessagesStore((s) => s.send);
  const interrupt = useMessagesStore((s) => s.interrupt);

  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const inFlight = useMemo(() => inferInFlight(messages), [messages]);
  const canSend = !inFlight && value.trim().length > 0;

  const submit = async () => {
    const text = value.trim();
    if (text.length === 0 || inFlight) return;
    setValue("");
    if (textareaRef.current !== null) {
      textareaRef.current.style.height = `${MIN_HEIGHT}px`;
    }
    await send(sessionId, text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  // Auto-grow the textarea up to MAX_HEIGHT, then scroll internally.
  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const ta = e.target;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, ta.scrollHeight))}px`;
  };

  return (
    <TooltipProvider>
      <div className="shrink-0 px-3 pb-3 pt-2">
        <div className="mx-auto max-w-3xl">
          <Frame className="bg-muted/40">
            <Card className="rounded-xl border-border/50">
              <CardPanel className="flex items-end gap-2 px-3 py-2">
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={onChange}
                  onKeyDown={onKeyDown}
                  placeholder="Send a message…  ⌘+Enter to send"
                  rows={1}
                  style={{ height: MIN_HEIGHT }}
                  className="flex-1 resize-none bg-transparent px-1 py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
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
                    <TooltipPopup>Send (⌘+Enter)</TooltipPopup>
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
 * Three-state segmented control for the per-session permission posture.
 *   - approval-required (shield) — every write/Bash/Network/Task prompts.
 *   - auto-accept-edits (check)  — file edits skip the prompt; rest still ask.
 *   - full-access (zap)          — auto-allow everything except sensitive paths.
 *
 * The mode is stored on the session row and read live by the SDK's
 * canUseTool callback, so flipping the switch mid-turn applies to the next
 * tool call without restarting the conversation.
 */
const MODE_META: Record<
  RuntimeMode,
  {
    label: string;
    tooltip: string;
    Icon: typeof ShieldAlert;
    activeClass: string;
  }
> = {
  "approval-required": {
    label: "Approve",
    tooltip: "Prompt for every write, shell, and network call",
    Icon: ShieldAlert,
    activeClass: "bg-background text-foreground shadow-xs/5",
  },
  "auto-accept-edits": {
    label: "Edits",
    tooltip:
      "Auto-allow file edits — still prompt for shell, network, subagents",
    Icon: ShieldCheck,
    activeClass: "bg-emerald-500/15 text-emerald-300 shadow-xs/5",
  },
  "full-access": {
    label: "YOLO",
    tooltip:
      "Auto-allow everything except sensitive paths (.env, credentials, …)",
    Icon: Zap,
    activeClass: "bg-amber-500/15 text-amber-300 shadow-xs/5",
  },
};

function RuntimeModeToggle({
  sessionId,
  current,
}: {
  sessionId: SessionId;
  current: RuntimeMode;
}) {
  const setRuntimeMode = useSessionsStore((s) => s.setRuntimeMode);
  const modes: ReadonlyArray<RuntimeMode> = [
    "approval-required",
    "auto-accept-edits",
    "full-access",
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5">
      {modes.map((mode) => {
        const meta = MODE_META[mode];
        const Icon = meta.Icon;
        const active = mode === current;
        return (
          <Tooltip key={mode}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => {
                    if (!active) void setRuntimeMode(sessionId, mode);
                  }}
                  aria-label={meta.label}
                  aria-pressed={active}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors ${
                    active
                      ? meta.activeClass
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3" />
                  <span>{meta.label}</span>
                </button>
              }
            />
            <TooltipPopup>{meta.tooltip}</TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
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
