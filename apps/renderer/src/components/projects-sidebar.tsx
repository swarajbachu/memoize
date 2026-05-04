import { Effect } from "effect";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Shield,
  SquarePen,
  Trash2,
} from "lucide-react";

import { Fragment, useEffect, useMemo, useState } from "react";

import {
  defaultModelFor,
  type FolderId,
  type GitOriginInfo,
  type ProviderId,
  type Session,
} from "@forkzero/wire";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import { getRpcClient } from "../lib/rpc-client.ts";
import { usePrStateStore } from "../store/pr-state.ts";
import { useProvidersStore } from "../store/providers.ts";
import { useSessionsStore } from "../store/sessions.ts";
import { useSettingsStore } from "../store/settings.ts";
import { useUiStore } from "../store/ui.ts";
import { useWorkspaceStore } from "../store/workspace.ts";
import { BranchIcon, type BranchState } from "./branch-icon.tsx";
import { PermissionsInspector } from "./permissions-inspector.tsx";
import { ProviderIcon } from "./provider-icons.tsx";

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

  // Lazy-hydrate per-project PR state for every expanded project. The store
  // is keyed by FolderId and dedupes requests so this is safe to over-call.
  const hydratePrState = usePrStateStore((s) => s.hydrate);
  useEffect(() => {
    for (const folder of folders) {
      if (expanded[folder.id]) {
        void hydratePrState(folder.id);
      }
    }
  }, [expanded, folders, hydratePrState]);

  // Resolve git origin for avatar rendering. Lookups that fail stay `null`
  // and the row falls back to initials.
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

      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {folders.length === 0 && !loading && (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            No projects yet. Click + to add one.
          </li>
        )}
        {folders.map((folder) => (
          <ProjectGroup
            key={folder.id}
            id={folder.id}
            name={folder.name}
            path={folder.path}
            origin={origins[folder.id] ?? null}
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
  const setView = useUiStore((s) => s.setView);
  const view = useUiStore((s) => s.view);
  return (
    <div className="border-t border-sidebar-border/40 px-2 py-1.5">
      <button
        type="button"
        onClick={() => setView("settings")}
        className={cn(
          "flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          view === "settings" &&
            "bg-sidebar-accent/60 text-sidebar-accent-foreground",
        )}
        title="Settings"
      >
        <Settings className="size-3.5" />
        <span>Settings</span>
      </button>
    </div>
  );
}

function ProjectGroup({
  id,
  name,
  path,
  origin,
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
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const visibleSessions = useMemo(
    () =>
      showArchived ? sessions : sessions.filter((s) => s.archivedAt === null),
    [sessions, showArchived],
  );
  const archivedCount = sessions.filter((s) => s.archivedAt !== null).length;

  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <Fragment>
      {/* Project header — clicking it toggles expansion + selects the folder.
          Intentionally not highlighted; the active row is the selected
          session, not the project. */}
      <li>
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            onSelect();
            onToggleExpanded();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect();
              onToggleExpanded();
            }
          }}
          className="group flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors hover:bg-sidebar-accent/30 rounded-md"
        >
          {/* Single 20px slot holds avatar (idle) and chevron (hover). Both
              live in the same grid cell so the row never reflows; opacity
              fades between them. motion-reduce drops the transition. */}
          <div className="relative grid size-5 shrink-0 place-items-center">
            <Avatar
              className={cn(
                "col-start-1 row-start-1 size-5 rounded transition-opacity duration-150 ease-out",
                "group-hover:opacity-0 motion-reduce:transition-none",
              )}
            >
              {avatarUrl !== null && (
                <AvatarImage src={avatarUrl} alt={displayName} />
              )}
              <AvatarFallback className="rounded text-[9px]">
                {fallbackText}
              </AvatarFallback>
            </Avatar>
            <Chevron
              aria-hidden="true"
              className={cn(
                "col-start-1 row-start-1 size-3.5 text-muted-foreground opacity-0 transition-opacity duration-150 ease-out",
                "group-hover:opacity-100 motion-reduce:transition-none",
              )}
            />
          </div>
          <span
            className="min-w-0 flex-1 truncate text-sm"
            title={origin ? `${origin.owner}/${origin.repo} · ${path}` : path}
          >
            {displayName}
          </span>
          <ProjectActionsMenu
            displayName={displayName}
            showArchived={showArchived}
            archivedCount={archivedCount}
            onOpenPermissions={() => setInspectorOpen(true)}
            onToggleShowArchived={onToggleShowArchived}
            onRemove={onRemove}
          />
          <NewSessionButton projectId={id} />
        </div>

        <PermissionsInspector
          open={inspectorOpen}
          onOpenChange={setInspectorOpen}
          projectId={id}
          projectName={displayName}
        />
      </li>

      {isExpanded && (
        <>
          {visibleSessions.length === 0 && (
            <li className="px-12 py-1 text-[11px] text-muted-foreground">
              No sessions yet.
            </li>
          )}
          {visibleSessions.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
          {archivedCount > 0 && (
            <li>
              <button
                type="button"
                onClick={onToggleShowArchived}
                className="ml-12 rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              >
                {showArchived
                  ? `Hide archived (${archivedCount})`
                  : `Show archived (${archivedCount})`}
              </button>
            </li>
          )}
        </>
      )}
    </Fragment>
  );
}

function ProjectActionsMenu({
  displayName,
  showArchived,
  archivedCount,
  onOpenPermissions,
  onToggleShowArchived,
  onRemove,
}: {
  displayName: string;
  showArchived: boolean;
  archivedCount: number;
  onOpenPermissions: () => void;
  onToggleShowArchived: () => void;
  onRemove: () => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        onClick={(e) => e.stopPropagation()}
        className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-hover:opacity-100 data-[popup-open]:opacity-100"
        aria-label={`Actions for ${displayName}`}
        title="More actions"
      >
        <MoreHorizontal className="size-3.5" />
      </MenuTrigger>
      <MenuPopup align="end" className="min-w-[180px]">
        <MenuItem
          onClick={onOpenPermissions}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-sidebar-accent"
        >
          <Shield className="size-3.5" />
          Permissions
        </MenuItem>
        {archivedCount > 0 && (
          <MenuItem
            onClick={onToggleShowArchived}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-sidebar-accent"
          >
            {showArchived ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
            {showArchived
              ? `Hide archived (${archivedCount})`
              : `Show archived (${archivedCount})`}
          </MenuItem>
        )}
        <MenuItem
          onClick={onRemove}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/20"
        >
          <Trash2 className="size-3.5" />
          Remove project
        </MenuItem>
      </MenuPopup>
    </Menu>
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
  const defaultProviderId = useSettingsStore((s) => s.defaultProviderId);
  const defaultModelByProvider = useSettingsStore(
    (s) => s.defaultModelByProvider,
  );
  const defaultRuntimeMode = useSettingsStore((s) => s.defaultRuntimeMode);
  const [open, setOpen] = useState(false);

  // Refresh availability every time the popover opens — catches the user
  // running `claude /login` in their terminal without needing to restart.
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const isReady = (providerId: ProviderId): boolean => {
    const a = availability.find((x) => x.providerId === providerId);
    if (a === undefined) return false;
    return a.cliLoggedIn || a.hasApiKey;
  };

  const startSession = (providerId: ProviderId, model: string) => {
    void create(projectId, providerId, model, {
      runtimeMode: defaultRuntimeMode,
    });
  };

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // Cheap availability refresh in case the user just logged into a CLI.
    await refresh();
    if (isReady(defaultProviderId)) {
      const model =
        defaultModelByProvider[defaultProviderId] ??
        defaultModelFor(defaultProviderId);
      startSession(defaultProviderId, model);
      return;
    }
    // Saved default isn't logged in — fall back to the popover so the user
    // can still pick a provider that works right now.
    setOpen(true);
  };

  const onPick = (providerId: ProviderId) => {
    setOpen(false);
    const model =
      defaultModelByProvider[providerId] ?? defaultModelFor(providerId);
    startSession(providerId, model);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={onClick}
        className="rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
        aria-label="New chat"
        title="New chat"
      >
        <SquarePen className="size-3.5" />
      </PopoverTrigger>
      <PopoverPopup side="right" align="start" className="w-64">
        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {isReady(defaultProviderId)
            ? "New session"
            : "Saved default isn't ready — pick another provider"}
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
                <ProviderIcon
                  providerId={avail.providerId}
                  className="size-3.5"
                />
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
  const prInfo = usePrStateStore((s) => s.byFolder[session.projectId] ?? null);

  const isSelected = selectedSessionId === session.id;
  const isArchived = session.archivedAt !== null;

  // PR state colors the branch icon and toggles the right-side slot between
  // diff stats (when a PR exists) and a relative timestamp (otherwise).
  const branchState: BranchState =
    prInfo === null
      ? "default"
      : prInfo.state === "open"
        ? "pr-open"
        : prInfo.state === "merged" || prInfo.state === "closed"
          ? "pr-closed"
          : "default";
  const showDiff =
    prInfo !== null &&
    (prInfo.state === "open" ||
      prInfo.state === "merged" ||
      prInfo.state === "closed");

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
      <li
        role="button"
        tabIndex={0}
        onClick={() => select(session.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select(session.id);
          }
        }}
        className={cn(
          "group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors",
          isSelected && "bg-sidebar-accent text-sidebar-accent-foreground",
          !isSelected &&
            isArchived &&
            "text-muted-foreground hover:bg-sidebar-accent/40",
          !isSelected && !isArchived && "hover:bg-sidebar-accent/40",
        )}
        title={`${session.providerId} · ${session.model}`}
      >
        <BranchIcon
          state={branchState}
          selected={isSelected}
          className="ml-3"
        />
        <span className="min-w-0 flex-1 truncate">{session.title}</span>
        {/* Right-side slot: idle row shows diff stats (if PR open/closed) or
            timestamp (no PR). The three-dot menu fades over the same slot on
            hover so the row never reflows. tabular-nums keeps digit widths
            stable when the elapsed time ticks. */}
        <div className="relative flex h-4 w-[64px] shrink-0 items-center justify-end">
          <span
            className={cn(
              "tabular-nums text-[10px] transition-opacity duration-150 ease-out group-hover:opacity-0 motion-reduce:transition-none",
              showDiff && prInfo !== null && prInfo.state === "open"
                ? "text-emerald-400/90"
                : showDiff
                  ? "text-purple-300/80"
                  : "text-muted-foreground",
            )}
          >
            {showDiff && prInfo !== null
              ? `+${prInfo.additions} −${prInfo.deletions}`
              : formatRelative(session.updatedAt)}
          </span>
          <MenuTrigger
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 right-0 flex items-center rounded p-0.5 text-muted-foreground opacity-0 transition-opacity duration-150 ease-out hover:text-sidebar-accent-foreground group-hover:opacity-100 data-[popup-open]:opacity-100 motion-reduce:transition-none"
            aria-label={`Actions for ${session.title}`}
          >
            <MoreHorizontal className="size-3.5" />
          </MenuTrigger>
        </div>
      </li>
      <MenuPopup align="end" className="min-w-[160px]">
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
