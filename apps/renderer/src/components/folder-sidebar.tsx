import { Effect } from "effect";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { FolderId, GitOriginInfo } from "@forkzero/wire";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { getRpcClient } from "../lib/rpc-client.ts";
import { useWorkspaceStore } from "../store/workspace.ts";

const initialsOf = (name: string): string => {
  const parts = name.split(/[-_.\s]+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2);
  return letters.toUpperCase();
};

// GitHub serves owner/org avatars at this path; works for users and orgs alike.
// Returns null for non-GitHub remotes so the caller falls back to initials.
const avatarUrlFor = (origin: GitOriginInfo | null): string | null => {
  if (origin === null || origin.host !== "github.com") return null;
  return `https://github.com/${encodeURIComponent(origin.owner)}.png?size=80`;
};

export function FolderSidebar() {
  const folders = useWorkspaceStore((s) => s.folders);
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const error = useWorkspaceStore((s) => s.error);
  const loading = useWorkspaceStore((s) => s.loading);
  const load = useWorkspaceStore((s) => s.load);
  const add = useWorkspaceStore((s) => s.add);
  const remove = useWorkspaceStore((s) => s.remove);
  const select = useWorkspaceStore((s) => s.select);

  // Resolved per-folder origin info, keyed by FolderId. Fetched lazily; missing
  // / failed lookups stay undefined and the row falls back to initials.
  const [origins, setOrigins] = useState<Record<string, GitOriginInfo | null>>(
    {},
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const missing = folders.filter((f) => !(f.id in origins));
    if (missing.length === 0) return;
    void (async () => {
      const client = await getRpcClient();
      for (const folder of missing) {
        try {
          const info = await Effect.runPromise(
            client.git.origin({ folderId: folder.id }),
          );
          if (cancelled) return;
          setOrigins((prev) => ({ ...prev, [folder.id]: info }));
        } catch {
          if (cancelled) return;
          setOrigins((prev) => ({ ...prev, [folder.id]: null }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folders, origins]);

  return (
    <aside className="flex flex-col bg-sidebar/80 backdrop-blur-3xl text-sidebar-foreground">
      <div className="flex h-9 items-center justify-between px-3 text-xs uppercase tracking-wide text-muted-foreground [-webkit-app-region:drag]">
        <span className="ml-16 select-none">forkzero</span>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
        <span>Projects</span>
        <button
          type="button"
          onClick={() => void add()}
          className="rounded p-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Add project"
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
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            No projects yet. Click + to add one.
          </li>
        )}
        {folders.map((folder) => (
          <ProjectRow
            key={folder.id}
            id={folder.id}
            name={folder.name}
            path={folder.path}
            origin={origins[folder.id] ?? null}
            isSelected={folder.id === selectedFolderId}
            onSelect={() => void select(folder.id)}
            onRemove={() => void remove(folder.id)}
          />
        ))}
      </ul>
    </aside>
  );
}

function ProjectRow({
  id: _id,
  name,
  path,
  origin,
  isSelected,
  onSelect,
  onRemove,
}: {
  id: FolderId;
  name: string;
  path: string;
  origin: GitOriginInfo | null;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const displayName = origin?.repo ?? name;
  const avatarUrl = avatarUrlFor(origin);
  const fallbackText = initialsOf(origin?.owner ?? name);
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={`group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition-colors ${
          isSelected
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/60"
        }`}
      >
        <Avatar className="size-6 shrink-0 rounded-md">
          {avatarUrl !== null && (
            <AvatarImage src={avatarUrl} alt={displayName} />
          )}
          <AvatarFallback className="rounded-md text-[10px]">
            {fallbackText}
          </AvatarFallback>
        </Avatar>
        <span
          className="min-w-0 flex-1 truncate text-sm"
          title={origin ? `${origin.owner}/${origin.repo} · ${path}` : path}
        >
          {displayName}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-hover:opacity-100"
          aria-label={`Remove ${displayName}`}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
