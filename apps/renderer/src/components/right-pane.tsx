import { FolderClosed, GitBranch } from "lucide-react";
import { useState } from "react";

import { useActiveWorktreeId } from "../store/active-workspace.ts";
import { gitStatusKey, useGitStatusStore } from "../store/git-status.ts";
import { prDetailsKey, usePrDetailsStore } from "../store/pr-details.ts";
import { prStateKey, usePrStateStore } from "../store/pr-state.ts";
import { useWorkspaceStore } from "../store/workspace.ts";
import { EMPTY_WORKTREES, useWorktreesStore } from "../store/worktrees.ts";
import { DiffPane } from "./diff-pane.tsx";
import { FileTree } from "./file-tree.tsx";
import { PrPane } from "./pr-pane.tsx";
import { RightPaneHeader } from "./right-pane-header.tsx";
import { TerminalPane } from "./terminal-pane.tsx";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip.tsx";

type Tab = "files" | "terminal" | "changes" | "pr";

/**
 * Right-pane shell with four tabs: file tree, terminal, changes
 * (working-tree + commit composer), and PR detail. All children mount once
 * and stay mounted (`hidden` toggling) so switching tabs preserves terminal
 * scrollback, file-tree expansion, and any in-flight PR fetch.
 */
export function RightPane() {
  const folders = useWorkspaceStore((s) => s.folders);
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const selected = selectedFolderId
    ? (folders.find((f) => f.id === selectedFolderId) ?? null)
    : null;
  const worktreeId = useActiveWorktreeId();
  const status = useGitStatusStore((s) =>
    selectedFolderId
      ? (s.byKey[gitStatusKey(selectedFolderId, worktreeId)] ?? null)
      : null,
  );
  const pr = usePrStateStore((s) =>
    selectedFolderId
      ? (s.byKey[prStateKey(selectedFolderId, worktreeId)] ?? null)
      : null,
  );
  const details = usePrDetailsStore((s) =>
    selectedFolderId
      ? (s.byKey[prDetailsKey(selectedFolderId, worktreeId)] ?? null)
      : null,
  );
  const [tab, setTab] = useState<Tab>("files");

  return (
    <aside className="flex h-full min-h-0 w-full flex-col">
      {selected ? <RightPaneHeader projectName={selected.name} /> : null}
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border px-1 text-xs">
        <TabButton
          active={tab === "files"}
          onClick={() => setTab("files")}
          label="Files"
          tooltip="Browse project files"
        />
        <TabButton
          active={tab === "terminal"}
          onClick={() => setTab("terminal")}
          label="Terminal"
          tooltip="Open a terminal in the project root"
        />
        <TabButton
          active={tab === "changes"}
          onClick={() => setTab("changes")}
          label="Changes"
          tooltip="Working-tree changes + commit"
          badge={renderChangesBadge(status?.dirtyFiles ?? 0)}
        />
        <TabButton
          active={tab === "pr"}
          onClick={() => setTab("pr")}
          label="PR"
          tooltip="Pull request title, reviews, comments, and CI"
          badge={renderPrBadge(pr, details)}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {selected === null ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No project selected.
          </p>
        ) : (
          <>
            <div
              hidden={tab !== "files"}
              className="flex min-h-0 flex-1 flex-col"
            >
              <ActiveWorkspaceChip folderId={selected.id} />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <FileTree key={selected.id} folderId={selected.id} />
              </div>
            </div>
            <div hidden={tab !== "terminal"} className="min-h-0 flex-1">
              <TerminalPane />
            </div>
            <div hidden={tab !== "changes"} className="min-h-0 flex-1">
              <DiffPane folderId={selected.id} worktreeId={worktreeId} />
            </div>
            <div hidden={tab !== "pr"} className="min-h-0 flex-1">
              <PrPane folderId={selected.id} worktreeId={worktreeId} />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

/**
 * Strip above the file tree showing whether the current selection is rooted
 * in the project's main checkout or in a worktree. Read-only label — pick a
 * worktree from the chat composer's workspace picker; this chip just makes
 * the active root visible so users don't get confused by what they're
 * looking at.
 */
function ActiveWorkspaceChip({ folderId }: { folderId: string }) {
  const worktreeId = useActiveWorktreeId();
  const worktree = useWorktreesStore((s) => {
    if (worktreeId === null) return null;
    const list = s.byProject[folderId] ?? EMPTY_WORKTREES;
    return list.find((w) => w.id === worktreeId) ?? null;
  });
  const Icon = worktreeId === null ? FolderClosed : GitBranch;
  const label =
    worktreeId === null ? "Main checkout" : (worktree?.name ?? "Worktree");
  const sub =
    worktreeId === null ? null : (worktree?.branch ?? null);
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground">
      <Icon className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate font-medium text-foreground/80">{label}</span>
      {sub !== null ? (
        <span className="truncate font-mono opacity-70">· {sub}</span>
      ) : null}
    </div>
  );
}

function renderChangesBadge(dirtyFiles: number): React.ReactNode {
  if (dirtyFiles === 0) return null;
  return (
    <span className="flex min-w-[1rem] items-center justify-center rounded-full bg-amber-400/20 px-1 font-mono text-[10px] text-amber-200">
      {dirtyFiles}
    </span>
  );
}

function renderPrBadge(
  pr: { state: string; isDraft: boolean; checks: string } | null,
  details:
    | {
        comments: ReadonlyArray<unknown>;
        reviews: ReadonlyArray<unknown>;
        checkRuns: ReadonlyArray<{ conclusion: string | null; status: string }>;
      }
    | null,
): React.ReactNode {
  if (pr === null || pr.state === "none") return null;
  if (pr.state === "open" && !pr.isDraft) {
    if (pr.checks === "failure") {
      const failing =
        details === null
          ? null
          : details.checkRuns.filter(
              (c) =>
                c.conclusion === "failure" ||
                c.conclusion === "cancelled" ||
                c.conclusion === "timed_out" ||
                c.conclusion === "action_required",
            ).length;
      return (
        <span className="flex items-center gap-1 text-rose-300">
          <span className="size-2 rounded-full border border-rose-300" />
          {failing !== null && failing > 0 ? (
            <span className="font-mono text-[10px]">{failing}</span>
          ) : null}
        </span>
      );
    }
  }
  if (details === null) return null;
  const count = details.comments.length + details.reviews.length;
  if (count === 0) return null;
  return (
    <span className="flex min-w-[1rem] items-center justify-center rounded-full bg-muted px-1 font-mono text-[10px] text-foreground">
      {count}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  label,
  tooltip,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tooltip: string;
  badge?: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors ${
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            {label}
            {badge}
          </button>
        }
      />
      <TooltipPopup>{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
