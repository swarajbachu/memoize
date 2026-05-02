import { GitCommit as GitCommitIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Effect, Fiber, Stream } from "effect";

import {
  type FolderId,
  type GitCommit,
  type GitStatusSummary,
} from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";
import { useWorkspaceStore } from "../store/workspace.ts";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      commits: ReadonlyArray<GitCommit>;
      summary: GitStatusSummary | null;
    }
  | { status: "not-a-repo" }
  | { status: "git-not-installed" }
  | { status: "error"; reason: string };

const LIMIT = 50;

export function GitHistoryPane() {
  const folders = useWorkspaceStore((s) => s.folders);
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const selected = selectedFolderId
    ? (folders.find((f) => f.id === selectedFolderId) ?? null)
    : null;

  if (selected === null) {
    return (
      <aside className="flex flex-col bg-[var(--color-bg-elevated)]">
        <Header label="git" />
        <EmptyState>No folder selected.</EmptyState>
      </aside>
    );
  }

  return <GitPane key={selected.id} folderId={selected.id} />;
}

function GitPane({ folderId }: { folderId: FolderId }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let streamFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;

    const refresh = async () => {
      try {
        const client = await getRpcClient();
        if (cancelled) return;
        const [commits, summary] = await Promise.all([
          Effect.runPromise(client.git.log({ folderId, limit: LIMIT })),
          Effect.runPromise(client.git.status({ folderId })).catch(
            () => null,
          ),
        ]);
        if (cancelled) return;
        setState({ status: "ready", commits, summary });
      } catch (err) {
        if (cancelled) return;
        const tag =
          typeof err === "object" && err !== null && "_tag" in err
            ? String((err as { _tag: unknown })._tag)
            : null;
        if (tag === "GitNotARepoError") setState({ status: "not-a-repo" });
        else if (tag === "GitNotInstalledError")
          setState({ status: "git-not-installed" });
        else
          setState({
            status: "error",
            reason:
              err instanceof Error
                ? err.message
                : tag ?? String(err),
          });
      }
    };

    setState({ status: "loading" });
    void refresh();

    void (async () => {
      const client = await getRpcClient();
      if (cancelled) return;
      // Subscribe once; refetch log + status whenever HEAD changes.
      streamFiber = Effect.runFork(
        Stream.runForEach(client.git.headChanged({ folderId }), () =>
          Effect.promise(() => refresh()),
        ),
      );
    })();

    return () => {
      cancelled = true;
      if (streamFiber !== null) {
        void Effect.runPromise(Fiber.interrupt(streamFiber));
      }
    };
  }, [folderId]);

  return (
    <aside className="flex h-full flex-col bg-[var(--color-bg-elevated)]">
      <Header
        label={
          state.status === "ready" && state.summary?.branch
            ? state.summary.branch
            : "git"
        }
        right={
          state.status === "ready" && state.summary
            ? renderStatusRight(state.summary)
            : undefined
        }
      />
      {renderBody(state)}
    </aside>
  );
}

function renderBody(state: LoadState) {
  switch (state.status) {
    case "idle":
    case "loading":
      return <EmptyState>Loading…</EmptyState>;
    case "not-a-repo":
      return <EmptyState>Not a git repository.</EmptyState>;
    case "git-not-installed":
      return <EmptyState>Install git to see history.</EmptyState>;
    case "error":
      return <EmptyState>{state.reason}</EmptyState>;
    case "ready":
      if (state.commits.length === 0) {
        return <EmptyState>No commits yet.</EmptyState>;
      }
      return (
        <ol className="flex flex-col gap-1 overflow-y-auto px-2 py-1">
          {state.commits.map((commit) => (
            <CommitRow key={commit.sha} commit={commit} />
          ))}
        </ol>
      );
  }
}

function CommitRow({ commit }: { commit: GitCommit }) {
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    void navigator.clipboard.writeText(commit.sha).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    });
  };
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        title={`Click to copy ${commit.sha}`}
        className="flex w-full gap-2 rounded px-2 py-2 text-left text-sm hover:bg-[var(--color-border)]/40"
      >
        <GitCommitIcon className="mt-0.5 size-3.5 shrink-0 text-[var(--color-fg-muted)]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[var(--color-fg)]">
            {commit.subject}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
            <span className="font-mono">
              {copied ? "copied!" : commit.shortSha}
            </span>
            <span>·</span>
            <span className="truncate">{commit.authorName}</span>
            <span>·</span>
            <span>{relativeTime(commit.authoredAt)}</span>
          </div>
        </div>
      </button>
    </li>
  );
}

function Header({
  label,
  right,
}: {
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex h-9 items-center justify-between px-3 text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
      <span className="truncate">{label}</span>
      {right ?? null}
    </header>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-6 text-center text-xs text-[var(--color-fg-muted)]">
      {children}
    </div>
  );
}

function renderStatusRight(s: GitStatusSummary) {
  const parts: string[] = [];
  if (s.ahead > 0) parts.push(`↑${s.ahead}`);
  if (s.behind > 0) parts.push(`↓${s.behind}`);
  if (s.dirtyFiles > 0) parts.push(`${s.dirtyFiles}*`);
  if (parts.length === 0) return null;
  return <span className="text-[10px]">{parts.join(" ")}</span>;
}

function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}
