import { useEffect } from "react";
import { Effect } from "effect";

import { ChatComposer } from "./components/chat-composer";
import { ChatView } from "./components/chat-view";
import { CostFooter } from "./components/cost-footer";
import { FileEditor } from "./components/file-editor.tsx";
import { MainTabs } from "./components/main-tabs.tsx";
import { PermissionToast } from "./components/permission-toast";
import { ProjectsSidebar } from "./components/projects-sidebar";
import { RightPane } from "./components/right-pane";
import { SettingsPage } from "./components/settings-page";
import { getRpcClient } from "./lib/rpc-client.ts";
import { usePermissionsStore } from "./store/permissions.ts";
import { useSessionsStore } from "./store/sessions.ts";
import { useUiStore } from "./store/ui.ts";
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

  const startPermissionsStream = usePermissionsStore((s) => s.start);
  useEffect(() => {
    startPermissionsStream();
  }, [startPermissionsStream]);

  const view = useUiStore((s) => s.view);
  const activeMainTab = useUiStore((s) => s.activeMainTab);
  const openFile = useUiStore((s) => s.openFile);
  const closeFileTab = useUiStore((s) => s.closeFileTab);

  // Switching projects in the left sidebar closes the file tab — its path
  // wouldn't resolve under the new project's root anyway. Run only when the
  // selected folder actually leaves the open file behind.
  useEffect(() => {
    if (openFile === null) return;
    if (selectedFolderId !== null && openFile.folderId === selectedFolderId) {
      return;
    }
    closeFileTab();
  }, [selectedFolderId, openFile, closeFileTab]);

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

  const headerLabel = selectedSession
    ? selectedSession.title
    : selectedFolder
      ? selectedFolder.name
      : "no project selected";

  return (
    <div className="dark flex h-dvh max-h-dvh min-h-0 w-screen overflow-hidden text-foreground">
      <div className="flex w-[260px] shrink-0 flex-col">
        <ProjectsSidebar />
      </div>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col border-x border-border bg-zinc-950">
        {view === "settings" ? (
          <SettingsPage />
        ) : (
          <>
            <MainTabs
              headerLabel={headerLabel}
              headerTitle={selectedFolder?.path}
            />
            <div
              hidden={activeMainTab !== "chat"}
              className="flex min-h-0 flex-1 flex-col"
            >
              {selectedSessionId !== null && selectedSession !== null ? (
                <>
                  <PermissionToast sessionId={selectedSessionId} />
                  <ChatView sessionId={selectedSessionId} />
                  <CostFooter sessionId={selectedSessionId} />
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
            </div>
            {openFile !== null && (
              <div
                hidden={activeMainTab !== "file"}
                className="flex min-h-0 flex-1 flex-col"
              >
                <FileEditor />
              </div>
            )}
          </>
        )}
      </main>
      <div className="flex w-[320px] shrink-0 flex-col bg-zinc-950">
        <RightPane />
      </div>
    </div>
  );
}
