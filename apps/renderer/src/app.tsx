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
import { ChatCreatingPanel } from "./components/chat-creating-panel.tsx";
import { ChatLanding } from "./components/chat-landing.tsx";
import { CliUpgradeBanner } from "./components/cli-upgrade-banner.tsx";
import { IndexProgressBanner } from "./components/index-progress-banner.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { ChatView } from "./components/chat-view";
import { CostFooter } from "./components/cost-footer";
import { FileEditor } from "./components/file-editor.tsx";
import { closeActiveChatTab, MainTabs } from "./components/main-tabs.tsx";
import { OnboardingWizard } from "./components/onboarding/onboarding-wizard.tsx";
import { ProjectsSidebar } from "./components/projects-sidebar";
import { RightPane } from "./components/right-pane";
import { SettingsPage } from "./components/settings-page";
import { TopBarLeft, TopBarMain, TopBarRight } from "./components/top-bar.tsx";
import { UpdateBanner } from "./components/update-banner.tsx";
import { useKeybindingDispatch } from "./hooks/use-keybinding-dispatch.ts";
import { useMenuShortcuts } from "./hooks/use-menu-shortcuts.ts";
import { getRpcClient } from "./lib/rpc-client.ts";
import { useKeybindingsStore } from "./store/keybindings.ts";
import { usePermissionsStore } from "./store/permissions.ts";
import { useChatsStore } from "./store/chats.ts";
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
  // Chat-creation in flight for the selected project — drives the
  // step-progress overlay so both the sidebar "+" button and the
  // ChatLanding submit get the same multi-second feedback panel instead
  // of a stale chat view + a tiny spinner on the + icon.
  const creatingChat = useChatsStore((s) =>
    selectedFolderId !== null
      ? s.creatingByProject[selectedFolderId] === true
      : false,
  );
  // Active chat = the chat owning the selected session (if any), else the
  // sidebar's selected chat. Mirrors `MainTabs.activeChatId` so the
  // booting-session loading panel and the tab strip stay in lockstep when
  // the chats store is mid-transition.
  const selectedChatId = useChatsStore((s) => s.selectedChatId);
  const activeChatId =
    selectedSession?.chatId ?? selectedChatId ?? null;
  // Mirror `NewChatTabButton.creating` so the chat surface flips to the
  // loading panel the moment the user clicks "+", even before the
  // optimistic session row lands (~200ms RPC). Once the new row is
  // inserted with status="booting", `creatingForActiveChat` clears and
  // the booting check below carries the panel through the provider boot.
  const creatingForActiveChat = useSessionsStore((s) =>
    activeChatId !== null ? s.creatingByChat[activeChatId] === true : false,
  );
  const selectedSessionBooting = selectedSession?.status === "booting";
  const showSessionBootingPanel =
    !creatingChat && (selectedSessionBooting || creatingForActiveChat);
  const defaultProviderId = useSettingsStore((s) => s.defaultProviderId);
  const defaultAutoCreateWorktree = useSettingsStore(
    (s) => s.defaultAutoCreateWorktree,
  );
  // Provider label for the session-boot panel — falls back to the user's
  // default when no session is selected yet (the brief click → RPC window).
  const bootingProviderId =
    selectedSession?.providerId ?? defaultProviderId;

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
            <TopBarMain />
            <UpdateBanner />
            <IndexProgressBanner />
            <MainTabs
              projectId={selectedFolderId}
              emptyLabel={emptyTabLabel}
            />
            <div
              hidden={activeMainTab !== "chat"}
              className="flex min-h-0 flex-1 flex-col"
            >
              {creatingChat ? (
                <div className="flex min-h-0 flex-1 flex-col px-8 py-6">
                  <p className="mb-4 text-[13px] leading-snug text-foreground/85">
                    {selectedFolder
                      ? <>You're starting a new chat in <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[12px] text-foreground/90">{selectedFolder.name}</code></>
                      : "You're starting a new chat"}
                  </p>
                  <ChatCreatingPanel
                    providerId={defaultProviderId}
                    willCreateWorktree={defaultAutoCreateWorktree}
                    prompt=""
                  />
                </div>
              ) : showSessionBootingPanel ? (
                <div className="flex min-h-0 flex-1 flex-col px-8 py-6">
                  <p className="mb-4 text-[13px] leading-snug text-foreground/85">
                    Starting a new tab in this chat
                  </p>
                  <ChatCreatingPanel
                    providerId={bootingProviderId}
                    willCreateWorktree={false}
                    prompt=""
                  />
                </div>
              ) : selectedSessionId !== null && selectedSession !== null ? (
                <>
                  <ChatView sessionId={selectedSessionId} />
                  <CostFooter sessionId={selectedSessionId} />
                  <CliUpgradeBanner
                    providerId={selectedSession.providerId}
                  />
                  <ChatComposer session={selectedSession} />
                </>
              ) : (
                <ChatLanding />
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
            <TopBarRight />
            <div className="flex min-h-0 flex-1 flex-col">
              <RightPane />
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  );
}
