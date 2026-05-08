import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { FolderId } from "@memoize/wire";

import { useActiveWorktreeId } from "~/store/active-workspace.ts";
import { useUiStore } from "~/store/ui.ts";

interface HoverState {
  readonly relPath: string;
  readonly absPath: string;
  readonly entryKind: "file" | "directory";
  readonly rect: DOMRect;
}

const HIDE_DELAY_MS = 150;

const basename = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
};

/**
 * Renders a small floating popup over file chips when the user hovers them.
 * Reads chip metadata from the `data-rel-path` / `data-abs-path` /
 * `data-entry-kind` attributes the CodeMirror widget writes onto its DOM.
 *
 * The popup itself is part of the React tree, so a click on its "Open in
 * editor" button bubbles cleanly into `useUiStore.openFileInTab` — no need
 * to mount a portal inside the CM widget.
 */
export function FileChipHover({
  hostRef,
  projectId,
}: {
  hostRef: React.RefObject<HTMLElement | null>;
  projectId: FolderId;
}) {
  const [state, setState] = useState<HoverState | null>(null);
  const hideTimer = useRef<number | null>(null);
  const openFileInTab = useUiStore((s) => s.openFileInTab);
  const worktreeId = useActiveWorktreeId();

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const cancelHide = (): void => {
      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target === null) return;
      const chip = target.closest<HTMLElement>('.fz-chip[data-kind="file"]');
      if (chip === null) return;
      const relPath = chip.dataset.relPath;
      const absPath = chip.dataset.absPath;
      const entryKind = chip.dataset.entryKind;
      if (relPath === undefined || absPath === undefined) return;
      cancelHide();
      setState({
        relPath,
        absPath,
        entryKind: entryKind === "directory" ? "directory" : "file",
        rect: chip.getBoundingClientRect(),
      });
    };

    const onOut = (e: MouseEvent) => {
      const next = e.relatedTarget as Node | null;
      // If we're moving onto the popup, keep it open.
      if (next instanceof HTMLElement && next.closest(".fz-chip-hover")) return;
      cancelHide();
      hideTimer.current = window.setTimeout(
        () => setState(null),
        HIDE_DELAY_MS,
      );
    };

    host.addEventListener("mouseover", onOver);
    host.addEventListener("mouseout", onOut);
    return () => {
      host.removeEventListener("mouseover", onOver);
      host.removeEventListener("mouseout", onOut);
      cancelHide();
    };
  }, [hostRef]);

  if (state === null) return null;

  const { rect, relPath, absPath, entryKind } = state;
  // Position above the chip if there's room; otherwise below.
  const POPUP_HEIGHT = 96;
  const aboveTop = rect.top - POPUP_HEIGHT - 8;
  const placeAbove = aboveTop > 8;
  const top = placeAbove ? aboveTop : rect.bottom + 8;
  const left = Math.max(8, Math.min(window.innerWidth - 360, rect.left));

  return (
    <div
      className="fz-chip-hover fixed z-[60] w-80 rounded-lg border border-border/60 bg-popover p-2 text-xs shadow-lg"
      style={{ top, left }}
      onMouseEnter={() => {
        if (hideTimer.current !== null) {
          window.clearTimeout(hideTimer.current);
          hideTimer.current = null;
        }
      }}
      onMouseLeave={() => setState(null)}
    >
      <div className="mb-1 truncate font-medium text-foreground">
        {basename(relPath)}
      </div>
      <div className="mb-2 truncate font-mono text-[10.5px] text-muted-foreground">
        {absPath}
      </div>
      {entryKind === "file" && (
        <button
          type="button"
          onClick={() => {
            openFileInTab({
              folderId: projectId,
              path: absPath,
              name: basename(relPath),
              worktreeId,
            });
            setState(null);
          }}
          className="flex items-center gap-1.5 rounded-md bg-accent/40 px-2 py-1 text-xs text-accent-foreground hover:bg-accent/60"
        >
          <ExternalLink className="size-3" />
          Open in editor
        </button>
      )}
    </div>
  );
}
