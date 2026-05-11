import type { FolderId, WorktreeId } from "@memoize/wire";

import { useSessionsStore } from "./sessions.ts";
import { useWorkspaceStore } from "./workspace.ts";
import { useWorktreesStore } from "./worktrees.ts";

/**
 * Cross-store selectors that surface the *effective* root for the surfaces
 * that should follow the selected session's worktree (file tree, file
 * editor, terminal, top-bar branch, git status). When no session is selected
 * or the session is on the main checkout, these fall back to the project's
 * `folder.path`.
 *
 * Kept in their own module so any store that wants to read these doesn't
 * pull in the others' types as a side effect.
 */

/**
 * WorktreeId of the given project's currently-selected session, or null when
 * that project's selection is on main checkout. Scoped per-project so
 * switching projects deterministically swaps every panel that reads it
 * (file tree, changes, PR, terminal, top-bar branch) to the new project's
 * own active context — no cross-project session lookup.
 */
export const useActiveWorktreeId = (
  folderId: FolderId | null,
): WorktreeId | null => {
  const sessionId = useSessionsStore((s) =>
    folderId !== null ? s.selectedSessionByProject[folderId] ?? null : null,
  );
  const sessions = useSessionsStore((s) =>
    folderId !== null ? s.sessionsByProject[folderId] ?? null : null,
  );
  if (sessionId === null || sessions === null) return null;
  const found = sessions.find((sess) => sess.id === sessionId);
  return found?.worktreeId ?? null;
};

/**
 * Effective workspace root path for the given project. When the selected
 * session has a worktree under this project, returns the worktree's path;
 * otherwise returns the folder's path. Returns null only when the folder
 * itself isn't loaded yet.
 */
export const useActiveWorkspaceRoot = (folderId: FolderId): string | null => {
  const folder = useWorkspaceStore((s) =>
    s.folders.find((f) => f.id === folderId) ?? null,
  );
  const worktreeId = useActiveWorktreeId(folderId);
  const worktree = useWorktreesStore((s) => {
    if (worktreeId === null) return null;
    const list = s.byProject[folderId] ?? [];
    return list.find((w) => w.id === worktreeId) ?? null;
  });
  if (folder === null) return null;
  if (worktreeId === null || worktree === null) return folder.path;
  return worktree.path;
};
