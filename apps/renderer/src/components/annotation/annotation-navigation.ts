import { useCallback } from "react";

import {
  isElementAnnotation,
  type Annotation,
  type FolderId,
  type WorktreeId,
} from "@zuse/wire";

import { useUiStore } from "~/store/ui";
import { useWorkspaceStore } from "~/store/workspace";
import { useWorktreesStore } from "~/store/worktrees";
import { useFileChipContext } from "../file-chip.tsx";

const basename = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
};

export const useRevealAnnotation = (opts?: {
  readonly folderId?: FolderId | null;
  readonly worktreeId?: WorktreeId | null;
}): ((annotation: Annotation) => void) => {
  const context = useFileChipContext();
  const folderId = opts?.folderId ?? context.folderId;
  const worktreeId = opts?.worktreeId ?? context.worktreeId;
  const openFileInTab = useUiStore((s) => s.openFileInTab);
  const revealAnnotation = useUiStore((s) => s.revealAnnotation);
  const folderPath = useWorkspaceStore((s) => {
    if (folderId === null) return null;
    return s.folders.find((f) => f.id === folderId)?.path ?? null;
  });
  const worktreePath = useWorktreesStore((s) => {
    if (folderId === null || worktreeId === null) return null;
    const list = s.byProject[folderId] ?? [];
    return list.find((w) => w.id === worktreeId)?.path ?? null;
  });

  return useCallback(
    (annotation: Annotation) => {
      // Element annotations live inside a rendered HTML artifact in the chat,
      // not a file — there's nothing to open in the editor. (Scrolling the
      // chat back to the source artifact is a future enhancement.)
      if (isElementAnnotation(annotation)) return;
      const rootPath = worktreePath ?? folderPath;
      const resolvedAbs =
        annotation.absPath ||
        (annotation.relPath.startsWith("/") ? annotation.relPath : null);
      const insideWorkspace =
        rootPath !== null &&
        resolvedAbs !== null &&
        (resolvedAbs === rootPath || resolvedAbs.startsWith(`${rootPath}/`));
      const workspaceRelPath =
        insideWorkspace && resolvedAbs !== null && rootPath !== null
          ? resolvedAbs.slice(rootPath.length + 1)
          : !annotation.relPath.startsWith("/")
            ? annotation.relPath
            : null;
      const externalAbs =
        resolvedAbs !== null && !insideWorkspace ? resolvedAbs : null;

      if (folderId !== null && workspaceRelPath !== null) {
        openFileInTab({
          kind: "text",
          folderId,
          path: workspaceRelPath,
          name: basename(workspaceRelPath),
          worktreeId,
          view: "edit",
        });
        revealAnnotation({
          ...annotation,
          relPath: workspaceRelPath,
        });
        return;
      }

      if (externalAbs !== null) {
        openFileInTab({
          kind: "external",
          absPath: externalAbs,
          name: basename(externalAbs),
        });
        revealAnnotation(annotation);
      }
    },
    [
      folderId,
      folderPath,
      openFileInTab,
      revealAnnotation,
      worktreeId,
      worktreePath,
    ],
  );
};
