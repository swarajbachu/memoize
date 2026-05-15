import { useEffect } from "react";

import {
  type Command,
  evaluateWhen,
  matchesShortcut,
  normalizeEventKey,
} from "@memoize/wire";

import { APPLICATION_COMMANDS, dispatchCommand } from "../lib/commands";
import { useKeybindingsStore } from "../store/keybindings";
import { readWhenContext } from "./use-keybinding-context";

/**
 * Is the host environment a Mac? Read once at module-load — runtime
 * platform doesn't change, and we want a constant for the `matchesShortcut`
 * call (it's pure on `isMac`).
 */
const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

/**
 * Mount a single document-level keydown listener that walks the live
 * keybinding rules, matches against the current event, evaluates the
 * when-clause, and fires the command via `dispatchCommand`. Last-defined
 * rule wins (matching VS Code & t3code) — user overrides land at the end
 * of the merged list and shadow defaults.
 *
 * Composer / editor commands are NOT dispatched from here. CodeMirror's
 * own keymap handles them inside the focused editor; a duplicate fire
 * from the document listener would (a) submit messages twice and (b)
 * race with CodeMirror's preventDefault.
 */
export function useKeybindingDispatch(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Cheap bail-out for modifier-only events (Shift, Ctrl, Cmd, Alt
      // pressed alone) — these never match an application command.
      const base = normalizeEventKey(event.key);
      if (base === "shift" || base === "ctrl" || base === "meta" || base === "alt") {
        return;
      }

      const rules = useKeybindingsStore.getState().resolvedRules;
      const context = readWhenContext();

      // Walk last-first so later (user) rules shadow earlier (default) rules.
      for (let i = rules.length - 1; i >= 0; i--) {
        const r = rules[i];
        if (r === undefined) continue;
        const command: Command = r.rule.command;
        if (!APPLICATION_COMMANDS.has(command)) continue;
        if (!matchesShortcut(event, r.shortcut, IS_MAC)) continue;
        if (r.whenAst !== null && !evaluateWhen(r.whenAst, context)) continue;

        event.preventDefault();
        event.stopPropagation();
        dispatchCommand(command);
        return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
