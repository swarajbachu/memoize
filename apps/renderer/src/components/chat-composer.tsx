import {
  Check,
  ChevronDown,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  MODELS_BY_PROVIDER,
  type Message,
  type ProviderId,
  type RuntimeMode,
  type Session,
  type SessionId,
} from "@forkzero/wire";

import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useMessagesStore } from "../store/messages.ts";
import { useSessionsStore } from "../store/sessions.ts";

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
    <div className="shrink-0 border-t border-border bg-zinc-900 px-3 pb-3 pt-2">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-2 py-1.5 focus-within:ring-1 focus-within:ring-primary/40">
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
            <button
              type="button"
              onClick={() => void interrupt(sessionId)}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive text-destructive-foreground hover:opacity-90"
              aria-label="Interrupt"
              title="Interrupt"
            >
              <Square className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSend}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send"
              title="Send (⌘+Enter)"
            >
              <Send className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground">
          <ModelPicker
            sessionId={sessionId}
            providerId={session.providerId}
            currentModel={session.model}
          />
          <div className="flex items-center gap-2">
            <RuntimeModeToggle
              sessionId={sessionId}
              current={session.runtimeMode}
            />
            <span>{inFlight ? "running…" : "idle"}</span>
          </div>
        </div>
      </div>
    </div>
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
  { label: string; title: string; Icon: typeof ShieldAlert }
> = {
  "approval-required": {
    label: "Approve",
    title: "Prompt for every write / shell / network call",
    Icon: ShieldAlert,
  },
  "auto-accept-edits": {
    label: "Edits",
    title: "Auto-allow file edits; still prompt for shell / network / subagent",
    Icon: ShieldCheck,
  },
  "full-access": {
    label: "YOLO",
    title:
      "Auto-allow everything except sensitive paths (.env, credentials, …)",
    Icon: Zap,
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
    <div className="flex overflow-hidden rounded border border-border">
      {modes.map((mode) => {
        const meta = MODE_META[mode];
        const Icon = meta.Icon;
        const active = mode === current;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => {
              if (!active) void setRuntimeMode(sessionId, mode);
            }}
            title={meta.title}
            className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] transition-colors ${
              active
                ? mode === "full-access"
                  ? "bg-amber-500/20 text-amber-200"
                  : mode === "auto-accept-edits"
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60"
            }`}
          >
            <Icon className="size-3" />
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

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
  const [open, setOpen] = useState(false);
  const models = MODELS_BY_PROVIDER[providerId] ?? [];
  const current = models.find((m) => m.id === currentModel);
  const label = current?.label ?? currentModel;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/60 hover:text-foreground data-[popup-open]:bg-muted/60 data-[popup-open]:text-foreground"
        title="Change model — applies to next message"
      >
        <Sparkles className="size-3" />
        <span>
          {providerId} · {label}
        </span>
        <ChevronDown className="size-3" />
      </PopoverTrigger>
      <PopoverPopup side="top" align="start" className="w-56">
        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Model — applies to next message
        </div>
        {models.map((m) => {
          const active = m.id === currentModel;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setOpen(false);
                if (!active) void setModel(sessionId, m.id);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-sidebar-accent"
            >
              <Check
                className={`size-3.5 ${active ? "opacity-100" : "opacity-0"}`}
              />
              <span className="flex-1 truncate">{m.label}</span>
              <span className="text-[10px] text-muted-foreground">{m.id}</span>
            </button>
          );
        })}
      </PopoverPopup>
    </Popover>
  );
}
