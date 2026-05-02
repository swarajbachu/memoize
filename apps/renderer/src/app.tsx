import { useEffect } from "react";
import { Effect } from "effect";

import { FolderSidebar } from "./components/folder-sidebar";
import { TerminalPane } from "./components/terminal-pane";
import { GitHistoryPane } from "./components/git-history-pane";
import { getRpcClient } from "./lib/rpc-client.ts";

export function App() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const client = await getRpcClient();
        const result = await Effect.runPromise(client.ping.ping({}));
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.log("[forkzero] RPC smoke test:", JSON.stringify(result));
      } catch (error) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[forkzero] RPC smoke test failed:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid h-screen w-screen grid-cols-[240px_1fr_320px] bg-[var(--color-bg)] text-[var(--color-fg)]">
      <FolderSidebar />
      <main className="flex min-w-0 flex-col border-x border-[var(--color-border)]">
        <header className="flex h-9 items-center px-3 text-xs text-[var(--color-fg-muted)] [-webkit-app-region:drag]">
          <span className="ml-16 select-none">main · scratch session</span>
        </header>
        <div className="min-h-0 flex-1">
          <TerminalPane />
        </div>
      </main>
      <GitHistoryPane />
    </div>
  );
}
