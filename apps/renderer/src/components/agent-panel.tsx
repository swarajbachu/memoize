import { useEffect, useRef, useState } from "react";
import { Pause, Send, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import { useAgentsStore } from "../store/agents.ts";
import { AgentEventRow } from "./agent-event-row.tsx";

const STATUS_LABEL: Record<string, string> = {
  starting: "starting…",
  running: "running",
  closed: "closed",
  error: "error",
};

const STATUS_COLOR: Record<string, string> = {
  starting: "bg-amber-500",
  running: "bg-emerald-500",
  closed: "bg-muted-foreground",
  error: "bg-red-500",
};

export function AgentPanel() {
  const session = useAgentsStore((s) => s.activeSession);
  const sendSdk = useAgentsStore((s) => s.sendSdk);
  const interruptSdk = useAgentsStore((s) => s.interruptSdk);
  const closeSdk = useAgentsStore((s) => s.closeSdk);

  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current !== null) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [session?.events.length]);

  if (session === null) {
    return (
      <aside className="flex flex-col bg-background">
        <header className="flex h-9 items-center justify-between border-b border-border px-3 text-xs text-muted-foreground">
          <span>agent</span>
        </header>
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          No active SDK session. Press <kbd className="mx-1 rounded bg-muted px-1">⌘K</kbd> and pick "Claude (SDK)".
        </div>
      </aside>
    );
  }

  const onSend = async () => {
    const text = draft.trim();
    if (text.length === 0) return;
    setDraft("");
    await sendSdk(text);
  };

  return (
    <aside className="flex h-full flex-col bg-background">
      <header className="flex h-9 items-center justify-between border-b border-border px-3 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${STATUS_COLOR[session.status] ?? "bg-muted"}`}
            aria-hidden
          />
          <span className="font-medium">{session.providerId} (SDK)</span>
          <span className="text-muted-foreground">
            {STATUS_LABEL[session.status] ?? session.status}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void interruptSdk()}
            disabled={session.status !== "running"}
            className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Interrupt"
            title="Interrupt"
          >
            <Pause className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void closeSdk()}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close session"
            title="Close session"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto p-2">
        {session.events.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Waiting for first response…
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {session.events.map((event, idx) => (
              <AgentEventRow key={idx} event={event} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void onSend();
              }
            }}
            disabled={session.status === "closed"}
            placeholder="Message Claude (⌘↵)"
            className="min-h-[36px] flex-1 resize-none rounded border border-border bg-muted/30 px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            rows={2}
          />
          <Button
            size="sm"
            onClick={() => void onSend()}
            disabled={draft.trim().length === 0 || session.status === "closed"}
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
