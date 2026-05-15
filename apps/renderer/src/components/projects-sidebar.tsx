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
  type SessionId,
} from "@memoize/wire";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn, formatCompactNumber } from "~/lib/utils";
import { formatShortcut } from "../lib/shortcuts.ts";
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
import { Beacon } from "./ui/loaders";

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

/**
 * Keep a live `session.streamStatus` subscription per known session so the
 * sidebar's busy indicators stay accurate even when a project is collapsed
 * or its row isn't mounted. Lives at the sidebar root so subscription
 * lifetime is decoupled from row-mount lifetime (the prior per-`SessionRow`
 * subscription dropped the moment a project group was collapsed). Each
 * fiber writes into `useMessagesStore.runningBySession[sessionId]`, which
 * every consumer already reads from.
 */
function useSessionRunningSubscriptions(
  sessionIds: ReadonlyArray<SessionId>,
) {
  // Stable ref-tracked fiber map. We diff incoming `sessionIds` against the
  // tracked set and only start/stop the deltas. Critically, an existing
  // session's fiber is NEVER torn down just because another session is
  // added or removed from the list — tearing it down would force a fresh
  // `streamStatus` subscribe whose initial event (read from the DB at
  // subscribe time) would clobber the live `true` flag with whatever's
  // persisted, making the previous session's loader disappear.
  const fibersRef = useRef<Map<SessionId, Fiber.RuntimeFiber<unknown, unknown>>>(
    new Map(),
  );
  const idsKey = sessionIds.join(",");

  useEffect(() => {
    const tracked = fibersRef.current;
    const incoming = new Set(sessionIds);
    const toAdd = sessionIds.filter((id) => !tracked.has(id));
    const toRemove = Array.from(tracked.keys()).filter(
      (id) => !incoming.has(id),
    );
    for (const id of toRemove) {
      const fiber = tracked.get(id);
      tracked.delete(id);
      if (fiber !== undefined) {
        void Effect.runPromise(Fiber.interrupt(fiber)).catch(() => {});
      }
    }
    if (toAdd.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const client = await getRpcClient();
        if (cancelled) return;
        for (const id of toAdd) {
          if (tracked.has(id)) continue;
          const fiber = Effect.runFork(
            Stream.runForEach(
              client.session.streamStatus({ sessionId: id }),
              (event) =>
                Effect.sync(() => {
                  useMessagesStore.setState((s) => ({
                    runningBySession: {
                      ...s.runningBySession,
                      [id]: event.status === "running",
                    },
                  }));
                }),
            ),
          );
          tracked.set(id, fiber);
        }
      } catch {
        // Best-effort — sidebar still renders the branch icon if the
        // status stream is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Final teardown on unmount only (sidebar lives for the whole app, so
  // this realistically fires once on hot-reload).
  useEffect(() => {
    return () => {
      const tracked = fibersRef.current;
      for (const fiber of tracked.values()) {
        void Effect.runPromise(Fiber.interrupt(fiber)).catch(() => {});
      }
      tracked.clear();
    };
  }, []);
}

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

  // Flat list of every non-archived session across every hydrated project.
  // Drives a single sidebar-root subscription per session so busy indicators
  // stay alive across collapse/expand toggles.
  const allSessionIds = useMemo(() => {
    const ids: SessionId[] = [];
    for (const folder of folders) {
      const sessions = sessionsByProject[folder.id];
      if (sessions === undefined) continue;
      for (const session of sessions) {
        if (session.archivedAt === null) ids.push(session.id);
      }
    }
    return ids;
  }, [folders, sessionsByProject]);
  useSessionRunningSubscriptions(allSessionIds);

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
          <TooltipPopup>
            <TooltipShortcut
              label="Add project"
              shortcut={formatShortcut("open-project")}
            />
          </TooltipPopup>
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
        <TooltipPopup side="top">
          <TooltipShortcut
            label="Open settings"
            shortcut={formatShortcut("settings")}
          />
        </TooltipPopup>
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

  // Surface a busy hint on the collapsed project header when any of its
  // non-archived sessions are running, so users see activity even without
  // expanding the group.
  const liveSessionIds = useMemo(
    () =>
      sessions.filter((s) => s.archivedAt === null).map((s) => s.id),
    [sessions],
  );
  const anyRunning = useMessagesStore((s) =>
    liveSessionIds.some((id) => s.runningBySession[id] === true),
  );
  const showHeaderBusy = anyRunning && !isExpanded;

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
                showHeaderBusy && "opacity-0",
              )}
            >
              {avatarUrl !== null && (
                <AvatarImage src={avatarUrl} alt={displayName} />
              )}
              <AvatarFallback className="rounded text-[9px]">
                {fallbackText}
              </AvatarFallback>
            </Avatar>
            {showHeaderBusy && (
              <span
                className={cn(
                  "col-start-1 row-start-1 inline-flex size-3.5 items-center justify-center text-foreground transition-opacity duration-150 ease-out",
                  "group-hover:opacity-0 motion-reduce:transition-none",
                )}
                aria-label="Agent is working in a session"
                title="Agent is working in a session"
              >
                <Beacon
                  dotSize={3}
                  cellPadding={0.75}
                  speed={1.8}
                  color="currentColor"
                />
              </span>
            )}
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
// and memoize picks up the credentials automatically on next refresh.
const LOGIN_HINT: Record<ProviderId, string> = {
  claude: "Run `claude /login` in your terminal",
  codex: "Run `codex login` in your terminal",
  grok: "Run `grok` in your terminal to sign in",
};

/**
 * Spawn a new chat session in the given project. Reads default
 * provider/model/runtime-mode/auto-worktree settings from the stores
 * directly so this is callable from anywhere (sidebar button + the
 * Cmd+N menu shortcut) without prop-drilling.
 */
export async function createNewSession(projectId: FolderId): Promise<void> {
  // Cheap availability refresh in case the user just logged into a CLI.
  // We don't gate the session creation on version status here — an
  // outdated codex is surfaced as an inline banner in the chat view so
  // the user can still open the session and switch model/provider from
  // the chat header.
  await useProvidersStore.getState().refresh();
  const settings = useSettingsStore.getState();
  const defaultProviderId = settings.defaultProviderId;
  const model =
    settings.defaultModelByProvider[defaultProviderId] ??
    defaultModelFor(defaultProviderId);
  const repoSettings = await useRepositorySettingsStore
    .getState()
    .refresh(projectId);
  const shouldAutoCreate =
    repoSettings?.autoCreateWorktree === true ||
    settings.defaultAutoCreateWorktree === true;
  let worktreeId = null;
  if (shouldAutoCreate) {
    const wt = await useWorktreesStore.getState().create(projectId);
    if (wt !== null) worktreeId = wt.id;
  }
  void useSessionsStore
    .getState()
    .create(projectId, defaultProviderId, model, {
      runtimeMode: settings.defaultRuntimeMode,
      worktreeId,
    });
}

function NewSessionButton({ projectId }: { projectId: FolderId }) {
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void createNewSession(projectId);
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
      <TooltipPopup>
        <TooltipShortcut label="New chat" shortcut={formatShortcut("new-chat")} />
      </TooltipPopup>
    </Tooltip>
  );
}

/**
 * Tooltip body with a trailing `<kbd>` shortcut hint. Co-located here
 * because almost every shortcut-bearing tooltip lives in this file or in
 * `top-bar.tsx`; exporting keeps the markup consistent across both.
 */
export function TooltipShortcut({
  label,
  shortcut,
}: {
  label: string;
  shortcut: string;
}) {
  if (shortcut === "") return <>{label}</>;
  return (
    <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
      <span>{label}</span>
      <kbd className="font-sans text-muted-foreground/80">{shortcut}</kbd>
    </span>
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
  // even when they're focused on a different chat. The map is populated by
  // `useSessionRunningSubscriptions` mounted at the sidebar root, so this
  // row's indicator survives collapse/expand of the project group.
  const isRunning = useMessagesStore(
    (s) => s.runningBySession[session.id] === true,
  );

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
            <Beacon
              dotSize={3}
              cellPadding={0.75}
              speed={1.8}
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
