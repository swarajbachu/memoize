import { HugeiconsIcon } from "@hugeicons/react";
import { Folder01Icon, GitBranchIcon } from "@hugeicons-pro/core-bulk-rounded";

import { useActiveContext } from "../store/active-workspace.ts";
import { gitStatusKey, useGitStatusStore } from "../store/git-status.ts";

/**
 * Compact "you are here" strip showing the active project's tail path and
 * the current branch label. Reads `useActiveContext()` so it stays in
 * lockstep with the terminal cwd, file-tree root, top-bar branch, and any
 * other surface that follows the user's selection.
 *
 * Renders `null` while no folder is selected — the chat composer is hidden
 * in that state anyway, so the chip would have no anchor.
 */
export function ActiveLocationChip() {
  const ctx = useActiveContext();
  const branch = useGitStatusStore((s) => {
    if (ctx.status !== "ready") return null;
    return (
      s.byKey[gitStatusKey(ctx.folderId, ctx.worktreeId)]?.branch ?? null
    );
  });

  if (ctx.status !== "ready") return null;

  const tail = tailPathSegments(ctx.rootPath, 2);
  const onWorktree = ctx.rootKind === "worktree";
  const icon = onWorktree ? GitBranchIcon : Folder01Icon;

  return (
    <div className="flex items-center gap-1.5 px-1 pb-1 text-[11px] text-muted-foreground">
      <HugeiconsIcon icon={icon} className="size-3 shrink-0 opacity-70" />
      <span className="truncate font-mono opacity-80" title={ctx.rootPath}>
        {tail}
      </span>
      {branch !== null ? (
        <>
          <span className="opacity-40">·</span>
          <span className="truncate font-medium text-foreground/70">
            {branch}
          </span>
        </>
      ) : null}
      {onWorktree ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-accent-foreground/60"
          title="Worktree"
        />
      ) : null}
      {ctx.worktreePending ? (
        <span className="shrink-0 text-amber-300">syncing…</span>
      ) : null}
    </div>
  );
}

/** Returns the last `count` segments of an absolute path, joined with `/`. */
const tailPathSegments = (path: string, count: number): string => {
  const parts = path.split("/").filter((p) => p.length > 0);
  if (parts.length <= count) return path;
  return parts.slice(-count).join("/");
};
