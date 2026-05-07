import { Effect } from "effect";
import { CornerDownLeft, Loader2, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  FolderId,
  GitChange,
  GitChangeKind,
  WorktreeId,
} from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";
import { gitChangesKey, useGitChangesStore } from "../store/git-changes.ts";
import { gitStatusKey, useGitStatusStore } from "../store/git-status.ts";
import { prDetailsKey, usePrDetailsStore } from "../store/pr-details.ts";
import { prStateKey, usePrStateStore } from "../store/pr-state.ts";
import { useUiStore } from "../store/ui.ts";

const basename = (path: string): string => {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
};

const dirname = (path: string): string => {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
};

/**
 * Right-pane "Changes" tab. Combines the working-tree change list (with a
 * real commit composer at the bottom) and, when a PR is open, the PR's
 * files-changed list. Clicking any file opens it in the main file editor —
 * same flow as the file tree. Worktree-aware: every store lookup and RPC
 * call is keyed by `(folderId, worktreeId)` so a session running inside a
 * worktree sees its own branch's changes, not the main checkout.
 */
export function DiffPane({
  folderId,
  worktreeId,
}: {
  folderId: FolderId | null;
  worktreeId: WorktreeId | null;
}) {
  const status = useGitStatusStore((s) =>
    folderId ? (s.byKey[gitStatusKey(folderId, worktreeId)] ?? null) : null,
  );
  const pr = usePrStateStore((s) =>
    folderId ? (s.byKey[prStateKey(folderId, worktreeId)] ?? null) : null,
  );
  const prDetails = usePrDetailsStore((s) =>
    folderId ? (s.byKey[prDetailsKey(folderId, worktreeId)] ?? null) : null,
  );
  const changes = useGitChangesStore((s) =>
    folderId ? (s.byKey[gitChangesKey(folderId, worktreeId)] ?? null) : null,
  );
  const changesLoading = useGitChangesStore((s) =>
    folderId
      ? s.loadingByKey[gitChangesKey(folderId, worktreeId)] === true
      : false,
  );
  const changesError = useGitChangesStore((s) =>
    folderId
      ? (s.errorByKey[gitChangesKey(folderId, worktreeId)] ?? null)
      : null,
  );
  const refreshChanges = useGitChangesStore((s) => s.refresh);
  const refreshStatus = useGitStatusStore((s) => s.refresh);
  const refreshPrState = usePrStateStore((s) => s.refresh);
  const refreshPrDetails = usePrDetailsStore((s) => s.refresh);

  // Poll the working tree on the same 5s cadence the top bar uses for
  // `git status`, so the Changes tab stays in sync with the dirty-count badge.
  useEffect(() => {
    if (folderId === null) return;
    void refreshChanges(folderId, worktreeId);
    const id = window.setInterval(
      () => void refreshChanges(folderId, worktreeId),
      5000,
    );
    return () => window.clearInterval(id);
  }, [folderId, worktreeId, refreshChanges]);

  if (folderId === null) {
    return <Empty>Select a project to see its changes.</Empty>;
  }

  const refreshAll = async () => {
    await Promise.all([
      refreshChanges(folderId, worktreeId),
      refreshStatus(folderId, worktreeId),
      refreshPrState(folderId, worktreeId),
      refreshPrDetails(folderId, worktreeId),
    ]);
  };

  const tracked = (changes ?? []).filter(
    (c) => c.kind !== "untracked" && c.kind !== "ignored",
  );
  const untracked = (changes ?? []).filter((c) => c.kind === "untracked");
  const totalChanges = tracked.length + untracked.length;

  const prFiles = prDetails?.files ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3 text-xs">
        <Section
          title="Uncommitted"
          counter={
            changesLoading && changes === null
              ? null
              : totalChanges
          }
        >
          {changesError !== null ? (
            <p className="text-rose-300/80">Couldn't read git status: {changesError}</p>
          ) : changesLoading && changes === null ? (
            <Indicator title="Reading working tree…" />
          ) : totalChanges === 0 ? (
            <Indicator
              title="Working tree clean"
              body="Nothing to commit."
            />
          ) : (
            <>
              {tracked.length > 0 ? (
                <ChangeList
                  label="Tracked"
                  folderId={folderId}
                  worktreeId={worktreeId}
                  entries={tracked}
                />
              ) : null}
              {untracked.length > 0 ? (
                <ChangeList
                  label="Untracked"
                  folderId={folderId}
                  worktreeId={worktreeId}
                  entries={untracked}
                />
              ) : null}
            </>
          )}
        </Section>

        {prFiles.length > 0 ? (
          <Section
            title={pr !== null && pr.number !== null ? `In PR #${pr.number}` : "In this PR"}
            counter={prFiles.length}
          >
            <ul className="flex flex-col">
              {prFiles.map((f) => (
                <FileRow
                  key={f.path}
                  folderId={folderId}
                  worktreeId={worktreeId}
                  path={f.path}
                  badge={
                    <span className="shrink-0 font-mono text-[10px]">
                      <span className="text-emerald-300/90">+{f.additions}</span>{" "}
                      <span className="text-rose-300/90">−{f.deletions}</span>
                    </span>
                  }
                />
              ))}
            </ul>
          </Section>
        ) : null}
      </div>

      <CommitComposer
        folderId={folderId}
        worktreeId={worktreeId}
        branch={status?.branch ?? null}
        ahead={status?.ahead ?? 0}
        canCommit={tracked.length + untracked.length > 0}
        canPush={(status?.ahead ?? 0) > 0}
        onAfterCommit={refreshAll}
        onAfterPush={refreshAll}
      />
    </div>
  );
}

function ChangeList({
  label,
  folderId,
  worktreeId,
  entries,
}: {
  label: string;
  folderId: FolderId;
  worktreeId: WorktreeId | null;
  entries: ReadonlyArray<GitChange>;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
        {label}
      </div>
      <ul className="flex flex-col">
        {entries.map((c) => (
          <FileRow
            key={c.path}
            folderId={folderId}
            worktreeId={worktreeId}
            path={c.path}
            badge={<KindBadge kind={c.kind} />}
          />
        ))}
      </ul>
    </div>
  );
}

function FileRow({
  folderId,
  worktreeId,
  path,
  badge,
}: {
  folderId: FolderId;
  worktreeId: WorktreeId | null;
  path: string;
  badge: React.ReactNode;
}) {
  const openFileInTab = useUiStore((s) => s.openFileInTab);
  const dir = dirname(path);
  return (
    <li>
      <button
        type="button"
        onClick={() =>
          openFileInTab({ folderId, worktreeId, path, name: basename(path) })
        }
        className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-foreground/5"
        title={path}
      >
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="truncate font-mono text-[11px] text-foreground/90">
            {basename(path)}
          </span>
          {dir.length > 0 ? (
            <span className="truncate font-mono text-[10px] text-muted-foreground">
              {dir}
            </span>
          ) : null}
        </span>
        {badge}
      </button>
    </li>
  );
}

const KIND_BADGE: Record<GitChangeKind, { label: string; className: string }> =
  {
    modified: { label: "M", className: "text-amber-300" },
    added: { label: "A", className: "text-emerald-300" },
    deleted: { label: "D", className: "text-rose-300" },
    renamed: { label: "R", className: "text-sky-300" },
    copied: { label: "C", className: "text-sky-300" },
    untracked: { label: "U", className: "text-emerald-200" },
    ignored: { label: "I", className: "text-muted-foreground" },
    unmerged: { label: "!", className: "text-rose-400" },
    type_changed: { label: "T", className: "text-amber-300" },
  };

function KindBadge({ kind }: { kind: GitChangeKind }) {
  const badge = KIND_BADGE[kind];
  return (
    <span className={`shrink-0 font-mono text-[10px] ${badge.className}`}>
      {badge.label}
    </span>
  );
}

/**
 * Commit composer modeled on GitHub Desktop's bottom-of-pane control: branch
 * indicator, an upstream/Push button, the message input, and a "Commit" CTA.
 * Auto-stages everything (`git add -A`) before committing so the user doesn't
 * have to think about staging — matches the "Commit Tracked + Untracked"
 * default in the screenshot.
 */
function CommitComposer({
  folderId,
  worktreeId,
  branch,
  ahead,
  canCommit,
  canPush,
  onAfterCommit,
  onAfterPush,
}: {
  folderId: FolderId;
  worktreeId: WorktreeId | null;
  branch: string | null;
  ahead: number;
  canCommit: boolean;
  canPush: boolean;
  onAfterCommit: () => Promise<void>;
  onAfterPush: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<null | "commit" | "push">(null);
  const [error, setError] = useState<string | null>(null);

  const onCommit = async () => {
    const trimmed = message.trim();
    if (trimmed.length === 0 || busy !== null) return;
    setBusy("commit");
    setError(null);
    try {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.git.commit({ folderId, worktreeId, message: trimmed }),
      );
      setMessage("");
      await onAfterCommit();
    } catch (err) {
      setError(formatErr(err));
    } finally {
      setBusy(null);
    }
  };

  const onPush = async () => {
    if (busy !== null) return;
    setBusy("push");
    setError(null);
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.git.push({ folderId, worktreeId }));
      await onAfterPush();
    } catch (err) {
      setError(formatErr(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="shrink-0 border-t border-border bg-foreground/[0.02] px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <span className="truncate font-mono text-foreground/90">
            {branch ?? "(detached)"}
          </span>
          {ahead > 0 ? (
            <span className="font-mono text-[10px] text-sky-300/90">
              ↑{ahead}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onPush}
          disabled={!canPush || busy !== null}
          className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          title={canPush ? "Push commits to origin" : "No commits ahead of upstream"}
        >
          {busy === "push" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Upload className="size-3" />
          )}
          Push
        </button>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void onCommit();
          }
        }}
        placeholder="Commit message"
        rows={2}
        disabled={!canCommit || busy === "commit"}
        className="w-full resize-none rounded-sm border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {error !== null ? (
            <span className="text-rose-300/90">{error}</span>
          ) : (
            <>⌘↵ to commit</>
          )}
        </span>
        <button
          type="button"
          onClick={onCommit}
          disabled={!canCommit || message.trim().length === 0 || busy === "commit"}
          className="flex items-center gap-1.5 rounded-sm bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "commit" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <CornerDownLeft className="size-3" />
          )}
          Commit
        </button>
      </div>
    </div>
  );
}

const formatErr = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "reason" in err) {
    return String((err as { reason: unknown }).reason);
  }
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

function Section({
  title,
  counter,
  children,
}: {
  title: string;
  counter?: number | null;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {title}
        {typeof counter === "number" ? (
          <span className="font-mono text-[10px] text-foreground/70">
            {counter}
          </span>
        ) : null}
      </h3>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function Indicator({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-foreground">{title}</span>
      {body !== undefined ? (
        <span className="text-muted-foreground">{body}</span>
      ) : null}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}
