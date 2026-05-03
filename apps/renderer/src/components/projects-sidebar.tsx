import { Effect } from "effect";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";


import { useEffect, useMemo, useState } from "react";

import {
  defaultModelFor,
  type FolderId,
  type GitOriginInfo,
  type ProviderId,
  type Session,
} from "@forkzero/wire";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "~/components/ui/menu";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "~/components/ui/popover";
import { getRpcClient } from "../lib/rpc-client.ts";
import { useProvidersStore } from "../store/providers.ts";
import { useSessionsStore } from "../store/sessions.ts";
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

const formatRelative = (iso: Date): string => {
  const ms = Date.now() - iso.getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
};

export function ProjectsSidebar() {
  const folders = useWorkspaceStore((s) => s.folders);
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const error = useWorkspaceStore((s) => s.error);
  const loading = useWorkspaceStore((s) => s.loading);
  const load = useWorkspaceStore((s) => s.load);
  const add = useWorkspaceStore((s) => s.add);
  const remove = useWorkspaceStore((s) => s.remove);
  const select = useWorkspaceStore((s) => s.select);

  const sessionsByProject = useSessionsStore((s) => s.sessionsByProject);
  const showArchivedByProject = useSessionsStore(
    (s) => s.showArchivedByProject,
  );
  const sessionsError = useSessionsStore((s) => s.error);
  const hydrateSessions = useSessionsStore((s) => s.hydrate);
  const toggleShowArchived = useSessionsStore((s) => s.toggleShowArchived);

  const [origins, setOrigins] = useState<Record<string, GitOriginInfo | null>>(
    {},
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-expand the selected project so newly opened workspaces immediately
  // reveal their session list.
  useEffect(() => {
    if (selectedFolderId === null) return;
    setExpanded((prev) =>
      prev[selectedFolderId] ? prev : { ...prev, [selectedFolderId]: true },
    );
  }, [selectedFolderId]);

  // Lazy-hydrate sessions for any expanded project that hasn't been loaded.
  useEffect(() => {
    for (const folder of folders) {
      if (expanded[folder.id] && !(folder.id in sessionsByProject)) {
        void hydrateSessions(folder.id);
      }
    }
  }, [expanded, folders, sessionsByProject, hydrateSessions]);

  // Resolve git origin for avatar rendering — same pattern as the old folder
  // sidebar. Lookups that fail stay `null` and the row falls back to initials.
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

  const onAddProject = () => void add();
  const onToggleExpanded = (id: FolderId) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar/80 backdrop-blur-3xl text-sidebar-foreground">
      <div className="flex h-9 items-center justify-between px-3 text-xs uppercase tracking-wide text-muted-foreground [-webkit-app-region:drag]">
        <span className="ml-16 select-none">forkzero</span>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
        <span>Projects</span>
        <button
          type="button"
          onClick={onAddProject}
          className="rounded p-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Add project"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {(error ?? sessionsError) !== null && (
        <p className="mx-3 mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          {error ?? sessionsError}
        </p>
      )}

      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-2">
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
            isExpanded={expanded[folder.id] === true}
            sessions={sessionsByProject[folder.id] ?? []}
            showArchived={showArchivedByProject[folder.id] === true}
            onSelect={() => void select(folder.id)}
            onToggleExpanded={() => onToggleExpanded(folder.id)}
            onRemove={() => void remove(folder.id)}
            onToggleShowArchived={() => toggleShowArchived(folder.id)}
          />
        ))}
      </ul>
      <SidebarFooter />
    </aside>
  );
}

function SidebarFooter() {
  const setCredentialsOpen = useProvidersStore((s) => s.setCredentialsOpen);
  return (
    <div className="border-t border-sidebar-border/40 px-2 py-1.5">
      <button
        type="button"
        onClick={() => setCredentialsOpen(true)}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        title="API key settings (advanced)"
      >
        <Settings className="size-3.5" />
        <span>Settings</span>
      </button>
    </div>
  );
}

function ProjectRow({
  id,
  name,
  path,
  origin,
  isSelected,
  isExpanded,
  sessions,
  showArchived,
  onSelect,
  onToggleExpanded,
  onRemove,
  onToggleShowArchived,
}: {
  id: FolderId;
  name: string;
  path: string;
  origin: GitOriginInfo | null;
  isSelected: boolean;
  isExpanded: boolean;
  sessions: ReadonlyArray<Session>;
  showArchived: boolean;
  onSelect: () => void;
  onToggleExpanded: () => void;
  onRemove: () => void;
  onToggleShowArchived: () => void;
}) {
  const displayName = origin?.repo ?? name;
  const avatarUrl = avatarUrlFor(origin);
  const fallbackText = initialsOf(origin?.owner ?? name);

  const visibleSessions = useMemo(
    () =>
      showArchived
        ? sessions
        : sessions.filter((s) => s.archivedAt === null),
    [sessions, showArchived],
  );
  const archivedCount = sessions.filter((s) => s.archivedAt !== null).length;

  const Chevron = isExpanded ? ChevronDown : ChevronRight;

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
        className={`group flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1.5 transition-colors ${
          isSelected
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/60"
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpanded();
          }}
          className="rounded p-0.5 text-muted-foreground hover:text-sidebar-accent-foreground"
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          <Chevron className="size-3.5" />
        </button>
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
        <NewSessionButton projectId={id} />
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

      {isExpanded && (
        <div className="ml-7 flex flex-col gap-0.5 pb-1">
          {visibleSessions.length === 0 && (
            <p className="px-2 py-1 text-[11px] text-muted-foreground">
              No sessions yet.
            </p>
          )}
          {visibleSessions.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={onToggleShowArchived}
              className="mt-0.5 self-start rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              {showArchived
                ? `Hide archived (${archivedCount})`
                : `Show archived (${archivedCount})`}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// One-line login hint per provider — the user runs this in their terminal
// and forkzero picks up the credentials automatically on next refresh.
const LOGIN_HINT: Record<ProviderId, string> = {
  claude: "Run `claude /login` in your terminal",
  codex: "Run `codex login` in your terminal",
};

function NewSessionButton({ projectId }: { projectId: FolderId }) {
  const availability = useProvidersStore((s) => s.availability);
  const refresh = useProvidersStore((s) => s.refresh);
  const create = useSessionsStore((s) => s.create);
  const [open, setOpen] = useState(false);

  // Refresh availability every time the popover opens — catches the user
  // running `claude /login` in their terminal without needing to restart.
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const onPick = (providerId: ProviderId) => {
    setOpen(false);
    // New sessions start on the provider's default model; users swap it from
    // the chat composer's model picker.
    void create(projectId, providerId, defaultModelFor(providerId));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={(e) => {
          e.stopPropagation();
        }}
        className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-hover:opacity-100 data-[popup-open]:opacity-100"
        aria-label="New session"
        title="New session"
      >
        <Plus className="size-3.5" />
      </PopoverTrigger>
      <PopoverPopup side="right" align="start" className="w-64">
        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          New session
        </div>
        {availability.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            Loading providers…
          </p>
        )}
        {availability.map((avail) => {
          const ready = avail.cliLoggedIn || avail.hasApiKey;
          const hint = !avail.cliInstalled
            ? `Install the \`${avail.providerId}\` CLI`
            : !ready
              ? LOGIN_HINT[avail.providerId]
              : null;
          return (
            <button
              key={avail.providerId}
              type="button"
              disabled={!ready}
              onClick={() => {
                if (ready) onPick(avail.providerId);
              }}
              className={`flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-xs ${
                ready
                  ? "hover:bg-sidebar-accent"
                  : "cursor-not-allowed opacity-60"
              }`}
            >
              <div className="flex w-full items-center gap-2">
                <Sparkles className="size-3.5" />
                <span className="flex-1 truncate">{avail.displayName}</span>
                <span className="text-[10px] text-muted-foreground">
                  {ready ? "ready" : "needs login"}
                </span>
              </div>
              {hint !== null && (
                <span className="ml-5 text-[10px] text-muted-foreground">
                  {hint}
                </span>
              )}
            </button>
          );
        })}
      </PopoverPopup>
    </Popover>
  );
}

function SessionRow({ session }: { session: Session }) {
  const selectedSessionId = useSessionsStore((s) => s.selectedSessionId);
  const select = useSessionsStore((s) => s.select);
  const rename = useSessionsStore((s) => s.rename);
  const archive = useSessionsStore((s) => s.archive);
  const unarchive = useSessionsStore((s) => s.unarchive);
  const remove = useSessionsStore((s) => s.remove);
  const isSelected = selectedSessionId === session.id;
  const isArchived = session.archivedAt !== null;

  const onRename = () => {
    const next = window.prompt("Rename session", session.title);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length === 0 || trimmed === session.title) return;
    void rename(session.id, trimmed);
  };

  const onDelete = () => {
    if (!window.confirm(`Delete "${session.title}"? This can't be undone.`))
      return;
    void remove(session.id);
  };

  return (
    <Menu>
      <div
        role="button"
        tabIndex={0}
        onClick={() => select(session.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select(session.id);
          }
        }}
        className={`group flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs transition-colors ${
          isSelected
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : isArchived
              ? "text-muted-foreground hover:bg-sidebar-accent/40"
              : "hover:bg-sidebar-accent/60"
        }`}
        title={`${session.providerId} · ${session.model}`}
      >
        <MessageSquare className="size-3 shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate">{session.title}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatRelative(session.updatedAt)}
        </span>
        <MenuTrigger
          onClick={(e) => e.stopPropagation()}
          className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-sidebar-accent-foreground group-hover:opacity-100 data-[popup-open]:opacity-100"
          aria-label={`Actions for ${session.title}`}
        >
          ⋯
        </MenuTrigger>
      </div>
      <MenuPopup
        align="end"
        className="min-w-[160px]"
      >
          <MenuItem
            onClick={onRename}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-sidebar-accent"
          >
            <Pencil className="size-3.5" />
            Rename
          </MenuItem>
          {isArchived ? (
            <MenuItem
              onClick={() => void unarchive(session.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-sidebar-accent"
            >
              <ArchiveRestore className="size-3.5" />
              Unarchive
            </MenuItem>
          ) : (
            <MenuItem
              onClick={() => void archive(session.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-sidebar-accent"
            >
              <Archive className="size-3.5" />
              Archive
            </MenuItem>
          )}
          <MenuItem
            onClick={onDelete}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/20"
          >
            <Trash2 className="size-3.5" />
            Delete
          </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
