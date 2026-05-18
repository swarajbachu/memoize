import { Effect, Fiber, Stream } from "effect";
import { create } from "zustand";

import type { FolderId, IndexStatusInfo } from "@memoize/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

type IndexState = {
  statusByFolder: Record<string, IndexStatusInfo>;
  hydrate: (folderId: FolderId) => Promise<void>;
  stopAll: () => Promise<void>;
};

// One subscription per folderId — switching workspaces should stop the old
// subscription (releases the per-subscriber mailbox on the server side) but
// we keep the prior folder's last-known snapshot in the store so the top-bar
// chip doesn't flash empty on re-select.
const fibersByFolder = new Map<string, Fiber.RuntimeFiber<unknown, unknown>>();

const stopFiber = async (folderId: string): Promise<void> => {
  const fiber = fibersByFolder.get(folderId);
  if (fiber === undefined) return;
  fibersByFolder.delete(folderId);
  await Effect.runPromise(Fiber.interrupt(fiber)).catch(() => {});
};

export const useIndexStore = create<IndexState>((set) => ({
  statusByFolder: {},
  hydrate: async (folderId) => {
    if (fibersByFolder.has(folderId)) return;
    try {
      const client = await getRpcClient();
      const program = Stream.runForEach(
        client.index
          .statusStream({ folderId })
          .pipe(
            Stream.catchAll((err) => {
              // eslint-disable-next-line no-console
              console.error("[code-index] status stream errored", err);
              return Stream.empty;
            }),
          ),
        (status: IndexStatusInfo) =>
          Effect.sync(() => {
            set((s) => ({
              statusByFolder: { ...s.statusByFolder, [folderId]: status },
            }));
          }),
      );
      fibersByFolder.set(folderId, Effect.runFork(program));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[code-index] hydrate failed", err);
    }
  },
  stopAll: async () => {
    const ids = Array.from(fibersByFolder.keys());
    await Promise.all(ids.map(stopFiber));
  },
}));
