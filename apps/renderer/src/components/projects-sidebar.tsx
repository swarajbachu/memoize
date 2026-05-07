import { Effect, Fiber, Stream } from "effect";
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

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  defaultModelFor,
  type FolderId,
  type GitOriginInfo,
  type ProviderId,
  type Session,
} from "@forkzero/wire";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn, formatCompactNumber } from "~/lib/utils";
import { getRpcClient } from "../lib/rpc-client.ts";
import { useMessagesStore } from "../store/messages.ts";
import { prStateKey, usePrStateStore } from "../store/pr-state.ts";
import { useProvidersStore } from "../store/providers.ts";
import { useRepositorySettingsStore } from "../store/repository-settings.ts";
import { useSessionsStore } from "../store/sessions.ts";
import { useSettingsStore } from "../store/settings.ts";
import { useWorktreesStore } from "../store/worktrees.ts";
import { useUiStore } from "../store/ui.ts";
import { useWorkspaceStore } from "../store/workspace.ts";
import { BranchIcon, type BranchState } from "./branch-icon.tsx";
import { PermissionsInspector } from "./permissions-inspector.tsx";
import { GradientDescent } from "./ui/gradient-descent.tsx";

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

  // PR state is keyed per-session by `(folderId, worktreeId)` because each
  // worktree has its own branch and therefore its own PR. Hydration happens
  // inside `SessionRow` so each row pulls the entry that matches its
  // session — no per-project bulk hydrate.

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
    <aside className="flex h-full min-h-0 w-full flex-col backdrop-blur-3xl text-sidebar-foreground">
      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
        <span>Projects</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={onAddProject}
                className="rounded p-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label="Add project"
              >
                <Plus className="size-3.5" />
              </button>
            }
          />
          <TooltipPopup>Add project</TooltipPopup>
        </Tooltip>
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
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => setView("settings")}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                view === "settings" &&
                  "bg-sidebar-accent/60 text-sidebar-accent-foreground",
              )}
            >
              <Settings className="size-3.5" />
              <span>Settings</span>
            </button>
          }
        />
        <TooltipPopup side="top">Open settings</TooltipPopup>
      </Tooltip>
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
  const refresh = useProvidersStore((s) => s.refresh);
  const create = useSessionsStore((s) => s.create);
  const defaultProviderId = useSettingsStore((s) => s.defaultProviderId);
  const defaultModelByProvider = useSettingsStore(
    (s) => s.defaultModelByProvider,
  );
  const defaultRuntimeMode = useSettingsStore((s) => s.defaultRuntimeMode);
  const defaultAutoCreateWorktree = useSettingsStore(
    (s) => s.defaultAutoCreateWorktree,
  );
  const refreshRepoSettings = useRepositorySettingsStore((s) => s.refresh);
  const createWorktree = useWorktreesStore((s) => s.create);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // Cheap availability refresh in case the user just logged into a CLI.
    await refresh();
    const model =
      defaultModelByProvider[defaultProviderId] ??
      defaultModelFor(defaultProviderId);
    // Auto-create a worktree before session.create when either the global
    // default is on or the per-repo override flips it on. Failure is
    // non-fatal — fall back to main checkout.
    const repoSettings = await refreshRepoSettings(projectId);
    const shouldAutoCreate =
      repoSettings?.autoCreateWorktree === true ||
      defaultAutoCreateWorktree === true;
    let worktreeId = null;
    if (shouldAutoCreate) {
      const wt = await createWorktree(projectId);
      if (wt !== null) worktreeId = wt.id;
    }
    void create(projectId, defaultProviderId, model, {
      runtimeMode: defaultRuntimeMode,
      worktreeId,
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            className="rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="New chat"
          >
            <SquarePen className="size-3.5" />
          </button>
        }
      />
      <TooltipPopup>New chat</TooltipPopup>
    </Tooltip>
  );
}

function SessionRow({ session }: { session: Session }) {
  const selectedSessionId = useSessionsStore((s) => s.selectedSessionId);
  const select = useSessionsStore((s) => s.select);
  const rename = useSessionsStore((s) => s.rename);
  const archive = useSessionsStore((s) => s.archive);
  const unarchive = useSessionsStore((s) => s.unarchive);
  const remove = useSessionsStore((s) => s.remove);
  // Each session's PR state lives behind its (project, worktree) pair —
  // sessions on a worktree show that worktree's branch's PR; sessions on
  // the main checkout share the project-level entry. Hydrated lazily on
  // first render so the diff stats / branch tone reflect the right branch.
  const prInfo = usePrStateStore(
    (s) =>
      s.byKey[prStateKey(session.projectId, session.worktreeId)] ?? null,
  );
  const hydratePrState = usePrStateStore((s) => s.hydrate);
  useEffect(() => {
    void hydratePrState(session.projectId, session.worktreeId);
  }, [hydratePrState, session.projectId, session.worktreeId]);
  // Live "agent is working" signal — replaces the branch icon while running
  // so users scanning the sidebar see at a glance which sessions are busy
  // even when they're focused on a different chat. The messages store only
  // maintains streamStatus for the active session, so each SessionRow owns
  // its own subscription and writes back into the same map. (Active-session
  // double-writes converge harmlessly.)
  const isRunning = useMessagesStore(
    (s) => s.runningBySession[session.id] === true,
  );
  useEffect(() => {
    let cancelled = false;
    let fiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;
    void (async () => {
      try {
        const client = await getRpcClient();
        if (cancelled) return;
        fiber = Effect.runFork(
          Stream.runForEach(
            client.session.streamStatus({ sessionId: session.id }),
            (event) =>
              Effect.sync(() => {
                if (cancelled) return;
                useMessagesStore.setState((s) => ({
                  runningBySession: {
                    ...s.runningBySession,
                    [session.id]: event.status === "running",
                  },
                }));
              }),
          ),
        );
      } catch {
        // Best-effort — sidebar still renders the branch icon if the
        // status stream is unavailable.
      }
    })();
    return () => {
      cancelled = true;
      if (fiber !== null) {
        void Effect.runPromise(Fiber.interrupt(fiber)).catch(() => {});
      }
    };
  }, [session.id]);

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

  // Right-click context menu uses a virtual anchor positioned at the cursor.
  // The visible button on hover (Archive / Unarchive) is the primary action;
  // the full action set (Rename / Archive / Delete) lives in the context menu.
  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef<{ getBoundingClientRect: () => DOMRect } | null>(
    null,
  );

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;
    const rect = new DOMRect(x, y, 0, 0);
    anchorRef.current = { getBoundingClientRect: () => rect };
    setMenuOpen(true);
  };

  const PrimaryActionIcon = isArchived ? ArchiveRestore : Archive;
  const primaryActionLabel = isArchived ? "Unarchive" : "Archive";

  return (
    <>
      <li
        role="button"
        tabIndex={0}
        onClick={() => select(session.id)}
        onContextMenu={onContextMenu}
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
        {isRunning ? (
          <span
            className={cn(
              "ml-3 inline-flex size-3.5 shrink-0 items-center justify-center",
              isSelected ? "text-sidebar-accent-foreground" : "text-foreground",
            )}
            aria-label="Agent is working"
            title="Agent is working"
          >
            <GradientDescent
              dotSize={2}
              cellPadding={0.5}
              speed={1.4}
              color="currentColor"
            />
          </span>
        ) : (
          <BranchIcon
            state={branchState}
            selected={isSelected}
            className="ml-3"
          />
        )}
        <span className="min-w-0 flex-1 truncate">{session.title}</span>
        {/* Right-side slot: idle row shows diff stats (if PR open/closed) or
            timestamp (no PR). On hover the slot swaps to a single Archive
            (or Unarchive) action — no menu glyph; the rest of the actions
            live behind right-click. tabular-nums keeps digit widths stable. */}
        <div className="relative flex h-4 w-16 shrink-0 items-center justify-end">
          <span className="tabular-nums text-[10px] text-muted-foreground transition-opacity duration-150 ease-out motion-reduce:transition-none group-hover:hidden">
            {showDiff && prInfo !== null ? (
              <>
                <span className="text-emerald-400">
                  +{formatCompactNumber(prInfo.additions)}
                </span>{" "}
                <span className="text-red-400">
                  −{formatCompactNumber(prInfo.deletions)}
                </span>
              </>
            ) : (
              formatRelative(session.updatedAt)
            )}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void (isArchived ? unarchive(session.id) : archive(session.id));
            }}
            className="hidden items-center rounded p-0.5 text-muted-foreground transition-opacity duration-150 ease-out hover:text-sidebar-accent-foreground group-hover:flex motion-reduce:transition-none"
            aria-label={`${primaryActionLabel} ${session.title}`}
            title={primaryActionLabel}
          >
            <PrimaryActionIcon className="size-3.5" />
          </button>
        </div>
      </li>
      <Menu open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuPopup
          anchor={anchorRef.current ?? undefined}
          align="start"
          side="bottom"
          className="min-w-40"
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
    </>
  );
}
