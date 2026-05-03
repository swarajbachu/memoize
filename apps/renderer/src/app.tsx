import { useEffect } from "react";
import { Effect } from "effect";

import { AgentLauncher } from "./components/agent-launcher";
import { AgentPanel } from "./components/agent-panel";
import { CredentialsSheet } from "./components/credentials-sheet";
import { FolderSidebar } from "./components/folder-sidebar";
import { TerminalPane } from "./components/terminal-pane";
import { GitHistoryPane } from "./components/git-history-pane";
import { getRpcClient } from "./lib/rpc-client.ts";
import { useAgentsStore } from "./store/agents.ts";
import { useWorkspaceStore } from "./store/workspace.ts";

export function App() {
  const folders = useWorkspaceStore((s) => s.folders);
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const activeSession = useAgentsStore((s) => s.activeSession);
  const selected = selectedFolderId
    ? (folders.find((f) => f.id === selectedFolderId) ?? null)
    : null;

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
    <div className="dark grid h-screen w-screen grid-cols-[240px_1fr_320px] text-foreground">
      <FolderSidebar />
      <main className="flex min-w-0 flex-col border-x border-border bg-background">
        <header className="flex h-9 items-center px-3 text-xs text-muted-foreground [-webkit-app-region:drag]">
          <span className="ml-16 select-none truncate" title={selected?.path}>
            {selected ? selected.name : "no folder selected"}
          </span>
        </header>
        <div className="min-h-0 flex-1">
          <TerminalPane />
        </div>
      </main>
      {activeSession === null ? <GitHistoryPane /> : <AgentPanel />}
      <AgentLauncher />
      <CredentialsSheet />
    </div>
  );
}
