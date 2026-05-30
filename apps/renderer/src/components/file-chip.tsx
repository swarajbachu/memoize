import { createContext, useContext } from "react";

import type { FolderId, WorktreeId } from "@memoize/wire";

import { cn } from "~/lib/utils";
import { useUiStore, type FileView } from "~/store/ui";
import { useWorkspaceStore } from "~/store/workspace";
import { useWorktreesStore } from "~/store/worktrees";
import { FileIcon } from "./file-icon.tsx";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip.tsx";

/**
 * Implicit workspace coordinates for the chips rendered inside a chat
 * surface. ChatView / ChatComposer wrap their subtree with this provider so
 * FileChip and FileBadge can open files in the editor tab without every
 * intermediate component threading the folder/worktree pair down by prop.
 */
const FileChipContext = createContext<{
  readonly folderId: FolderId | null;
  readonly worktreeId: WorktreeId | null;
}>({ folderId: null, worktreeId: null });

export function FileChipProvider({
  folderId,
  worktreeId,
  children,
}: {
  folderId: FolderId | null;
  worktreeId: WorktreeId | null;
  children: React.ReactNode;
}) {
  return (
    <FileChipContext.Provider value={{ folderId, worktreeId }}>
      {children}
    </FileChipContext.Provider>
  );
}

export const useFileChipContext = () => useContext(FileChipContext);

const basename = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
};

/**
 * Pill that pairs a file-type icon with a filename, plus a tooltip and
 * click-to-open. Single source of truth for every file/dir reference we
 * render — tool rows, chat-bubble file refs, composer chips. Clicking opens
 * the file in the right pane's file editor via `useUiStore.openFileInTab`.
 *
 * Directories render the same chip but with no click action — the file
 * editor doesn't preview directories.
 */
export function FileChip({
  relPath,
  absPath,
  kind = "file",
  view,
  className,
}: {
  /** Path shown in the tooltip + used as the chip label (basename only). */
  readonly relPath: string;
  /**
   * Absolute path the editor will read. Optional — tool rows usually only
   * carry the absolute path the agent saw, so we fall back to it as the
   * `relPath` for display when the workspace-relative path isn't known.
   */
  readonly absPath?: string;
  readonly kind?: "file" | "directory";
  /**
   * Which body the file viewer should open with. Tool rows for Edit/Write/
   * MultiEdit pass `"diff"` so clicking the file goes straight to the
   * side-by-side diff; everything else defaults to the CodeMirror editor.
   */
  readonly view?: FileView;
  readonly className?: string;
}) {
  const { folderId, worktreeId } = useFileChipContext();
  const openFileInTab = useUiStore((s) => s.openFileInTab);
  const folderPath = useWorkspaceStore((s) => {
    if (folderId === null) return null;
    return s.folders.find((f) => f.id === folderId)?.path ?? null;
  });
  const worktreePath = useWorktreesStore((s) => {
    if (folderId === null || worktreeId === null) return null;
    const list = s.byProject[folderId] ?? [];
    return list.find((w) => w.id === worktreeId)?.path ?? null;
  });

  const name = basename(relPath);

  // Resolve the chip's effective root + workspace-relative path. Tool rows
  // sometimes carry an absolute path from another workspace (Conductor
  // side-checkouts, sibling repos); opening those would trigger
  // `FsPathOutsideError` on the server. Detect early, surface as a
  // non-clickable chip with an explanatory tooltip.
  const rootPath = worktreePath ?? folderPath;
  const looksAbsolute = absPath !== undefined || relPath.startsWith("/");
  const resolvedAbs = absPath ?? (relPath.startsWith("/") ? relPath : null);
  const insideWorkspace =
    rootPath !== null &&
    resolvedAbs !== null &&
    (resolvedAbs === rootPath || resolvedAbs.startsWith(`${rootPath}/`));
  const workspaceRelPath =
    insideWorkspace && resolvedAbs !== null && rootPath !== null
      ? resolvedAbs.slice(rootPath.length + 1)
      : !looksAbsolute
        ? relPath
        : null;

  // A file outside the workspace (or with no workspace context at all) still
  // opens — via the external-file path, by absolute path. Plan/markdown files
  // the agent writes elsewhere on disk land here.
  const externalAbs =
    kind === "file" && resolvedAbs !== null && !insideWorkspace
      ? resolvedAbs
      : null;
  const canOpenInWorkspace =
    kind === "file" && folderId !== null && workspaceRelPath !== null;
  const canOpen = canOpenInWorkspace || externalAbs !== null;

  const tooltip =
    kind === "directory" ? `View ${relPath}` : canOpen ? `Open ${relPath}` : relPath;

  const onClick = () => {
    if (!canOpen) return;
    if (canOpenInWorkspace && folderId !== null && workspaceRelPath !== null) {
      openFileInTab({
        kind: "text",
        folderId,
        path: workspaceRelPath,
        name,
        worktreeId,
        view,
      });
      return;
    }
    if (externalAbs !== null) {
      openFileInTab({ kind: "external", absPath: externalAbs, name });
    }
  };

  // Rendered as a `<span role="button">` rather than a real `<button>` so the
  // chip can sit inside parent buttons (e.g. ExpandableIconRow's collapsed
  // header). Nested <button> elements are invalid HTML and React throws a
  // hydration warning. We still wire keyboard activation (Enter / Space) so
  // a11y matches the button affordance.
  const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (!canOpen) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    }
  };
  const onChipClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    if (!canOpen) return;
    // Stop the click from bubbling to a wrapping button (Read row's
    // accordion toggle) — clicking the chip should open the file, not
    // expand the row.
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role={canOpen ? "button" : undefined}
            tabIndex={canOpen ? 0 : undefined}
            aria-disabled={!canOpen}
            onClick={canOpen ? onChipClick : undefined}
            onKeyDown={canOpen ? onKeyDown : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-border/60 px-1.5 py-0.5 text-[11px] text-foreground/90 transition-colors",
              canOpen
                ? "cursor-pointer hover:bg-muted/60 hover:text-foreground"
                : "cursor-default",
              className,
            )}
          >
            <FileIcon
              name={name}
              kind={kind}
              className="inline-flex size-3.5 shrink-0 items-center justify-center"
            />
            <span className="max-w-[28ch] truncate font-mono">{name}</span>
          </span>
        }
      />
      <TooltipPopup>{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
