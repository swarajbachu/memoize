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
  type Chat,
  type ChatId,
  defaultModelFor,
  type FolderId,
  type GitOriginInfo,
  type ProviderId,
  type SessionId,
} from "@memoize/wire";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn, formatCompactNumber } from "~/lib/utils";
import { formatShortcut } from "../lib/shortcuts.ts";
import { getRpcClient } from "../lib/rpc-client.ts";
import { useChatsStore } from "../store/chats.ts";
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
import { Beacon, Diffusion } from "./ui/loaders";

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
  const hydrateSessions = useSessionsStore((s) => s.hydrate);
  const sessionsError = useSessionsStore((s) => s.error);

  const chatsByProject = useChatsStore((s) => s.chatsByProject);
  const showArchivedByProject = useChatsStore(
    (s) => s.showArchivedByProject,
  );
  const chatsError = useChatsStore((s) => s.error);
  const hydrateChats = useChatsStore((s) => s.hydrate);
  const toggleShowArchived = useChatsStore((s) => s.toggleShowArchived);

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

  // Lazy-hydrate chats AND sessions for any expanded project that hasn't
  // been loaded. Sidebar reads chats; tab strip reads sessions; both stores
  // are populated up-front so switching projects doesn't show empty tabs.
  useEffect(() => {
    for (const folder of folders) {
      if (!expanded[folder.id]) continue;
      if (!(folder.id in chatsByProject)) void hydrateChats(folder.id);
      if (!(folder.id in sessionsByProject)) void hydrateSessions(folder.id);
    }
  }, [
    expanded,
    folders,
    chatsByProject,
    sessionsByProject,
    hydrateChats,
    hydrateSessions,
  ]);

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

      {(error ?? chatsError ?? sessionsError) !== null && (
        <p className="mx-3 mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          {error ?? chatsError ?? sessionsError}
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
            chats={chatsByProject[folder.id] ?? []}
            projectSessions={sessionsByProject[folder.id] ?? []}
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
  chats,
  projectSessions,
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
  chats: ReadonlyArray<Chat>;
  projectSessions: ReadonlyArray<{
    readonly id: SessionId;
    readonly chatId: ChatId;
    readonly archivedAt: Date | null;
  }>;
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

  const visibleChats = useMemo(
    () =>
      showArchived
        ? chats
        : chats.filter((c) => c.archivedAt === null),
    [chats, showArchived],
  );
  const archivedCount = chats.filter((c) => c.archivedAt !== null).length;

  // Surface a busy hint on the collapsed project header when any session
  // inside any of this project's live chats is running.
  const liveSessionIds = useMemo(
    () =>
      projectSessions.filter((s) => s.archivedAt === null).map((s) => s.id),
    [projectSessions],
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
          <NewChatButton projectId={id} />
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
          {visibleChats.length === 0 && (
            <li className="px-12 py-1 text-[11px] text-muted-foreground">
              No chats yet.
            </li>
          )}
          {visibleChats.map((chat) => (
            <ChatRow key={chat.id} chat={chat} />
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
};

/**
 * Spawn a new chat (sidebar container) plus its initial session in the
 * given project. Worktree is auto-created when the per-repo or global
 * setting says so. Reads from stores directly so callers (the sidebar
 * button + the Cmd+N menu shortcut) don't need prop drilling.
 */
export async function createNewSession(projectId: FolderId): Promise<void> {
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
  void useChatsStore
    .getState()
    .create(projectId, defaultProviderId, model, {
      runtimeMode: settings.defaultRuntimeMode,
      worktreeId,
    });
}

function NewChatButton({ projectId }: { projectId: FolderId }) {
  const creating = useChatsStore(
    (s) => s.creatingByProject[projectId] === true,
  );
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (creating) return;
    void createNewSession(projectId);
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            disabled={creating}
            className="rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:cursor-default disabled:hover:bg-transparent"
            aria-label="New chat"
          >
            {creating ? (
              <Diffusion className="size-3.5" />
            ) : (
              <SquarePen className="size-3.5" />
            )}
          </button>
        }
      />
      <TooltipPopup>
        <TooltipShortcut
          label={creating ? "Creating chat…" : "New chat"}
          shortcut={creating ? "" : formatShortcut("new-chat")}
        />
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

function ChatRow({ chat }: { chat: Chat }) {
  const selectedSessionId = useSessionsStore((s) => s.selectedSessionId);
  const selectedChatId = useChatsStore((s) => s.selectedChatId);
  const sessionsByProject = useSessionsStore((s) => s.sessionsByProject);

  const selectChat = useChatsStore((s) => s.select);
  const renameChat = useChatsStore((s) => s.rename);
  const archiveChat = useChatsStore((s) => s.archive);
  const unarchiveChat = useChatsStore((s) => s.unarchive);
  const removeChat = useChatsStore((s) => s.remove);

  // PR state is keyed by (project, worktree). A chat owns its worktree,
  // so all its sessions share the same PR row — hydrate once per chat.
  const prInfo = usePrStateStore(
    (s) => s.byKey[prStateKey(chat.projectId, chat.worktreeId)] ?? null,
  );
  const hydratePrState = usePrStateStore((s) => s.hydrate);
  useEffect(() => {
    void hydratePrState(chat.projectId, chat.worktreeId);
  }, [hydratePrState, chat.projectId, chat.worktreeId]);

  // Ids of this chat's non-archived sessions — so the sidebar busy
  // indicator reflects ANY tab being active, not just the currently
  // selected one.
  const sessionIds = useMemo(
    () =>
      (sessionsByProject[chat.projectId] ?? [])
        .filter(
          (row) => row.chatId === chat.id && row.archivedAt === null,
        )
        .map((row) => row.id),
    [sessionsByProject, chat.projectId, chat.id],
  );

  const isRunning = useMessagesStore((s) => {
    for (const id of sessionIds) {
      if (s.runningBySession[id] === true) return true;
    }
    return false;
  });

  // Highlight this row when its own chat is selected, OR when the active
  // session (any tab inside this chat) lives in it. Covers the transient
  // window where `selectedChatId` hasn't caught up to `selectedSessionId`.
  const sessionBelongsToChat = useMemo(() => {
    if (selectedSessionId === null) return false;
    return sessionIds.includes(selectedSessionId);
  }, [selectedSessionId, sessionIds]);
  const isSelected = selectedChatId === chat.id || sessionBelongsToChat;
  const isArchived = chat.archivedAt !== null;

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
    const next = window.prompt("Rename chat", chat.title);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length === 0 || trimmed === chat.title) return;
    void renameChat(chat.id, trimmed);
  };

  const onDelete = () => {
    if (!window.confirm(`Delete "${chat.title}"? This can't be undone.`))
      return;
    void removeChat(chat.id);
  };

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
        onClick={() => selectChat(chat.id)}
        onContextMenu={onContextMenu}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectChat(chat.id);
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
        title={chat.title}
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
        <span className="min-w-0 flex-1 truncate">{chat.title}</span>
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
              formatRelative(chat.updatedAt)
            )}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void (isArchived ? unarchiveChat(chat.id) : archiveChat(chat.id));
            }}
            className="hidden items-center rounded p-0.5 text-muted-foreground transition-opacity duration-150 ease-out hover:text-sidebar-accent-foreground group-hover:flex motion-reduce:transition-none"
            aria-label={`${primaryActionLabel} ${chat.title}`}
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
              onClick={() => void unarchiveChat(chat.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-sidebar-accent"
            >
              <ArchiveRestore className="size-3.5" />
              Unarchive
            </MenuItem>
          ) : (
            <MenuItem
              onClick={() => void archiveChat(chat.id)}
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
