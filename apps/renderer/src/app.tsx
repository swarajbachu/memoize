import { useEffect } from "react";
import { Effect } from "effect";

import { ChatComposer } from "./components/chat-composer";
import { ChatView } from "./components/chat-view";
import { CredentialsSheet } from "./components/credentials-sheet";
import { GitHistoryPane } from "./components/git-history-pane";
import { ProjectsSidebar } from "./components/projects-sidebar";
import { getRpcClient } from "./lib/rpc-client.ts";
import { useSessionsStore } from "./store/sessions.ts";
import { useWorkspaceStore } from "./store/workspace.ts";

export function App() {
  const folders = useWorkspaceStore((s) => s.folders);
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const selectedSessionId = useSessionsStore((s) => s.selectedSessionId);
  const selectedSession = useSessionsStore((s) => {
    if (s.selectedSessionId === null) return null;
    for (const list of Object.values(s.sessionsByProject)) {
      const match = list.find((session) => session.id === s.selectedSessionId);
      if (match !== undefined) return match;
    }
    return null;
  });
  const selectedFolder = selectedFolderId
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
    <div className="dark flex h-dvh max-h-dvh min-h-0 w-screen overflow-hidden text-foreground">
      <div className="flex w-[260px] shrink-0 flex-col">
        <ProjectsSidebar />
      </div>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col border-x border-border bg-zinc-950">
        <header className="flex h-9 shrink-0 items-center px-3 text-xs text-muted-foreground [-webkit-app-region:drag]">
          <span className="ml-16 select-none truncate" title={selectedFolder?.path}>
            {selectedSession
              ? selectedSession.title
              : selectedFolder
                ? selectedFolder.name
                : "no project selected"}
          </span>
        </header>
        {selectedSessionId !== null && selectedSession !== null ? (
          <>
            <ChatView sessionId={selectedSessionId} />
            <ChatComposer session={selectedSession} />
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <p>
              {selectedFolder === null
                ? "Add a project on the left to begin."
                : "Pick or create a session in the sidebar."}
            </p>
          </div>
        )}
      </main>
      <div className="flex w-[320px] shrink-0 flex-col bg-zinc-950">
        <GitHistoryPane />
      </div>
      <CredentialsSheet />
    </div>
  );
}
