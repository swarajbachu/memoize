import { Effect } from "effect";
import { create } from "zustand";

import type {
  FolderId,
  ProviderId,
  Session,
  SessionId,
} from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * Per-project session catalog. Sessions are scoped to a project, archived
 * sessions are hidden by default, and `selectedSessionId` drives which
 * session the chat surface (PR 4) renders. Live message streaming is owned
 * by the messages store — this one is a sidebar-only view-model.
 */
type SessionsState = {
  readonly sessionsByProject: Record<string, ReadonlyArray<Session>>;
  readonly selectedSessionId: SessionId | null;
  readonly showArchivedByProject: Record<string, boolean>;
  readonly loadingByProject: Record<string, boolean>;
  readonly error: string | null;
  readonly hydrate: (projectId: FolderId) => Promise<void>;
  readonly create: (
    projectId: FolderId,
    providerId: ProviderId,
    model: string,
    initialPrompt?: string,
  ) => Promise<SessionId | null>;
  readonly rename: (sessionId: SessionId, title: string) => Promise<void>;
  readonly archive: (sessionId: SessionId) => Promise<void>;
  readonly unarchive: (sessionId: SessionId) => Promise<void>;
  readonly remove: (sessionId: SessionId) => Promise<void>;
  readonly select: (sessionId: SessionId | null) => void;
  readonly toggleShowArchived: (projectId: FolderId) => void;
};

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

const findSessionProject = (
  sessionsByProject: SessionsState["sessionsByProject"],
  sessionId: SessionId,
): FolderId | null => {
  for (const [pid, sessions] of Object.entries(sessionsByProject)) {
    if (sessions.some((s) => s.id === sessionId)) return pid as FolderId;
  }
  return null;
};

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessionsByProject: {},
  selectedSessionId: null,
  showArchivedByProject: {},
  loadingByProject: {},
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
      const sessions = await Effect.runPromise(
        client.session.list({ projectId, includeArchived }),
      );
      set((s) => ({
        sessionsByProject: { ...s.sessionsByProject, [projectId]: sessions },
        loadingByProject: { ...s.loadingByProject, [projectId]: false },
      }));
    } catch (err) {
      set((s) => ({
        error: formatError(err),
        loadingByProject: { ...s.loadingByProject, [projectId]: false },
      }));
    }
  },
  create: async (projectId, providerId, model, initialPrompt) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      const session = await Effect.runPromise(
        client.session.create({
          projectId,
          providerId,
          model,
          initialPrompt,
        }),
      );
      set((s) => {
        const existing = s.sessionsByProject[projectId] ?? [];
        return {
          sessionsByProject: {
            ...s.sessionsByProject,
            [projectId]: [session, ...existing],
          },
          selectedSessionId: session.id,
        };
      });
      return session.id;
    } catch (err) {
      set({ error: formatError(err) });
      return null;
    }
  },
  rename: async (sessionId, title) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.session.rename({ sessionId, title }));
      set((s) => {
        const projectId = findSessionProject(s.sessionsByProject, sessionId);
        if (projectId === null) return {};
        const sessions = s.sessionsByProject[projectId] ?? [];
        return {
          sessionsByProject: {
            ...s.sessionsByProject,
            [projectId]: sessions.map((session) =>
              session.id === sessionId ? { ...session, title } : session,
            ),
          },
        };
      });
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  archive: async (sessionId) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.session.archive({ sessionId }));
      // Re-hydrate the affected project so visibility honors showArchived.
      const projectId = findSessionProject(get().sessionsByProject, sessionId);
      if (projectId !== null) await get().hydrate(projectId);
      if (get().selectedSessionId === sessionId) set({ selectedSessionId: null });
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  unarchive: async (sessionId) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.session.unarchive({ sessionId }));
      const projectId = findSessionProject(get().sessionsByProject, sessionId);
      if (projectId !== null) await get().hydrate(projectId);
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  remove: async (sessionId) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.session.delete({ sessionId }));
      set((s) => {
        const projectId = findSessionProject(s.sessionsByProject, sessionId);
        if (projectId === null) return {};
        const sessions = s.sessionsByProject[projectId] ?? [];
        return {
          sessionsByProject: {
            ...s.sessionsByProject,
            [projectId]: sessions.filter((session) => session.id !== sessionId),
          },
          selectedSessionId:
            s.selectedSessionId === sessionId ? null : s.selectedSessionId,
        };
      });
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  select: (sessionId) => set({ selectedSessionId: sessionId }),
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
