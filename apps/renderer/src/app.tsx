import { useEffect } from "react";
import { Effect } from "effect";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
} from "react-resizable-panels";

import { ChatComposer } from "./components/chat-composer";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { ChatView } from "./components/chat-view";
import { FileEditor } from "./components/file-editor.tsx";
import { MainTabs } from "./components/main-tabs.tsx";
import { PermissionToast } from "./components/permission-toast";
import { ProjectsSidebar } from "./components/projects-sidebar";
import { RightPane } from "./components/right-pane";
import { SettingsPage } from "./components/settings-page";
import { TopBar } from "./components/top-bar.tsx";
import { getRpcClient } from "./lib/rpc-client.ts";
import { usePermissionsStore } from "./store/permissions.ts";
import { useSessionsStore } from "./store/sessions.ts";
import { useUiStore } from "./store/ui.ts";
import { useWorkspaceStore } from "./store/workspace.ts";

const PANEL_GROUP_ID = "forkzero.shell.v2";
const PANEL_IDS = ["projects", "main", "files"];

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
  const rightSidebarOpen = useUiStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useUiStore((s) => s.setRightSidebarOpen);

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

  // Persist the three-pane layout in localStorage so widths survive reloads.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: PANEL_GROUP_ID,
    panelIds: PANEL_IDS,
    storage: typeof window === "undefined" ? undefined : window.localStorage,
  });

  // Drive the right panel's collapsed state from `useUiStore` so the top-bar
  // toggle button can collapse/expand it. v4 has no `onCollapse` prop — we
  // peek the imperative handle through `panelRef` and compare against the
  // store on every render.
  const rightPanelRef = usePanelRef();
  useEffect(() => {
    const panel = rightPanelRef.current;
    if (panel === null) return;
    const collapsed = panel.isCollapsed();
    if (rightSidebarOpen && collapsed) panel.expand();
    if (!rightSidebarOpen && !collapsed) panel.collapse();
  }, [rightPanelRef, rightSidebarOpen]);

  return (
    <TooltipProvider>
    <div className="dark flex h-dvh max-h-dvh min-h-0 w-screen flex-col overflow-hidden text-foreground">
      <TopBar folderId={selectedFolderId} />
      <Group
        id={PANEL_GROUP_ID}
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="min-h-0 flex-1"
      >
        <Panel id="projects" defaultSize="18%" minSize="180px" maxSize="40%">
          <ProjectsSidebar />
        </Panel>
        <Separator className="w-px bg-border transition-colors hover:bg-foreground/20 active:bg-foreground/30" />
        <Panel id="main" minSize="30%">
          <main className="flex h-full min-h-0 min-w-0 flex-col bg-background">
            {view === "settings" ? (
              <SettingsPage />
            ) : (
              <>
                <MainTabs
                  headerLabel={headerLabel}
                  headerTitle={selectedFolder?.path}
                  providerId={selectedSession?.providerId}
                  model={selectedSession?.model}
                />
                <div
                  hidden={activeMainTab !== "chat"}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  {selectedSessionId !== null && selectedSession !== null ? (
                    <>
                      <PermissionToast sessionId={selectedSessionId} />
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
        </Panel>
        <Separator className="w-px bg-border transition-colors hover:bg-foreground/20 active:bg-foreground/30" />
        <Panel
          id="files"
          defaultSize="22%"
          minSize="220px"
          maxSize="45%"
          collapsible
          collapsedSize="0%"
          panelRef={rightPanelRef}
          onResize={(size) => {
            const open = size.asPercentage > 0;
            if (open !== rightSidebarOpen) setRightSidebarOpen(open);
          }}
        >
          <RightPane />
        </Panel>
      </Group>
    </div>
    </TooltipProvider>
  );
}
