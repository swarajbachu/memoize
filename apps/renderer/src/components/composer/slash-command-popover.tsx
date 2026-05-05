import { type EditorView } from "@codemirror/view";
import fuzzysort from "fuzzysort";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { Skill } from "@forkzero/wire";

import {
  filterBuiltins,
  type BuiltinCommand,
} from "../../composer/builtin-commands.ts";
import {
  replaceWithChip,
  type ActiveTrigger,
} from "~/lib/codemirror/composer";
import { useSkillsStore } from "~/store/skills.ts";
import { cn } from "~/lib/utils";

export interface SlashCommandPopoverProps {
  readonly trigger: ActiveTrigger;
  readonly view: EditorView;
  readonly sessionId: string;
  readonly onClose: () => void;
}

interface BuiltinRow {
  readonly kind: "builtin";
  readonly command: BuiltinCommand;
}

interface SkillRow {
  readonly kind: "skill";
  readonly skill: Skill;
}

type Row = BuiltinRow | SkillRow;

const filterSkills = (
  skills: ReadonlyArray<Skill>,
  query: string,
): ReadonlyArray<Skill> => {
  if (skills.length === 0) return skills;
  if (!query) return skills;
  const ranked = fuzzysort.go(query, skills, {
    keys: ["name", "description"],
    threshold: 0.3,
    limit: 50,
  });
  return ranked.map((r) => r.obj);
};

/**
 * Slash popover. Two sections (top → bottom): client-side built-ins,
 * then provider-discovered skills (Claude Code or Codex). Built-ins keep
 * the text-replace + matchBuiltin dispatch (terminal — Enter executes
 * client-side actions like `/clear`). Skills insert as atomic chips so
 * the user can keep typing additional message context after them.
 */
export function SlashCommandPopover({
  trigger,
  view,
  sessionId,
  onClose,
}: SlashCommandPopoverProps) {
  const allSkills = useSkillsStore(
    (s) => s.skillsBySession[sessionId] ?? EMPTY_SKILLS,
  );

  const builtins = useMemo(
    () => filterBuiltins(trigger.query),
    [trigger.query],
  );
  const skills = useMemo(
    () => filterSkills(allSkills, trigger.query),
    [allSkills, trigger.query],
  );

  // Flatten into a single index space so ↑/↓/Enter cross sections.
  const rows = useMemo<ReadonlyArray<Row>>(
    () => [
      ...builtins.map((c) => ({ kind: "builtin" as const, command: c })),
      ...skills.map((s) => ({ kind: "skill" as const, skill: s })),
    ],
    [builtins, skills],
  );

  const [highlight, setHighlight] = useState(0);
  useEffect(() => setHighlight(0), [rows]);

  const confirmRow = (row: Row) => {
    if (row.kind === "builtin") {
      view.dispatch({
        changes: {
          from: trigger.from,
          to: trigger.to,
          insert: row.command.token + " ",
        },
        selection: { anchor: trigger.from + row.command.token.length + 1 },
      });
      view.focus();
    } else {
      // Skill: insert as an atomic chip. The user keeps typing after it;
      // segment-parser collects the chip + trailing args at submit time.
      replaceWithChip(view, trigger.from, trigger.to, `/${row.skill.name}`, {
        kind: "skill",
        name: row.skill.name,
        scope: row.skill.scope,
      });
    }
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rows.length === 0) {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setHighlight((h) => (h + 1) % rows.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setHighlight((h) => (h - 1 + rows.length) % rows.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        const row = rows[highlight];
        if (row !== undefined) confirmRow(row);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [rows, highlight, onClose]);

  if (rows.length === 0) return null;

  let cursor = 0;
  return (
    <div
      role="listbox"
      className="absolute bottom-full left-0 z-50 mb-1 max-h-80 w-[26rem] overflow-y-auto rounded-lg border border-border/60 bg-popover p-1 shadow-lg"
      onMouseDown={(e) => e.preventDefault()}
    >
      {builtins.length > 0 && (
        <>
          <div className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Commands
          </div>
          {builtins.map((cmd) => {
            const i = cursor++;
            const Icon = cmd.Icon;
            const active = i === highlight;
            return (
              <button
                key={`builtin:${cmd.name}`}
                type="button"
                role="option"
                aria-selected={active}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => confirmRow({ kind: "builtin", command: cmd })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/60",
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
        </>
      )}

      {skills.length > 0 && (
        <>
          <div className="mt-1 px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Skills
          </div>
          {skills.map((skill) => {
            const i = cursor++;
            const active = i === highlight;
            return (
              <button
                key={`skill:${skill.scope}:${skill.name}`}
                type="button"
                role="option"
                aria-selected={active}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => confirmRow({ kind: "skill", skill })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/60",
                )}
              >
                <Sparkles className="size-3.5 shrink-0 text-violet-400/80" />
                <span className="font-medium">/{skill.name}</span>
                {skill.scope === "project" && (
                  <span className="rounded bg-accent/40 px-1 py-0.5 text-[9px] uppercase tracking-wide text-accent-foreground/80">
                    project
                  </span>
                )}
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {skill.description}
                </span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

const EMPTY_SKILLS: ReadonlyArray<Skill> = [];
