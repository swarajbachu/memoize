import type React from "react";
import { useEffect, useState } from "react";
import { Effect } from "effect";
import { MotionConfig } from "motion/react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
} from "react-resizable-panels";

import { cn } from "./lib/utils.ts";
import { springSoft } from "./lib/motion.ts";

import { ChatComposer } from "./components/chat-composer";
import { ChatLanding } from "./components/chat-landing.tsx";
import { ArchivedChatsPage } from "./components/archived-chats-page.tsx";
import { CliUpgradeBanner } from "./components/cli-upgrade-banner.tsx";
import { NextUnreadButton } from "./components/next-unread-button.tsx";
import { IndexProgressBanner } from "./components/index-progress-banner.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { ChatView } from "./components/chat-view";
import { CostFooter } from "./components/cost-footer";
import { FileEditor } from "./components/file-editor.tsx";
import { closeActiveChatTab, MainTabs } from "./components/main-tabs.tsx";
import { OnboardingWizard } from "./components/onboarding/onboarding-wizard.tsx";
import { ProjectsSidebar } from "./components/projects-sidebar";
import { ProviderUpdatesToast } from "./components/provider-updates-toast.tsx";
import { RightPane } from "./components/right-pane";
import { SettingsPage } from "./components/settings-page";
import {
  SidebarPeekOverlay,
  SidebarPeekTrigger,
} from "./components/sidebar-peek.tsx";
import { TopBarLeft, TopBarMain, TopBarRight } from "./components/top-bar.tsx";
import { UpdateBanner } from "./components/update-banner.tsx";
import { UsageDashboard } from "./components/usage-dashboard.tsx";
import { useKeybindingDispatch } from "./hooks/use-keybinding-dispatch.ts";
import { useMenuShortcuts } from "./hooks/use-menu-shortcuts.ts";
import { getRpcClient } from "./lib/rpc-client.ts";
import { useKeybindingsStore } from "./store/keybindings.ts";
import { usePermissionsStore } from "./store/permissions.ts";
import { useProvidersStore } from "./store/providers.ts";
import { useSessionsStore } from "./store/sessions.ts";
import { useSettingsStore } from "./store/settings.ts";
import { hydrateSubagentsStore } from "./store/subagents.ts";
import { useIndexStore } from "./store/code-index.ts";
import { useUiStore } from "./store/ui.ts";
import { useWorkspaceStore } from "./store/workspace.ts";
import { useWorktreesStore } from "./store/worktrees.ts";

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

  // Document-level keybinding dispatcher. Walks the live keybindings store
  // on every keydown and fires the matching application command. Composer
  // and editor commands are handled by CodeMirror keymaps, so this hook
  // ignores them.
  useKeybindingDispatch();

  // Hydrate settings + keybindings + subagents from the on-disk config
  // store. Each call is idempotent; subsequent emits flow through the
  // RPC streams maintained by the stores themselves.
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydrateKeybindings = useKeybindingsStore((s) => s.hydrate);
  useEffect(() => {
    void hydrateSettings();
    void hydrateKeybindings();
    void hydrateSubagentsStore();
  }, [hydrateSettings, hydrateKeybindings]);

  // Probe provider availability once on boot so the "update available" launch
  // toast can fire without the user first opening settings. ProvidersPane
  // keeps its own mount/focus refresh for live updates while settings is open.
  const refreshProviders = useProvidersStore((s) => s.refresh);
  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  // Mirror Electron's fullscreen state into the ui store so the top bars
  // can drop the macOS traffic-light gutter.
  const setFullScreen = useUiStore((s) => s.setFullScreen);
  useEffect(() => {
    const win = window.memoize?.window;
    if (win === undefined) return;
    return win.onFullScreenChange((value) => setFullScreen(value));
  }, [setFullScreen]);

  // One-shot RPC ping so we know the bridge is alive early. Only the failure
  // is logged — the success path is silent to keep the renderer console clean.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const client = await getRpcClient();
        await Effect.runPromise(client.ping.ping({}));
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

  let content: React.ReactNode;
  if (!onboardingCompleted) {
    content = (
      <div className="dark relative flex h-dvh max-h-dvh min-h-0 w-screen overflow-hidden bg-background text-foreground">
        <OnboardingWizard />
      </div>
    );
  } else if (view === "settings") {
    content = (
      <div className="dark flex h-dvh max-h-dvh min-h-0 w-screen overflow-hidden bg-background text-foreground">
        <SettingsPage />
      </div>
    );
  } else {
    content = <MainShell />;
  }

  // `reducedMotion="user"` makes every motion component in the tree honor the
  // OS "Reduce Motion" setting (transforms/opacity snap to their end state),
  // so individual animated surfaces don't each need their own guard. The
  // shared spring becomes the default transition for any component that
  // doesn't specify its own.
  return (
    <MotionConfig reducedMotion="user" transition={springSoft}>
      <TooltipProvider>{content}</TooltipProvider>
    </MotionConfig>
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
  const usageScope = useUiStore((s) => s.usageScope);
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
    if (openFile.kind !== "text") return;
    if (selectedFolderId !== null && openFile.folderId === selectedFolderId) {
      return;
    }
    closeFileTab();
  }, [selectedFolderId, openFile, closeFileTab]);

  // Open a status subscription for the selected workspace's index. Server
  // already triggered `ensureIndexed` on `workspace.setSelected`; this just
  // gives the renderer something to render. `hydrate` no-ops on duplicate
  // calls, so re-selecting the same folder doesn't re-open the stream.
  const hydrateIndex = useIndexStore((s) => s.hydrate);
  useEffect(() => {
    if (selectedFolderId === null) return;
    void hydrateIndex(selectedFolderId);
  }, [selectedFolderId, hydrateIndex]);

  // Eagerly hydrate worktrees on project select so the active context can
  // resolve worktree paths without waiting for the chat composer to mount.
  // Without this, terminal/file-tree/branch label stay in "preparing
  // worktree" until the user opens the chat tab.
  const refreshWorktrees = useWorktreesStore((s) => s.refresh);
  useEffect(() => {
    if (selectedFolderId === null) return;
    void refreshWorktrees(selectedFolderId);
  }, [selectedFolderId, refreshWorktrees]);

  // Cmd+W in the menu dispatches `menu:close-tab` over IPC; the renderer
  // owns the close-tab logic because it knows which surface is active. If
  // the file tab is foregrounded we close that; otherwise we fall through
  // to the chat-tab archive path.
  useEffect(() => {
    const menu = window.memoize?.menu;
    if (menu === undefined) return;
    return menu.onCloseTab(() => {
      const { activeMainTab, closeFileTab, openFile } = useUiStore.getState();
      if (activeMainTab === "file" && openFile !== null) {
        closeFileTab();
        return;
      }
      void closeActiveChatTab();
    });
  }, []);

  const emptyTabLabel = selectedFolder
    ? selectedFolder.name
    : "no project selected";

  // The empty new-chat landing reads as a clean, chrome-free surface: no top
  // bar, no tab strip — just the centered composer. Keep the chrome whenever a
  // session/file is open, or when the left panel is collapsed (so the user
  // always has a way back to the projects panel + the window drag region).
  const showMainChrome =
    selectedSessionId !== null || openFile !== null || !leftSidebarOpen;

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

  // Animate the side panels' width when they collapse/expand via toggle, but
  // NOT while the user is dragging a separator (a transition there would lag a
  // frame behind the cursor). `react-resizable-panels` sets `flex-grow` /
  // `flex-basis` inline on its `[data-panel]` elements and applies our
  // `className` to a *nested* div, so we can't transition the flex element
  // directly — instead we gate a descendant-targeted transition on the shell
  // wrapper we own, switching it off for the duration of a drag. `mounted`
  // suppresses the transition on first paint so the layout doesn't animate in
  // from zero width.
  const [isResizing, setIsResizing] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const stop = () => setIsResizing(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);
  const animatePanels = mounted && !isResizing;
  const beginResize = () => setIsResizing(true);

  return (
    <div
      className={cn(
        "dark flex h-dvh max-h-dvh min-h-0 w-screen overflow-hidden text-foreground",
        // Width transition on collapse/expand — disabled mid-drag so manual
        // resizing tracks the cursor 1:1.
        animatePanels &&
          "[&_[data-panel]]:transition-[flex-grow,flex-basis] [&_[data-panel]]:duration-200 [&_[data-panel]]:ease-out",
      )}
    >
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
          <div
            className={cn(
              "flex h-full min-h-0 flex-col bg-background transition-opacity duration-200 ease-out",
              !leftSidebarOpen && "opacity-0",
            )}
          >
            <TopBarLeft />
            <div className="flex min-h-0 flex-1 flex-col">
              <ProjectsSidebar />
            </div>
          </div>
        </Panel>
        <Separator
          onPointerDown={beginResize}
          className="w-px bg-border transition-colors hover:bg-foreground/20 active:bg-foreground/30"
        />
        <Panel id="main" minSize="30%">
          <main className="flex h-full min-h-0 min-w-0 flex-col bg-background">
            {showMainChrome ? <TopBarMain /> : null}
            <UpdateBanner />
            <ProviderUpdatesToast />
            <IndexProgressBanner />
            {showMainChrome ? (
              <MainTabs projectId={selectedFolderId} emptyLabel={emptyTabLabel} />
            ) : null}
            <div
              hidden={activeMainTab !== "chat"}
              className="flex min-h-0 flex-1 flex-col"
            >
              {selectedSessionId !== null && selectedSession !== null ? (
                // Render the chat as soon as the session exists — even while
                // its worktree is still branching or the provider is booting.
                // All that progress is surfaced inline by `WorktreeSetupCard`
                // at the top of the timeline, with the composer pinned at the
                // bottom (no full-screen takeover).
                <>
                  <ChatView sessionId={selectedSessionId} />
                  <CostFooter sessionId={selectedSessionId} />
                  <CliUpgradeBanner providerId={selectedSession.providerId} />
                  <NextUnreadButton />
                  <ChatComposer
                    key={selectedSession.id}
                    session={selectedSession}
                  />
                </>
              ) : (
                <ChatLanding />
              )}
            </div>
            <div
              hidden={activeMainTab !== "archives"}
              className="flex min-h-0 flex-1 flex-col"
            >
              {activeMainTab === "archives" && (
                <ArchivedChatsPage
                  projectId={selectedFolderId}
                  projectName={selectedFolder?.name ?? "No repository selected"}
                />
              )}
            </div>
            <div
              hidden={activeMainTab !== "usage"}
              className="flex min-h-0 flex-1 flex-col"
            >
              {activeMainTab === "usage" && (
                <UsageDashboard
                  projectId={usageScope === "project" ? selectedFolderId : null}
                  scopeLabel={
                    usageScope === "project"
                      ? (selectedFolder?.name ?? "This project")
                      : "All projects"
                  }
                />
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
        <Separator
          onPointerDown={beginResize}
          className="w-px bg-border transition-colors hover:bg-foreground/20 active:bg-foreground/30"
        />
        <Panel
          id="files"
          defaultSize="22%"
          minSize="220px"
          maxSize="45%"
          collapsible
          collapsedSize="0%"
          panelRef={rightPanelRef}
          onResize={(size, _id, prev) => {
            // Ignore the initial mount call (prev === undefined). The right
            // dock defaults to closed (`rightSidebarOpen: false`); the
            // persisted/default panel width would otherwise fire here and
            // flip the sidebar open before the collapse effect runs.
            if (prev === undefined) return;
            const open = size.asPercentage > 0;
            if (open !== rightSidebarOpen) setRightSidebarOpen(open);
          }}
        >
          <div
            className={cn(
              "flex h-full min-h-0 flex-col bg-sidebar transition-opacity duration-200 ease-out",
              !rightSidebarOpen && "opacity-0",
            )}
          >
            <TopBarRight />
            <div className="flex min-h-0 flex-1 flex-col">
              <RightPane />
            </div>
          </div>
        </Panel>
      </Group>
      <SidebarPeekTrigger />
      <SidebarPeekOverlay />
    </div>
  );
}
