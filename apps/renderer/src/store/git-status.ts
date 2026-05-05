import { Effect } from "effect";
import { create } from "zustand";

import type { FolderId, GitStatusSummary } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * Per-project `git status` summary used by the top bar to decide which
 * workflow button to surface (Commit & push / Create PR / View PR). Polled
 * every 5 s while a folder is selected — `git status` is cheap and the
 * latency budget is "user perceives the right button shortly after they
 * touch a file." A dedicated stream RPC could replace the poll later.
 */
type StatusMap = Record<string, GitStatusSummary>;

type GitStatusState = {
  readonly byFolder: StatusMap;
  readonly refresh: (folderId: FolderId) => Promise<void>;
};

const fetchStatus = async (
  folderId: FolderId,
): Promise<GitStatusSummary | null> => {
  try {
    const client = await getRpcClient();
    return await Effect.runPromise(client.git.status({ folderId }));
  } catch {
    return null;
  }
};

export const useGitStatusStore = create<GitStatusState>((set) => ({
  byFolder: {},
  refresh: async (folderId) => {
    const summary = await fetchStatus(folderId);
    if (summary === null) return;
    set((s) => ({ byFolder: { ...s.byFolder, [folderId]: summary } }));
  },
}));
