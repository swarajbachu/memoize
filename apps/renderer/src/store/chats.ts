import { Effect } from "effect";
import { create } from "zustand";

import type {
  AgentDefinition,
  Chat,
  ChatId,
  FolderId,
  PermissionMode,
  ProviderId,
  RuntimeMode,
  Session,
  SessionId,
  WorktreeId,
} from "@memoize/wire";

import { getRpcClient } from "../lib/rpc-client.ts";
import { formatError } from "../lib/format-error.ts";
import { useMessagesStore } from "./messages.ts";
import { useSessionsStore } from "./sessions.ts";
import { useWorkspaceStore } from "./workspace.ts";

/**
 * Sidebar-level chat catalog. A chat is the container that holds one or
 * more sessions ("tabs"). The sidebar renders chats; the tab strip in the
 * main pane renders the active chat's sessions. Chats own the worktree
 * binding — all sessions inside a chat share that worktree.
 *
 * `activeSessionId` (mirrored from the server's `chats.active_session_id`
 * column) is the last tab the user was on inside a chat. Clicking a chat in
 * the sidebar restores that tab — no in-memory memo required.
 */
type ChatsState = {
  readonly chatsByProject: Record<string, ReadonlyArray<Chat>>;
  /** Mirror of `selectedChatByProject[selectedFolderId]`. */
  readonly selectedChatId: ChatId | null;
  readonly selectedChatByProject: Record<string, ChatId | null>;
  readonly showArchivedByProject: Record<string, boolean>;
  readonly loadingByProject: Record<string, boolean>;
  /** Per-project in-flight flag for `create()`. Drives the sidebar
   * "New chat" button's icon swap (SquarePen → Diffusion). */
  readonly creatingByProject: Record<string, boolean>;
  readonly error: string | null;
  readonly hydrate: (projectId: FolderId) => Promise<void>;
  readonly create: (
    projectId: FolderId,
    providerId: ProviderId,
    model: string,
    opts?: {
      readonly title?: string;
      readonly initialPrompt?: string;
      readonly runtimeMode?: RuntimeMode;
      readonly worktreeId?: WorktreeId | null;
      readonly agents?: Readonly<Record<string, AgentDefinition>>;
      readonly enableSubagents?: boolean;
      readonly permissionMode?: PermissionMode;
      readonly toolSearch?: boolean;
    },
  ) => Promise<ChatId | null>;
  readonly rename: (chatId: ChatId, title: string) => Promise<void>;
  readonly setWorktree: (
    chatId: ChatId,
    worktreeId: WorktreeId | null,
  ) => Promise<{ readonly ok: true } | { readonly ok: false; reason: string }>;
  readonly setActiveSession: (
    chatId: ChatId,
    sessionId: SessionId,
  ) => Promise<void>;
  readonly archive: (chatId: ChatId) => Promise<void>;
  readonly unarchive: (chatId: ChatId) => Promise<void>;
  readonly remove: (chatId: ChatId) => Promise<void>;
  readonly select: (chatId: ChatId | null) => void;
  readonly toggleShowArchived: (projectId: FolderId) => void;
};

const findChatProject = (
  chatsByProject: ChatsState["chatsByProject"],
  chatId: ChatId,
): FolderId | null => {
  for (const [pid, chats] of Object.entries(chatsByProject)) {
    if (chats.some((c) => c.id === chatId)) return pid as FolderId;
  }
  return null;
};

export const useChatsStore = create<ChatsState>((set, get) => ({
  chatsByProject: {},
  selectedChatId: null,
  selectedChatByProject: {},
  showArchivedByProject: {},
  loadingByProject: {},
  creatingByProject: {},
  error: null,
  hydrate: async (projectId) => {
    set((s) => ({
      loadingByProject: { ...s.loadingByProject, [projectId]: true },
      error: null,
    }));
    try {
      const client = await getRpcClient();
      const includeArchived =
        get().showArchivedByProject[projectId] === true;
      const chats = await Effect.runPromise(
        client.chat.list({ projectId, includeArchived }),
      );
      set((s) => ({
        chatsByProject: { ...s.chatsByProject, [projectId]: chats },
        loadingByProject: { ...s.loadingByProject, [projectId]: false },
      }));
    } catch (err) {
      set((s) => ({
        error: formatError(err),
        loadingByProject: { ...s.loadingByProject, [projectId]: false },
      }));
    }
  },
  create: async (projectId, providerId, model, opts) => {
    set((s) => ({
      error: null,
      creatingByProject: { ...s.creatingByProject, [projectId]: true },
    }));
    try {
      const client = await getRpcClient();
      const result = await Effect.runPromise(
        client.chat.create({
          projectId,
          providerId,
          model,
          title: opts?.title,
          initialPrompt: opts?.initialPrompt,
          runtimeMode: opts?.runtimeMode,
          worktreeId: opts?.worktreeId ?? null,
          agents: opts?.agents,
          enableSubagents: opts?.enableSubagents,
          permissionMode: opts?.permissionMode,
          toolSearch: opts?.toolSearch,
        }),
      );
      const { chat, initialSession, initialMessage } = result;
      // Seed the messages store FIRST so the chat view, when it mounts on
      // the next render, finds the initial user message already in place —
      // no empty-state flash, no waiting on the live stream to backfill.
      // `useMessagesStore.hydrate` will dedupe against this id when the
      // backfill arrives, so there's no double-render.
      if (initialMessage !== null) {
        useMessagesStore.setState((s) => ({
          messagesBySession: {
            ...s.messagesBySession,
            [initialSession.id]: [initialMessage],
          },
        }));
      }
      // Land the new chat in front of the project's existing list and
      // mark it active so the renderer immediately swaps to it.
      set((s) => {
        const existing = s.chatsByProject[projectId] ?? [];
        return {
          chatsByProject: {
            ...s.chatsByProject,
            [projectId]: [chat, ...existing],
          },
          selectedChatId: chat.id,
          selectedChatByProject: {
            ...s.selectedChatByProject,
            [projectId]: chat.id,
          },
          creatingByProject: {
            ...s.creatingByProject,
            [projectId]: false,
          },
        };
      });
      // Mirror the initial session into the sessions store and select it
      // so the chat surface (composer, message list, cost footer) wires up
      // on the very next render.
      useSessionsStore.setState((s) => {
        const list = s.sessionsByProject[projectId] ?? [];
        if (list.some((row) => row.id === initialSession.id)) return s;
        return {
          sessionsByProject: {
            ...s.sessionsByProject,
            [projectId]: [initialSession, ...list],
          },
          selectedSessionId: initialSession.id,
          selectedSessionByProject: {
            ...s.selectedSessionByProject,
            [projectId]: initialSession.id,
          },
        };
      });
      return chat.id;
    } catch (err) {
      set((s) => ({
        error: formatError(err),
        creatingByProject: { ...s.creatingByProject, [projectId]: false },
      }));
      return null;
    }
  },
  rename: async (chatId, title) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.chat.rename({ chatId, title }));
      set((s) => {
        const projectId = findChatProject(s.chatsByProject, chatId);
        if (projectId === null) return {};
        const chats = s.chatsByProject[projectId] ?? [];
        return {
          chatsByProject: {
            ...s.chatsByProject,
            [projectId]: chats.map((c) =>
              c.id === chatId ? Object.assign(Object.create(Object.getPrototypeOf(c)), c, { title }) : c,
            ),
          },
        };
      });
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  setWorktree: async (chatId, worktreeId) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      const chat = await Effect.runPromise(
        client.chat.setWorktree({ chatId, worktreeId }),
      );
      set((s) => {
        const projectId = findChatProject(s.chatsByProject, chatId);
        if (projectId === null) return {};
        const chats = s.chatsByProject[projectId] ?? [];
        return {
          chatsByProject: {
            ...s.chatsByProject,
            [projectId]: chats.map((c) => (c.id === chatId ? chat : c)),
          },
        };
      });
      // Mirror the worktree change onto every member session in the
      // renderer cache; the server has already updated the DB rows.
      useSessionsStore.setState((s) => {
        const projectId = findChatProject(get().chatsByProject, chatId);
        if (projectId === null) return s;
        const list = s.sessionsByProject[projectId] ?? [];
        return {
          sessionsByProject: {
            ...s.sessionsByProject,
            [projectId]: list.map((row): Session =>
              row.chatId === chatId ? { ...row, worktreeId } : row,
            ),
          },
        };
      });
      return { ok: true } as const;
    } catch (err) {
      const reason = formatError(err);
      set({ error: reason });
      return { ok: false, reason } as const;
    }
  },
  setActiveSession: async (chatId, sessionId) => {
    // Optimistic — patch local state first so the sidebar's last-active
    // memo is immediate. Server reconciles on success; on failure we just
    // log via `error`.
    set((s) => {
      const projectId = findChatProject(s.chatsByProject, chatId);
      if (projectId === null) return s;
      const chats = s.chatsByProject[projectId] ?? [];
      return {
        chatsByProject: {
          ...s.chatsByProject,
          [projectId]: chats.map((c) =>
            c.id === chatId
              ? Object.assign(Object.create(Object.getPrototypeOf(c)), c, {
                  activeSessionId: sessionId,
                })
              : c,
          ),
        },
      };
    });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.chat.setActiveSession({ chatId, sessionId }),
      );
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  archive: async (chatId) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.chat.archive({ chatId }));
      const projectId = findChatProject(get().chatsByProject, chatId);
      if (projectId !== null) await get().hydrate(projectId);
      // Drop the chat from the active selection so the chat surface clears.
      set((s) => {
        const wasSelected = s.selectedChatId === chatId;
        const clearPerProject =
          projectId !== null &&
          s.selectedChatByProject[projectId] === chatId;
        if (!wasSelected && !clearPerProject) return s;
        return {
          selectedChatId: wasSelected ? null : s.selectedChatId,
          selectedChatByProject: clearPerProject
            ? { ...s.selectedChatByProject, [projectId!]: null }
            : s.selectedChatByProject,
        };
      });
      // Also drop the matching sessions from the renderer cache so the
      // tab strip empties immediately.
      useSessionsStore.setState((s) => {
        if (projectId === null) return s;
        const list = s.sessionsByProject[projectId] ?? [];
        return {
          sessionsByProject: {
            ...s.sessionsByProject,
            [projectId]: list.filter((row) => row.chatId !== chatId),
          },
          selectedSessionId:
            s.selectedSessionId !== null &&
            list.find((row) => row.id === s.selectedSessionId)?.chatId ===
              chatId
              ? null
              : s.selectedSessionId,
        };
      });
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  unarchive: async (chatId) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.chat.unarchive({ chatId }));
      const projectId = findChatProject(get().chatsByProject, chatId);
      if (projectId !== null) await get().hydrate(projectId);
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  remove: async (chatId) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.chat.delete({ chatId }));
      const projectId = findChatProject(get().chatsByProject, chatId);
      set((s) => {
        if (projectId === null) return {};
        const chats = s.chatsByProject[projectId] ?? [];
        const perProject =
          s.selectedChatByProject[projectId] === chatId
            ? { ...s.selectedChatByProject, [projectId]: null }
            : s.selectedChatByProject;
        return {
          chatsByProject: {
            ...s.chatsByProject,
            [projectId]: chats.filter((c) => c.id !== chatId),
          },
          selectedChatId:
            s.selectedChatId === chatId ? null : s.selectedChatId,
          selectedChatByProject: perProject,
        };
      });
      // Drop the chat's sessions from the renderer cache. The server has
      // cascaded the rows; this just keeps the UI in lockstep without a
      // re-hydrate round-trip.
      useSessionsStore.setState((s) => {
        if (projectId === null) return s;
        const list = s.sessionsByProject[projectId] ?? [];
        return {
          sessionsByProject: {
            ...s.sessionsByProject,
            [projectId]: list.filter((row) => row.chatId !== chatId),
          },
          selectedSessionId:
            s.selectedSessionId !== null &&
            list.find((row) => row.id === s.selectedSessionId)?.chatId ===
              chatId
              ? null
              : s.selectedSessionId,
        };
      });
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  select: (chatId) => {
    if (chatId === null) {
      set((s) => {
        const projectId = useWorkspaceStore.getState().selectedFolderId;
        return {
          selectedChatId: null,
          selectedChatByProject:
            projectId !== null
              ? { ...s.selectedChatByProject, [projectId]: null }
              : s.selectedChatByProject,
        };
      });
      useSessionsStore.getState().select(null);
      return;
    }
    const projectId = findChatProject(get().chatsByProject, chatId);
    set((s) => ({
      selectedChatId: chatId,
      selectedChatByProject:
        projectId !== null
          ? { ...s.selectedChatByProject, [projectId]: chatId }
          : s.selectedChatByProject,
    }));
    if (
      projectId !== null &&
      useWorkspaceStore.getState().selectedFolderId !== projectId
    ) {
      void useWorkspaceStore.getState().select(projectId);
    }
    // Land on the chat's last-active tab. If the memo points at an
    // archived/deleted session, fall back to the oldest non-archived
    // session inside the chat (or null).
    const chat = get().chatsByProject[projectId ?? ""]?.find(
      (c) => c.id === chatId,
    );
    if (chat === undefined) return;
    const projectSessions =
      projectId === null
        ? []
        : useSessionsStore.getState().sessionsByProject[projectId] ?? [];
    const liveTabs = projectSessions.filter(
      (row) => row.chatId === chatId && row.archivedAt === null,
    );
    const memoSession =
      chat.activeSessionId !== null
        ? liveTabs.find((row) => row.id === chat.activeSessionId)
        : undefined;
    const fallback = liveTabs[0] ?? null;
    const landingId = memoSession?.id ?? fallback?.id ?? null;
    useSessionsStore.getState().select(landingId);
  },
  toggleShowArchived: (projectId) => {
    set((s) => ({
      showArchivedByProject: {
        ...s.showArchivedByProject,
        [projectId]: !s.showArchivedByProject[projectId],
      },
    }));
    void get().hydrate(projectId);
  },
}));

// Mirror `selectedChatId` from the active project's slot — same pattern
// as `useSessionsStore` so switching projects swaps the active chat too.
useWorkspaceStore.subscribe((ws, prev) => {
  if (ws.selectedFolderId === prev.selectedFolderId) return;
  const slot =
    ws.selectedFolderId !== null
      ? useChatsStore.getState().selectedChatByProject[ws.selectedFolderId] ??
        null
      : null;
  if (useChatsStore.getState().selectedChatId !== slot) {
    useChatsStore.setState({ selectedChatId: slot });
  }
});
