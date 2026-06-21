import { Effect } from "effect";
import { create } from "zustand";

import type { FolderId, UsageBucket, UsageReport } from "@memoize/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

type UsageState = {
  readonly report: UsageReport | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly bucket: UsageBucket;
  readonly refresh: (projectId: FolderId | null) => Promise<void>;
  readonly setBucket: (bucket: UsageBucket, projectId: FolderId | null) => Promise<void>;
};

export const useUsageStore = create<UsageState>((set, get) => ({
  report: null,
  loading: false,
  error: null,
  bucket: "daily",
  refresh: async (projectId) => {
    const bucket = get().bucket;
    set({ loading: true, error: null });
    try {
      const client = await getRpcClient();
      const report = await Effect.runPromise(
        client.usage.report({
          bucket,
          projectId: projectId ?? undefined,
        }),
      );
      set({ report, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  setBucket: async (bucket, projectId) => {
    set({ bucket });
    await get().refresh(projectId);
  },
}));
