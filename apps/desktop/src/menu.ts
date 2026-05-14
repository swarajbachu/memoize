import {
  app,
  BrowserWindow,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";

/**
 * Action ids that travel from a menu click → renderer (via
 * `webContents.send("menu:action", ...)`) → the `useMenuShortcuts` hook.
 * Mirrored in `apps/renderer/src/lib/bridge.ts` as `MenuAction`.
 */
type MenuAction =
  | "new-chat"
  | "open-project"
  | "settings"
  | "toggle-left-sidebar"
  | "toggle-right-sidebar"
  | "toggle-terminal"
  | "focus-composer";

/**
 * Install the native Application Menu. The `getWindow` closure is read on
 * every click so menu items always target the currently-active window
 * even after a close/re-open cycle (macOS dock-launch).
 */
export function installAppMenu(getWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === "darwin";

  const send = (action: MenuAction) => () => {
    const win = getWindow();
    if (win === null) return;
    win.webContents.send("menu:action", action);
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      {
        label: "New Chat",
        accelerator: "CmdOrCtrl+N",
        click: send("new-chat"),
      },
      {
        label: "Open Project…",
        accelerator: "CmdOrCtrl+O",
        click: send("open-project"),
      },
      ...(isMac
        ? []
        : ([
            { type: "separator" },
            {
              label: "Settings…",
              accelerator: "CmdOrCtrl+,",
              click: send("settings"),
            },
            { type: "separator" },
            { role: "quit" },
          ] satisfies MenuItemConstructorOptions[])),
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? ([
            { role: "pasteAndMatchStyle" },
            { role: "delete" },
            { role: "selectAll" },
          ] satisfies MenuItemConstructorOptions[])
        : ([
            { role: "delete" },
            { type: "separator" },
            { role: "selectAll" },
          ] satisfies MenuItemConstructorOptions[])),
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      {
        label: "Toggle Sidebar",
        accelerator: "CmdOrCtrl+B",
        click: send("toggle-left-sidebar"),
      },
      {
        label: "Toggle Files Pane",
        accelerator: "CmdOrCtrl+Alt+B",
        click: send("toggle-right-sidebar"),
      },
      {
        label: "Toggle Terminal",
        accelerator: "CmdOrCtrl+J",
        click: send("toggle-terminal"),
      },
      {
        label: "Focus Composer",
        accelerator: "CmdOrCtrl+L",
        click: send("focus-composer"),
      },
      { type: "separator" },
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: "Window",
    submenu: isMac
      ? [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
          { type: "separator" },
          { role: "close" },
        ]
      : [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
  };

  const helpMenu: MenuItemConstructorOptions = {
    role: "help",
    submenu: [
      {
        label: "memoize on GitHub",
        click: () => {
          void shell.openExternal("https://github.com/forkzero/memoize");
        },
      },
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Settings…",
                accelerator: "CmdOrCtrl+,",
                click: send("settings"),
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } satisfies MenuItemConstructorOptions,
        ] satisfies MenuItemConstructorOptions[])
      : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
    helpMenu,
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
