import { Effect, Fiber, Stream } from "effect";
import { create } from "zustand";

import type {
  AgentAvailability,
  AgentEvent,
  AgentSessionId,
  FolderId,
  PtyCommand,
  ProviderId,
} from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * One CLI launch request per folder. The terminal-pane keys its mount on
 * `(folderId, nonce)` so bumping the nonce reopens a fresh PTY hosting the
 * agent CLI instead of the default shell. Returning to the default shell is
 * just `clear(folderId)` — the next folder switch re-mounts with no command.
 */
export type AgentRun = {
  readonly providerId: ProviderId;
  readonly command: PtyCommand;
  readonly nonce: number;
};

/**
 * One in-flight SDK conversation. Multi-session per folder is Phase 4; in
 * Phase 2 the right panel surfaces a single active session at a time.
 */
export type AgentSession = {
  readonly sessionId: AgentSessionId;
  readonly providerId: ProviderId;
  readonly folderId: FolderId;
  readonly status: "starting" | "running" | "closed" | "error";
  readonly events: ReadonlyArray<AgentEvent>;
};

type AgentsState = {
  availability: ReadonlyArray<AgentAvailability>;
  loading: boolean;
  error: string | null;
  launcherOpen: boolean;
  credentialsOpen: boolean;
  runs: Record<string, AgentRun>;
  activeSession: AgentSession | null;
  refresh: () => Promise<void>;
  setLauncherOpen: (open: boolean) => void;
  toggleLauncher: () => void;
  setCredentialsOpen: (open: boolean) => void;
  setCredential: (providerId: ProviderId, apiKey: string) => Promise<void>;
  launch: (folderId: FolderId, availability: AgentAvailability) => void;
  clearRun: (folderId: FolderId) => void;
  startSdk: (folderId: FolderId, providerId: ProviderId) => Promise<void>;
  sendSdk: (text: string) => Promise<void>;
  interruptSdk: () => Promise<void>;
  closeSdk: () => Promise<void>;
};

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

let nonceCounter = 0;
let eventsFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;

const stopEventsFiber = async () => {
  if (eventsFiber !== null) {
    const fiber = eventsFiber;
    eventsFiber = null;
    await Effect.runPromise(Fiber.interrupt(fiber));
  }
};

export const useAgentsStore = create<AgentsState>((set, get) => ({
  availability: [],
  loading: false,
  error: null,
  launcherOpen: false,
  credentialsOpen: false,
  runs: {},
  activeSession: null,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const client = await getRpcClient();
      const list = await Effect.runPromise(client.agent.availability({}));
      set({ availability: list, loading: false });
    } catch (err) {
      set({ error: formatError(err), loading: false });
    }
  },
  setLauncherOpen: (open) => set({ launcherOpen: open }),
  toggleLauncher: () => set({ launcherOpen: !get().launcherOpen }),
  setCredentialsOpen: (open) => set({ credentialsOpen: open }),
  setCredential: async (providerId, apiKey) => {
    try {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.agent.setCredential({ providerId, apiKey }),
      );
      await get().refresh();
    } catch (err) {
      set({ error: formatError(err) });
      throw err;
    }
  },
  launch: (folderId, avail) => {
    if (!avail.cliInstalled || avail.cliPath === undefined) return;
    nonceCounter += 1;
    set((s) => ({
      runs: {
        ...s.runs,
        [folderId]: {
          providerId: avail.providerId,
          command: { cmd: avail.cliPath!, args: [] },
          nonce: nonceCounter,
        },
      },
      launcherOpen: false,
    }));
  },
  clearRun: (folderId) =>
    set((s) => {
      const next = { ...s.runs };
      delete next[folderId];
      return { runs: next };
    }),
  startSdk: async (folderId, providerId) => {
    await stopEventsFiber();
    set({ launcherOpen: false, error: null });
    try {
      const client = await getRpcClient();
      const { sessionId } = await Effect.runPromise(
        client.agent.start({ folderId, providerId, mode: "sdk" }),
      );
      const session: AgentSession = {
        sessionId,
        providerId,
        folderId,
        status: "running",
        events: [],
      };
      set({ activeSession: session });
      eventsFiber = Effect.runFork(
        Stream.runForEach(
          client.agent.events({ sessionId }),
          (event: AgentEvent) =>
            Effect.sync(() => {
              const current = get().activeSession;
              if (current === null || current.sessionId !== sessionId) return;
              const status: AgentSession["status"] =
                event._tag === "Completed"
                  ? "closed"
                  : event._tag === "Error"
                    ? "error"
                    : current.status;
              set({
                activeSession: {
                  ...current,
                  status,
                  events: [...current.events, event],
                },
              });
            }),
        ),
      );
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  sendSdk: async (text) => {
    const session = get().activeSession;
    if (session === null) return;
    try {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.agent.send({ sessionId: session.sessionId, text }),
      );
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  interruptSdk: async () => {
    const session = get().activeSession;
    if (session === null) return;
    try {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.agent.interrupt({ sessionId: session.sessionId }),
      );
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  closeSdk: async () => {
    const session = get().activeSession;
    if (session === null) return;
    await stopEventsFiber();
    try {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.agent.close({ sessionId: session.sessionId }),
      );
    } catch (err) {
      // Best-effort: even on close failure, drop the session locally.
      set({ error: formatError(err) });
    }
    set({ activeSession: null });
  },
}));
