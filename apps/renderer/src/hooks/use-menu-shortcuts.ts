import { useEffect } from "react";

import type { MenuAction } from "../lib/bridge";
import { createNewSession } from "../components/projects-sidebar";
import { useComposerBridge } from "../store/composer-bridge";
import { useUiStore } from "../store/ui";
import { useWorkspaceStore } from "../store/workspace";

/**
 * Subscribe to native Application Menu clicks emitted by the main process.
 * Each `MenuAction` dispatches to the relevant store via `.getState()` so
 * we don't re-bind the listener on every render.
 */
export function useMenuShortcuts(): void {
  useEffect(() => {
    const menu = window.memoize?.menu;
    if (menu === undefined) return;

    const handle = (action: MenuAction) => {
      switch (action) {
        case "new-chat": {
          const projectId = useWorkspaceStore.getState().selectedFolderId;
          if (projectId === null) return;
          void createNewSession(projectId);
          return;
        }
        case "open-project": {
          void useWorkspaceStore.getState().add();
          return;
        }
        case "settings": {
          const ui = useUiStore.getState();
          ui.setView(ui.view === "settings" ? "chat" : "settings");
          return;
        }
        case "toggle-left-sidebar": {
          const ui = useUiStore.getState();
          ui.setLeftSidebarOpen(!ui.leftSidebarOpen);
          return;
        }
        case "toggle-right-sidebar": {
          const ui = useUiStore.getState();
          ui.setRightSidebarOpen(!ui.rightSidebarOpen);
          return;
        }
        case "toggle-terminal": {
          const ui = useUiStore.getState();
          if (!ui.rightSidebarOpen) ui.setRightSidebarOpen(true);
          ui.setActiveRightTab(
            ui.activeRightTab === "terminal" && ui.rightSidebarOpen
              ? "files"
              : "terminal",
          );
          return;
        }
        case "focus-composer": {
          useComposerBridge.getState().focus?.();
          return;
        }
      }
    };

    return menu.onAction(handle as (action: string) => void);
  }, []);
}
