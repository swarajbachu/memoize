import type { MenuAction } from "./bridge";

/**
 * Canonical list of keyboard shortcuts the app advertises in the menu bar
 * and the settings page. Each entry is the source of truth for both the
 * Electron menu (via the matching `MenuAction` id) and the on-screen
 * surfaces (settings list, tooltips). Keep this in sync with the
 * `installAppMenu` template in `apps/desktop/src/menu.ts`.
 */
export type ShortcutDef = {
  readonly id: MenuAction;
  readonly label: string;
  readonly description: string;
  /** Electron accelerator string ("CmdOrCtrl+..."). */
  readonly accelerator: string;
};

export const SHORTCUTS: ReadonlyArray<ShortcutDef> = [
  {
    id: "new-chat",
    label: "New chat",
    description: "Start a new session in the selected project",
    accelerator: "CmdOrCtrl+N",
  },
  {
    id: "open-project",
    label: "Open project…",
    description: "Pick a folder to add to the workspace",
    accelerator: "CmdOrCtrl+O",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Open or close the settings page",
    accelerator: "CmdOrCtrl+,",
  },
  {
    id: "toggle-left-sidebar",
    label: "Toggle projects panel",
    description: "Show or hide the left projects sidebar",
    accelerator: "CmdOrCtrl+B",
  },
  {
    id: "toggle-right-sidebar",
    label: "Toggle files panel",
    description: "Show or hide the right files sidebar",
    accelerator: "CmdOrCtrl+Alt+B",
  },
  {
    id: "toggle-terminal",
    label: "Toggle terminal",
    description: "Open the right pane and switch to the terminal tab",
    accelerator: "CmdOrCtrl+J",
  },
  {
    id: "focus-composer",
    label: "Focus composer",
    description: "Move the cursor into the chat input",
    accelerator: "CmdOrCtrl+L",
  },
];

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

/** Render an Electron "CmdOrCtrl+..." accelerator using OS-appropriate keys. */
export function formatAccelerator(accel: string): string {
  const tokens = accel.split("+").map(formatToken);
  // ` ` is THIN SPACE — a hair of breathing room between e.g. "⌘" and
  // "N" so the glyph doesn't run into the letter. macOS-only because the
  // non-mac form already has "+" separators.
  return IS_MAC ? tokens.join(" ") : tokens.join("+");
}

function formatToken(token: string): string {
  if (IS_MAC) {
    switch (token) {
      case "CmdOrCtrl":
      case "Cmd":
      case "Meta":
        return "⌘";
      case "Ctrl":
        return "⌃";
      case "Alt":
      case "Option":
        return "⌥";
      case "Shift":
        return "⇧";
      case ",":
        return ",";
      default:
        return token;
    }
  }
  switch (token) {
    case "CmdOrCtrl":
      return "Ctrl";
    case "Meta":
      return "Win";
    default:
      return token;
  }
}

/** Convenience: format the shortcut for a `MenuAction` id. */
export function formatShortcut(id: MenuAction): string {
  const def = SHORTCUTS.find((s) => s.id === id);
  return def ? formatAccelerator(def.accelerator) : "";
}
