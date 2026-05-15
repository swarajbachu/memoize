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
import { CliUpgradeBanner } from "./components/cli-upgrade-banner.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { ChatView } from "./components/chat-view";
import { CostFooter } from "./components/cost-footer";
import { FileEditor } from "./components/file-editor.tsx";
import { MainTabs } from "./components/main-tabs.tsx";
import { OnboardingWizard } from "./components/onboarding/onboarding-wizard.tsx";
import { ProjectsSidebar } from "./components/projects-sidebar";
import { RightPane } from "./components/right-pane";
import { SettingsPage } from "./components/settings-page";
import { TopBarLeft, TopBarMain, TopBarRight } from "./components/top-bar.tsx";
import { UpdateBanner } from "./components/update-banner.tsx";
import { useMenuShortcuts } from "./hooks/use-menu-shortcuts.ts";
import { getRpcClient } from "./lib/rpc-client.ts";
import { usePermissionsStore } from "./store/permissions.ts";
import { useSessionsStore } from "./store/sessions.ts";
import { useSettingsStore } from "./store/settings.ts";
import { useUiStore } from "./store/ui.ts";
import { useWorkspaceStore } from "./store/workspace.ts";

const PANEL_GROUP_ID = "memoize.shell.v3";
const PANEL_IDS = ["projects", "main", "files"];

/**
 * Root component. Owns only the cross-cutting concerns that need to run in
 * every mode (permissions stream, fullscreen sync, onboarding gate). The
 * heavy three-pane shell lives in `MainShell` so its layout hooks don't
 * initialize while the onboarding wizard is on screen — re-mounting it on
 * exit is what gives us a clean shell each time.
 */
export function App() {
  // Cross-cutting subscriptions that should run regardless of view.
  const startPermissionsStream = usePermissionsStore((s) => s.start);
  useEffect(() => {
    startPermissionsStream();
  }, [startPermissionsStream]);

  // Native Application Menu → renderer action dispatcher. Lives on the
  // root so the bindings work in every view (chat, settings, onboarding).
  useMenuShortcuts();

  // Mirror Electron's fullscreen state into the ui store so the top bars
  // can drop the macOS traffic-light gutter.
  const setFullScreen = useUiStore((s) => s.setFullScreen);
  useEffect(() => {
    const win = window.memoize?.window;
    if (win === undefined) return;
    return win.onFullScreenChange((value) => setFullScreen(value));
  }, [setFullScreen]);

  // One-shot RPC ping so we know the bridge is alive early.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const client = await getRpcClient();
        const result = await Effect.runPromise(client.ping.ping({}));
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.log("[memoize] RPC smoke test:", JSON.stringify(result));
      } catch (error) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[memoize] RPC smoke test failed:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted);
  const view = useUiStore((s) => s.view);

  if (!onboardingCompleted) {
    return (
      <TooltipProvider>
        <div className="dark relative flex h-dvh max-h-dvh min-h-0 w-screen overflow-hidden bg-background/40 text-foreground">
          <OnboardingWizard />
        </div>
      </TooltipProvider>
    );
  }

  if (view === "settings") {
    return (
      <TooltipProvider>
        <div className="dark flex h-dvh max-h-dvh min-h-0 w-screen overflow-hidden bg-background/70 text-foreground">
          <SettingsPage />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <MainShell />
    </TooltipProvider>
  );
}

/**
 * The three-pane chat shell. Owns its own layout/panel hooks so they
 * initialize on mount (i.e. only after onboarding is past). Re-mounting
 * this component on every onboarding exit guarantees the layout starts
 * from a clean state.
 */
function MainShell() {
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

  const activeMainTab = useUiStore((s) => s.activeMainTab);
  const openFile = useUiStore((s) => s.openFile);
  const closeFileTab = useUiStore((s) => s.closeFileTab);
  const leftSidebarOpen = useUiStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = useUiStore((s) => s.setLeftSidebarOpen);
  const rightSidebarOpen = useUiStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useUiStore((s) => s.setRightSidebarOpen);

  // Switching projects closes the file tab — its path wouldn't resolve
  // under the new project's root anyway.
  useEffect(() => {
    if (openFile === null) return;
    if (selectedFolderId !== null && openFile.folderId === selectedFolderId) {
      return;
    }
    closeFileTab();
  }, [selectedFolderId, openFile, closeFileTab]);

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

  // Drive the side panels' collapsed state from `useUiStore`. v4 has no
  // `onCollapse` prop — we peek the imperative handle through `panelRef` and
  // sync against the store on every render.
  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();
  useEffect(() => {
    const panel = leftPanelRef.current;
    if (panel === null) return;
    const collapsed = panel.isCollapsed();
    if (leftSidebarOpen && collapsed) panel.expand();
    if (!leftSidebarOpen && !collapsed) panel.collapse();
  }, [leftPanelRef, leftSidebarOpen]);
  useEffect(() => {
    const panel = rightPanelRef.current;
    if (panel === null) return;
    const collapsed = panel.isCollapsed();
    if (rightSidebarOpen && collapsed) panel.expand();
    if (!rightSidebarOpen && !collapsed) panel.collapse();
  }, [rightPanelRef, rightSidebarOpen]);

  return (
    <div className="dark flex h-dvh max-h-dvh min-h-0 w-screen overflow-hidden text-foreground">
      <Group
        id={PANEL_GROUP_ID}
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="flex-1"
      >
        <Panel
          id="projects"
          defaultSize="18%"
          minSize="180px"
          maxSize="40%"
          collapsible
          collapsedSize="0%"
          panelRef={leftPanelRef}
          onResize={(size) => {
            const open = size.asPercentage > 0;
            if (open !== leftSidebarOpen) setLeftSidebarOpen(open);
          }}
        >
          <div className="flex h-full min-h-0 flex-col bg-background/20">
            <TopBarLeft />
            <div className="flex min-h-0 flex-1 flex-col">
              <ProjectsSidebar />
            </div>
          </div>
        </Panel>
        <Separator className="w-px bg-border transition-colors hover:bg-foreground/20 active:bg-foreground/30" />
        <Panel id="main" minSize="30%">
          <main className="flex h-full min-h-0 min-w-0 flex-col bg-background/70 backdrop-blur-3xl">
            <TopBarMain folderId={selectedFolderId} />
            <UpdateBanner />
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
                  <ChatView sessionId={selectedSessionId} />
                  <CostFooter sessionId={selectedSessionId} />
                  <CliUpgradeBanner
                    providerId={selectedSession.providerId}
                  />
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
          <div className="flex h-full min-h-0 flex-col bg-sidebar/40 backdrop-blur-3xl">
            <TopBarRight folderId={selectedFolderId} />
            <div className="flex min-h-0 flex-1 flex-col">
              <RightPane />
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  );
}
