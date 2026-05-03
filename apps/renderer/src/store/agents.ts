import { Effect } from "effect";
import { create } from "zustand";

import type {
  AgentAvailability,
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

type AgentsState = {
  availability: ReadonlyArray<AgentAvailability>;
  loading: boolean;
  error: string | null;
  launcherOpen: boolean;
  credentialsOpen: boolean;
  runs: Record<string, AgentRun>;
  refresh: () => Promise<void>;
  setLauncherOpen: (open: boolean) => void;
  toggleLauncher: () => void;
  setCredentialsOpen: (open: boolean) => void;
  setCredential: (providerId: ProviderId, apiKey: string) => Promise<void>;
  launch: (folderId: FolderId, availability: AgentAvailability) => void;
  clearRun: (folderId: FolderId) => void;
};

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

let nonceCounter = 0;

export const useAgentsStore = create<AgentsState>((set, get) => ({
  availability: [],
  loading: false,
  error: null,
  launcherOpen: false,
  credentialsOpen: false,
  runs: {},
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
      // Refresh availability so `sdkConfigured` reflects the new state.
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
}));
