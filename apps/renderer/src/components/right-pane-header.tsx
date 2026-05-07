/**
 * Header strip above the Files / Terminal tab row. Frames the right pane and
 * gives future per-tree actions (refresh, new file, reveal-in-finder) a home
 * — the workflow buttons (commit / PR / merge) live in the top bar instead
 * because they're driven by global state, not tree state.
 */
export function RightPaneHeader({ projectName }: { projectName: string }) {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border px-2 text-[11px]">
      <span
        className="truncate font-medium text-muted-foreground"
        title={projectName}
      >
        {projectName}
      </span>
    </div>
  );
}
