import {
  app,
  BrowserWindow,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";

/**
 * Action ids that travel from a menu click → renderer (via
 * `webContents.send("menu:action", ...)`) → the keybinding-dispatcher
 * `commands.ts` registry in the renderer. The set mirrors the menu-relevant
 * subset of `Command` in `@memoize/wire/keybindings`.
 */
export type MenuCommand =
  | "new-chat"
  | "open-project"
  | "settings"
  | "close-tab"
  | "toggle-left-sidebar"
  | "toggle-right-sidebar"
  | "toggle-terminal"
  | "focus-composer";

/**
 * Accelerator strings to attach to each menu item, keyed by command. A
 * `null` value omits the accelerator (e.g. user has unbound the command).
 * The shape is intentionally exhaustive over `MenuCommand` so a missing
 * field at the call site is a compile error.
 */
export type MenuAccelerators = Readonly<Record<MenuCommand, string | null>>;

/**
 * Fallback accelerators used before the config store has reported the
 * user's overrides. Mirrors the hardcoded values that lived in this file
 * pre-refactor. The renderer's `default-keybindings.ts` is the long-term
 * source of truth; this map is just so the menu installs sanely on first
 * paint before the Effect runtime is up.
 */
export const DEFAULT_MENU_ACCELERATORS: MenuAccelerators = {
  "new-chat": "CmdOrCtrl+N",
  "open-project": "CmdOrCtrl+O",
  settings: "CmdOrCtrl+,",
  "close-tab": "CmdOrCtrl+W",
  "toggle-left-sidebar": "CmdOrCtrl+B",
  "toggle-right-sidebar": "CmdOrCtrl+Alt+B",
  "toggle-terminal": "CmdOrCtrl+J",
  "focus-composer": "CmdOrCtrl+L",
};

/**
 * Build + install the native Application Menu. Safe to call multiple times
 * — Electron swaps the menu in place, which is how user keybinding edits
 * become effective without an app restart.
 *
 * `getWindow` is read on every click so menu items always target the
 * currently-active window even after a close/re-open cycle (macOS
 * dock-launch).
 */
export function installAppMenu(
  getWindow: () => BrowserWindow | null,
  accelerators: MenuAccelerators = DEFAULT_MENU_ACCELERATORS,
): void {
  const isMac = process.platform === "darwin";

  const sendAction =
    (action: Exclude<MenuCommand, "close-tab">) =>
    () => {
      const win = getWindow();
      if (win === null) return;
      win.webContents.send("menu:action", action);
    };

  const sendCloseTab = () => {
    const win = getWindow();
    if (win === null) return;
    win.webContents.send("menu:close-tab");
  };

  /** undefined when unbound, so Electron drops the accelerator entirely. */
  const accelOrUndefined = (cmd: MenuCommand): string | undefined =>
    accelerators[cmd] ?? undefined;

  const fileMenu: MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      {
        label: "New Chat",
        accelerator: accelOrUndefined("new-chat"),
        click: sendAction("new-chat"),
      },
      {
        label: "Open Project…",
        accelerator: accelOrUndefined("open-project"),
        click: sendAction("open-project"),
      },
      { type: "separator" },
      {
        // Closes the active CHAT tab, not the OS window. The renderer owns
        // the close-tab logic (it knows which tab is active); we just hand
        // the signal across IPC.
        label: "Close Tab",
        accelerator: accelOrUndefined("close-tab"),
        click: sendCloseTab,
      },
      ...(isMac
        ? []
        : ([
            { type: "separator" },
            {
              label: "Settings…",
              accelerator: accelOrUndefined("settings"),
              click: sendAction("settings"),
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
        accelerator: accelOrUndefined("toggle-left-sidebar"),
        click: sendAction("toggle-left-sidebar"),
      },
      {
        label: "Toggle Files Pane",
        accelerator: accelOrUndefined("toggle-right-sidebar"),
        click: sendAction("toggle-right-sidebar"),
      },
      {
        label: "Toggle Terminal",
        accelerator: accelOrUndefined("toggle-terminal"),
        click: sendAction("toggle-terminal"),
      },
      {
        label: "Focus Composer",
        accelerator: accelOrUndefined("focus-composer"),
        click: sendAction("focus-composer"),
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
    // Intentionally omits `role: "close"`. Electron's default close-window
    // accelerator is also Cmd+W, which would shadow the File → Close Tab
    // item — and the user wants Cmd+W to close the active chat tab, not
    // the OS window. Window close is still reachable via the traffic light.
    submenu: isMac
      ? [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
        ]
      : [{ role: "minimize" }, { role: "zoom" }],
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
                accelerator: accelOrUndefined("settings"),
                click: sendAction("settings"),
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
