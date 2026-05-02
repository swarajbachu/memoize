import { Bot, Plus, Terminal as TerminalIcon } from "lucide-react";

const sessions = [
  { id: "scratch", name: "scratch", agent: "claude-opus-4-7", status: "idle" },
  { id: "fix-cron", name: "fix-cron-job", agent: "claude-sonnet-4-6", status: "running" },
  { id: "ingest-rewrite", name: "ingest-rewrite", agent: "claude-opus-4-7", status: "blocked" },
];

const statusColor: Record<string, string> = {
  idle: "bg-[var(--color-fg-muted)]",
  running: "bg-emerald-400",
  blocked: "bg-amber-400",
};

export function Sidebar() {
  return (
    <aside className="flex flex-col bg-[var(--color-bg-elevated)]">
      <div className="flex h-9 items-center justify-between px-3 text-xs uppercase tracking-wide text-[var(--color-fg-muted)] [-webkit-app-region:drag]">
        <span className="ml-16 select-none">Zurich</span>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-xs text-[var(--color-fg-muted)]">
        <span>Sessions</span>
        <button
          type="button"
          className="rounded p-1 hover:bg-[var(--color-border)]"
          aria-label="New session"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <ul className="flex flex-col gap-0.5 px-1">
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--color-border)]/60"
            >
              <TerminalIcon className="size-3.5 text-[var(--color-fg-muted)]" />
              <span className="flex-1 truncate">{session.name}</span>
              <span
                className={`size-1.5 rounded-full ${statusColor[session.status] ?? "bg-[var(--color-fg-muted)]"}`}
                title={session.status}
              />
            </button>
            <div className="ml-7 flex items-center gap-1 text-[10px] text-[var(--color-fg-muted)]">
              <Bot className="size-2.5" />
              <span className="truncate">{session.agent}</span>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
