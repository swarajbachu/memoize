import { Effect } from "effect";
import { create } from "zustand";

import type { AgentAvailability, ProviderId } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * Renderer-side cache of provider availability + the credentials sheet
 * controller. Replaces the per-session state that used to live in
 * `agents.ts` — sessions now flow through the messages store.
 */
type ProvidersState = {
  readonly availability: ReadonlyArray<AgentAvailability>;
  readonly loading: boolean;
  readonly error: string | null;
  readonly credentialsOpen: boolean;
  readonly refresh: () => Promise<void>;
  readonly setCredentialsOpen: (open: boolean) => void;
  readonly setCredential: (
    providerId: ProviderId,
    apiKey: string,
  ) => Promise<void>;
};

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

export const useProvidersStore = create<ProvidersState>((set, get) => ({
  availability: [],
  loading: false,
  error: null,
  credentialsOpen: false,
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
}));
