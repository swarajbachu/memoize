import { type EditorView } from "@codemirror/view";
import { useEffect, useMemo, useState } from "react";

import { replaceWithChip } from "~/lib/codemirror/composer";
import {
  BUILTIN_COMMANDS,
  filterBuiltins,
  type BuiltinCommand,
} from "../../composer/builtin-commands.ts";
import type { ActiveTrigger } from "~/lib/codemirror/composer";
import { cn } from "~/lib/utils";

export interface SlashCommandPopoverProps {
  readonly trigger: ActiveTrigger;
  readonly view: EditorView;
  readonly onClose: () => void;
}

/**
 * Slash-command popover. Sections (top → bottom): built-ins, then skills.
 * Skills land in Phase 7; for now the popover surfaces only the built-ins.
 *
 * Confirming a built-in just replaces the trigger range with the canonical
 * `/<command>` token (still plain text — the submit pipeline handles
 * execution). Confirming a skill (Phase 7) inserts a chip.
 */
export function SlashCommandPopover({
  trigger,
  view,
  onClose,
}: SlashCommandPopoverProps) {
  const builtins = useMemo(
    () => filterBuiltins(trigger.query),
    [trigger.query],
  );
  const [highlight, setHighlight] = useState(0);

  // Reset highlight when the candidate set changes — filtered list shrinks
  // and a stale index would point past the end.
  useEffect(() => setHighlight(0), [builtins]);

  // Keyboard handling: arrows / Enter / Tab / Esc on the document while the
  // popover is open. Stops propagation before the editor sees them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (builtins.length === 0) {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setHighlight((h) => (h + 1) % builtins.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setHighlight((h) => (h - 1 + builtins.length) % builtins.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        const cmd = builtins[highlight];
        if (cmd) confirm(cmd);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [builtins, highlight, onClose]);

  const confirm = (cmd: BuiltinCommand) => {
    // For built-ins we replace the trigger range with the plain command
    // token (no chip). The submit handler picks it up via matchBuiltin.
    view.dispatch({
      changes: {
        from: trigger.from,
        to: trigger.to,
        insert: cmd.token + " ",
      },
      selection: { anchor: trigger.from + cmd.token.length + 1 },
    });
    view.focus();
    onClose();
  };

  if (builtins.length === 0) return null;

  return (
    <div
      role="listbox"
      className="absolute bottom-full left-0 z-50 mb-1 w-80 overflow-hidden rounded-lg border border-border/60 bg-popover p-1 shadow-lg"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Commands
      </div>
      {builtins.map((cmd, i) => {
        const Icon = cmd.Icon;
        const active = i === highlight;
        return (
          <button
            key={cmd.name}
            type="button"
            role="option"
            aria-selected={active}
            onMouseEnter={() => setHighlight(i)}
            onClick={() => confirm(cmd)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
              active ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
            )}
          >
            <Icon className="size-3.5 shrink-0 opacity-80" />
            <span className="font-medium">/{cmd.name}</span>
            <span className="ml-auto truncate text-xs text-muted-foreground">
              {cmd.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Avoid an unused-import lint when BUILTIN_COMMANDS isn't directly read
// in this file; the export-by-file index can pick it back up.
void BUILTIN_COMMANDS;
// `replaceWithChip` is referenced for future use when skills land in Phase 7.
void replaceWithChip;
