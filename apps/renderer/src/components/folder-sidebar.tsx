import { Folder as FolderIcon, Plus, X } from "lucide-react";
import { useEffect } from "react";

import { useWorkspaceStore } from "../store/workspace.ts";

export function FolderSidebar() {
  const folders = useWorkspaceStore((s) => s.folders);
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const error = useWorkspaceStore((s) => s.error);
  const loading = useWorkspaceStore((s) => s.loading);
  const load = useWorkspaceStore((s) => s.load);
  const add = useWorkspaceStore((s) => s.add);
  const remove = useWorkspaceStore((s) => s.remove);
  const select = useWorkspaceStore((s) => s.select);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <aside className="flex flex-col bg-[var(--color-bg-elevated)]">
      <div className="flex h-9 items-center justify-between px-3 text-xs uppercase tracking-wide text-[var(--color-fg-muted)] [-webkit-app-region:drag]">
        <span className="ml-16 select-none">forkzero</span>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-xs text-[var(--color-fg-muted)]">
        <span>Folders</span>
        <button
          type="button"
          onClick={() => void add()}
          className="rounded p-1 hover:bg-[var(--color-border)]"
          aria-label="Add folder"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {error !== null && (
        <p className="mx-3 mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-0.5 overflow-y-auto px-1 pb-2">
        {folders.length === 0 && !loading && (
          <li className="px-3 py-4 text-center text-xs text-[var(--color-fg-muted)]">
            No folders yet. Click + to add one.
          </li>
        )}
        {folders.map((folder) => {
          const isSelected = folder.id === selectedFolderId;
          return (
            <li key={folder.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => void select(folder.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void select(folder.id);
                  }
                }}
                className={`group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 ${
                  isSelected
                    ? "bg-[var(--color-border)]"
                    : "hover:bg-[var(--color-border)]/60"
                }`}
              >
                <FolderIcon
                  className={`size-3.5 shrink-0 ${
                    isSelected
                      ? "text-[var(--color-fg)]"
                      : "text-[var(--color-fg-muted)]"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{folder.name}</div>
                  <div
                    className="truncate text-[11px] text-[var(--color-fg-muted)]"
                    title={folder.path}
                  >
                    {folder.path}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(folder.id);
                  }}
                  className="rounded p-0.5 text-[var(--color-fg-muted)] opacity-0 hover:bg-[var(--color-border)] hover:text-[var(--color-fg)] group-hover:opacity-100"
                  aria-label={`Remove ${folder.name}`}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
