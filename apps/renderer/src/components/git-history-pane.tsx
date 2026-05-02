import { GitCommit } from "lucide-react";

const commits = [
  {
    sha: "9a23b1e",
    message: "wire pty bridge through preload",
    author: "agent-opus",
    when: "2m",
  },
  {
    sha: "4f87ac0",
    message: "add session sidebar with status dots",
    author: "agent-opus",
    when: "14m",
  },
  {
    sha: "c1d80b9",
    message: "scaffold electron desktop + renderer split",
    author: "swaraj",
    when: "1h",
  },
  {
    sha: "9709a25",
    message: "Initial commit from create-turbo",
    author: "swaraj",
    when: "2d",
  },
];

export function GitHistoryPane() {
  return (
    <aside className="flex flex-col bg-[var(--color-bg-elevated)]">
      <header className="flex h-9 items-center px-3 text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
        Git activity
      </header>
      <ol className="flex flex-col gap-1 overflow-y-auto px-2 py-1">
        {commits.map((commit) => (
          <li
            key={commit.sha}
            className="flex gap-2 rounded px-2 py-2 text-sm hover:bg-[var(--color-border)]/40"
          >
            <GitCommit className="mt-0.5 size-3.5 shrink-0 text-[var(--color-fg-muted)]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[var(--color-fg)]">{commit.message}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
                <span className="font-mono">{commit.sha}</span>
                <span>·</span>
                <span className="truncate">{commit.author}</span>
                <span>·</span>
                <span>{commit.when}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
