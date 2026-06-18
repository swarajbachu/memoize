import { Folder01Icon, GitBranchIcon } from "@hugeicons-pro/core-bulk-rounded";
import { HugeiconsIcon } from "@hugeicons/react";

import { formatShortcut } from "../lib/shortcuts.ts";
import { useActiveContext } from "../store/active-workspace.ts";
import { gitStatusKey, useGitStatusStore } from "../store/git-status.ts";
import { prDetailsKey, usePrDetailsStore } from "../store/pr-details.ts";
import { prStateKey, usePrStateStore } from "../store/pr-state.ts";
import { useUiStore } from "../store/ui.ts";
import { useWorkspaceStore } from "../store/workspace.ts";
import { EMPTY_WORKTREES, useWorktreesStore } from "../store/worktrees.ts";
import { BrowserPane } from "./browser-pane.tsx";
import { DiffPane } from "./diff-pane.tsx";
import { FileTree } from "./file-tree.tsx";
import { PrPane } from "./pr-pane.tsx";
import { PokemonRarityText, PokemonSprite } from "./pokemon.tsx";
import { RightPaneHeader } from "./right-pane-header.tsx";
import { TerminalPane } from "./terminal-pane.tsx";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip.tsx";

/**
 * Right-pane shell with four tabs: file tree, terminal, changes
 * (working-tree + commit composer), and PR detail. All children mount once
 * and stay mounted (`hidden` toggling) so switching tabs preserves terminal
 * scrollback, file-tree expansion, and any in-flight PR fetch.
 */
export function RightPane() {
  const ctx = useActiveContext();
  const folders = useWorkspaceStore((s) => s.folders);
  const selectedFolderId = ctx.status === "ready" ? ctx.folderId : null;
  const worktreeId = ctx.status === "ready" ? ctx.worktreeId : null;
  const selected = selectedFolderId
    ? (folders.find((f) => f.id === selectedFolderId) ?? null)
    : null;
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
  const tab = useUiStore((s) => s.activeRightTab);
  const setTab = useUiStore((s) => s.setActiveRightTab);

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
          shortcut={formatShortcut("toggle-terminal")}
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
        <TabButton
          active={tab === "browser"}
          onClick={() => setTab("browser")}
          label="Browser"
          tooltip="In-app browser for dev servers and references"
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
              <ActiveWorkspaceChip />
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
            <div hidden={tab !== "browser"} className="min-h-0 flex-1">
              <BrowserPane />
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
 * looking at. Reads the canonical active context so it can never disagree
 * with the terminal, top-bar branch, or composer chip.
 */
function ActiveWorkspaceChip() {
  const ctx = useActiveContext();
  const worktree = useWorktreesStore((s) => {
    if (ctx.status !== "ready" || ctx.worktreeId === null) return null;
    const list = s.byProject[ctx.folderId] ?? EMPTY_WORKTREES;
    return list.find((w) => w.id === ctx.worktreeId) ?? null;
  });
  if (ctx.status !== "ready") return null;
  const onWorktree = ctx.rootKind === "worktree";
  const icon = onWorktree ? GitBranchIcon : Folder01Icon;
  const label = onWorktree ? (worktree?.name ?? "Worktree") : "Main checkout";
  const sub = onWorktree ? (worktree?.branch ?? null) : null;
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground">
      {worktree?.pokemon ? (
        <PokemonSprite pokemon={worktree.pokemon} className="size-4" />
      ) : (
        <HugeiconsIcon icon={icon} className="size-3.5 shrink-0 opacity-70" />
      )}
      <span className="truncate font-medium text-foreground/80">{label}</span>
      {worktree?.pokemon ? (
        <PokemonRarityText
          rarity={worktree.pokemon.rarity}
          className="shrink-0 text-[10px]"
        />
      ) : null}
      {sub !== null ? (
        <span className="truncate font-mono opacity-70">· {sub}</span>
      ) : null}
      {ctx.worktreePending ? (
        <span className="shrink-0 text-amber-300">syncing…</span>
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
  pr: {
    state: string;
    isDraft: boolean;
    checks: string;
    mergeable: string;
  } | null,
  details: {
    comments: ReadonlyArray<unknown>;
    reviews: ReadonlyArray<unknown>;
    checkRuns: ReadonlyArray<{ conclusion: string | null; status: string }>;
  } | null,
): React.ReactNode {
  if (pr === null || pr.state === "none") return null;
  if (pr.state === "open" && !pr.isDraft) {
    if (pr.mergeable === "conflicting") {
      return (
        <span
          className="flex items-center text-rose-300"
          title="Merge conflicts"
        >
          <span className="size-2 rounded-full bg-rose-400" />
        </span>
      );
    }
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
  shortcut,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tooltip: string;
  badge?: React.ReactNode;
  shortcut?: string;
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
      <TooltipPopup>
        {shortcut !== undefined && shortcut !== "" ? (
          <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
            <span>{tooltip}</span>
            <kbd className="font-sans text-muted-foreground/80">{shortcut}</kbd>
          </span>
        ) : (
          tooltip
        )}
      </TooltipPopup>
    </Tooltip>
  );
}
