import type { FolderId, WorktreeId } from "@forkzero/wire";

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

/** WorktreeId of the selected session, or null when on main checkout. */
export const useActiveWorktreeId = (): WorktreeId | null => {
  const selectedSessionId = useSessionsStore((s) => s.selectedSessionId);
  const sessionsByProject = useSessionsStore((s) => s.sessionsByProject);
  if (selectedSessionId === null) return null;
  for (const list of Object.values(sessionsByProject)) {
    for (const sess of list) {
      if (sess.id === selectedSessionId) return sess.worktreeId;
    }
  }
  return null;
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
  const worktreeId = useActiveWorktreeId();
  const worktree = useWorktreesStore((s) => {
    if (worktreeId === null) return null;
    const list = s.byProject[folderId] ?? [];
    return list.find((w) => w.id === worktreeId) ?? null;
  });
  if (folder === null) return null;
  if (worktreeId === null || worktree === null) return folder.path;
  return worktree.path;
};
