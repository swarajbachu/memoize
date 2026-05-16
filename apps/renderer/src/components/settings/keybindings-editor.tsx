import {
  ChevronDown,
  Ellipsis,
  FileJson,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import {
  type Command,
  type KeybindingRule,
  type KeybindingWhenNode,
  keyStringFromEvent,
  whenAstToString,
} from "@memoize/wire";

import { cn } from "~/lib/utils";
import {
  COMMAND_META,
  COMMANDS_IN_ORDER,
  DEFAULT_KEYBINDINGS,
} from "../../lib/default-keybindings";
import { useKeybindingsStore } from "../../store/keybindings";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { KeybindingPill } from "./keybinding-pill";
import { WhenExpressionBuilder } from "./when-expression-builder";

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

/* ────────────────────── Row model — derived from store ───────────────────── */

type RuleSource = "Default" | "Custom";

interface EditorRow {
  /** Stable id — survives across resolved rules being rebuilt. */
  readonly id: string;
  readonly source: RuleSource;
  readonly command: Command;
  /** Current key string. */
  readonly key: string;
  /** Current canonical when text (empty string when none). */
  readonly when: string;
  /** Parsed AST cache for the editor popover. */
  readonly whenAst: KeybindingWhenNode | undefined;
  /** Index into `userRules` — only set for Custom rows. */
  readonly userIndex: number | null;
  /** The default key chord for this command, if any. */
  readonly defaultKey: string | null;
}

const conflictKey = (key: string, when: string): string => `${key}::${when}`;

/* ──────────── per-row draft state — manages dirty edits in flight ───────── */

interface RowDraftState {
  readonly keyDraft: string;
  readonly whenDraft: KeybindingWhenNode | undefined;
  readonly isRecording: boolean;
  readonly isWhenValid: boolean;
}

type RowDraftAction =
  | { readonly type: "reset"; readonly row: EditorRow }
  | { readonly type: "patch"; readonly patch: Partial<RowDraftState> };

const draftFromRow = (row: EditorRow): RowDraftState => ({
  keyDraft: row.key,
  whenDraft: row.whenAst,
  isRecording: false,
  isWhenValid: true,
});

const draftReducer = (
  state: RowDraftState,
  action: RowDraftAction,
): RowDraftState => {
  if (action.type === "reset") return draftFromRow(action.row);
  return { ...state, ...action.patch };
};

/* ────────────────────────── Conflict labels ──────────────────────────────── */

function conflictsFor(
  rows: ReadonlyArray<EditorRow>,
  self: { readonly id: string; readonly key: string; readonly when: string },
): ReadonlyArray<string> {
  const out: string[] = [];
  for (const row of rows) {
    if (row.id === self.id) continue;
    if (row.key !== self.key) continue;
    // Empty `when` collides with everything else on the same key; otherwise
    // require exact match (we don't try to reason about overlapping ASTs).
    const rowWhen = row.when ?? "";
    const selfWhen = self.when ?? "";
    if (rowWhen !== "" && selfWhen !== "" && rowWhen !== selfWhen) continue;
    out.push(COMMAND_META[row.command].label);
  }
  return out;
}

/* ─────────────────────────── Editor entrypoint ───────────────────────────── */

export function KeybindingsEditor() {
  const resolved = useKeybindingsStore((s) => s.resolvedRules);
  const userRules = useKeybindingsStore((s) => s.userRules);
  const loaded = useKeybindingsStore((s) => s.loaded);
  const hydrate = useKeybindingsStore((s) => s.hydrate);
  const error = useKeybindingsStore((s) => s.error);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const rows: ReadonlyArray<EditorRow> = useMemo(() => {
    const out: EditorRow[] = [];
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i];
      if (r === undefined) continue;
      const userIndex = userRules.indexOf(r.rule);
      const isCustom = userIndex !== -1;
      const defaultKey = findDefaultKey(r.rule.command);
      const whenAst = r.whenAst ?? undefined;
      out.push({
        id: isCustom ? `user:${userIndex}` : `default:${r.rule.command}:${i}`,
        source: isCustom ? "Custom" : "Default",
        command: r.rule.command,
        key: r.rule.key,
        when: r.rule.when ?? "",
        whenAst,
        userIndex: isCustom ? userIndex : null,
        defaultKey,
      });
    }
    return out;
  }, [resolved, userRules]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return rows;
    return rows.filter((row) => {
      const meta = COMMAND_META[row.command];
      return (
        meta.label.toLowerCase().includes(q) ||
        row.command.toLowerCase().includes(q) ||
        row.key.toLowerCase().includes(q) ||
        row.when.toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-sm font-medium text-foreground">
            Keyboard shortcuts
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Click a chord to record a new one. Bindings persist to{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
              keybindings.json
            </code>{" "}
            under your app data folder.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ExpandableSearch
            query={query}
            onQueryChange={setQuery}
            isOpen={searchOpen}
            onOpenChange={setSearchOpen}
            inputRef={searchRef}
            countLabel={`${rows.length} bindings`}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setIsAdding(true)}
                  disabled={isAdding}
                  aria-label="Add keybinding"
                >
                  <Plus className="size-3.5" />
                </Button>
              }
            />
            <TooltipPopup side="top">Add keybinding</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    // No file:// access from renderer in Electron; surface a hint.
                    // eslint-disable-next-line no-alert
                    alert(
                      "Open ~/Library/Application Support/memoize/keybindings.json (or the Win/Linux equivalent) in your editor to hand-edit. Changes are picked up live.",
                    );
                  }}
                  aria-label="Show keybindings file location"
                >
                  <FileJson className="size-3.5" />
                </Button>
              }
            />
            <TooltipPopup side="top">Find keybindings.json</TooltipPopup>
          </Tooltip>
        </div>
      </div>

      {error !== null && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Failed to load keybindings: {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm/4">
        <div className="grid min-w-[680px] grid-cols-[minmax(190px,1.1fr)_minmax(220px,0.85fr)_minmax(210px,1fr)_60px] border-b border-border/70 bg-muted/25 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          <div>Command</div>
          <div>Keybinding</div>
          <div>When</div>
          <div className="text-right">Status</div>
        </div>
        <div className="divide-y divide-border/60">
          {!loaded && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          )}
          {loaded && filtered.length === 0 && !isAdding && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              {query.trim().length > 0
                ? "No keybindings match your search."
                : "No keybindings."}
            </div>
          )}
          {filtered.map((row) => (
            <RowEditor key={row.id} row={row} allRows={rows} />
          ))}
          {isAdding && (
            <NewRow
              allRows={rows}
              onCancel={() => setIsAdding(false)}
              onSaved={() => setIsAdding(false)}
            />
          )}
        </div>
      </div>

      <ResetAllFooter />
    </div>
  );
}

/* ─────────────────── Existing-row editor ────────────────────────────────── */

function RowEditor({
  row,
  allRows,
}: {
  readonly row: EditorRow;
  readonly allRows: ReadonlyArray<EditorRow>;
}) {
  const [draft, dispatch] = useReducer(draftReducer, row, draftFromRow);
  const addRule = useKeybindingsStore((s) => s.addRule);
  const replaceUserRuleAt = useKeybindingsStore((s) => s.replaceUserRuleAt);
  const removeUserRuleAt = useKeybindingsStore((s) => s.removeUserRuleAt);
  const resetCommand = useKeybindingsStore((s) => s.resetCommand);

  // When the upstream row changes (e.g. saved → echoed back through stream),
  // reset the draft so the "dirty" indicator clears.
  useEffect(() => {
    dispatch({ type: "reset", row });
  }, [row]);

  const whenText = whenAstToString(draft.whenDraft);
  const isDirty = draft.keyDraft !== row.key || whenText !== row.when;
  const showPill =
    !draft.isRecording &&
    draft.keyDraft === row.key &&
    row.key.length > 0 &&
    !isDirty;

  const conflictLabels = conflictsFor(allRows, {
    id: row.id,
    key: draft.keyDraft,
    when: whenText,
  });

  const meta = COMMAND_META[row.command];
  const canReset = row.source === "Custom" && row.defaultKey !== null;
  const canRemove = row.source !== "Default";

  const save = async () => {
    const trimmedWhen = whenText.trim();
    const next: KeybindingRule = {
      key: draft.keyDraft,
      command: row.command,
      when: trimmedWhen.length > 0 ? trimmedWhen : undefined,
    };
    if (row.source === "Custom" && row.userIndex !== null) {
      await replaceUserRuleAt(row.userIndex, next);
    } else {
      await addRule(next);
    }
  };

  const onKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab") return;
    event.preventDefault();
    if (event.key === "Escape") {
      dispatch({ type: "patch", patch: { keyDraft: row.key, isRecording: false } });
      return;
    }
    const next = keyStringFromEvent(event.nativeEvent, IS_MAC);
    if (next === null) return;
    dispatch({ type: "patch", patch: { keyDraft: next, isRecording: false } });
  };

  return (
    <div className="grid min-w-[680px] grid-cols-[minmax(190px,1.1fr)_minmax(220px,0.85fr)_minmax(210px,1fr)_60px] items-center px-4 py-1.5 text-sm even:bg-muted/15 hover:bg-accent/40">
      <div className="min-w-0 pr-4">
        <div className="truncate text-[13px] font-medium text-foreground" title={row.command}>
          {meta.label}
        </div>
        <div className="truncate text-[11px] text-muted-foreground" title={row.command}>
          {meta.group}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2 pr-4">
        {showPill ? (
          <button
            type="button"
            onClick={() =>
              dispatch({ type: "patch", patch: { isRecording: true } })
            }
            aria-label={`Edit shortcut for ${meta.label}`}
            className="group inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-1.5 outline-none transition-colors hover:border-border/70 hover:bg-background focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24"
          >
            <KeybindingPill value={row.key} />
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/0 transition-opacity group-hover:text-muted-foreground/70 group-focus-visible:text-muted-foreground/70">
              Edit
            </span>
          </button>
        ) : (
          <Input
            autoFocus={draft.isRecording}
            aria-label={`Keybinding for ${meta.label}`}
            value={draft.isRecording ? "" : draft.keyDraft}
            placeholder={draft.isRecording ? "Press shortcut" : "Unassigned"}
            className={cn(
              "h-7 w-44 rounded-md font-mono text-[12px]",
              draft.isRecording && "border-primary/70 bg-primary/5",
            )}
            onFocus={() =>
              dispatch({ type: "patch", patch: { isRecording: true } })
            }
            onBlur={() =>
              dispatch({ type: "patch", patch: { isRecording: false } })
            }
            onChange={(e) =>
              dispatch({
                type: "patch",
                patch: { keyDraft: e.currentTarget.value },
              })
            }
            onKeyDown={onKey}
          />
        )}
        {isDirty && (
          <Button
            size="xs"
            className="h-7"
            disabled={draft.keyDraft.trim().length === 0 || !draft.isWhenValid}
            onClick={() => void save()}
          >
            Save
          </Button>
        )}
      </div>

      <div className="pr-4">
        <Popover>
          <PopoverTrigger
            className={cn(
              "inline-flex h-7 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-left font-mono text-[12px] text-foreground shadow-xs/5 outline-none transition-colors hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24",
              !whenText && "text-muted-foreground",
            )}
            aria-label={`Edit when clause for ${meta.label}`}
          >
            <span className="truncate">{whenText || "Always"}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
          </PopoverTrigger>
          <PopoverPopup align="start" sideOffset={6}>
            <div className="p-3">
              <WhenExpressionBuilder
                value={draft.whenDraft}
                onChange={(next) =>
                  dispatch({ type: "patch", patch: { whenDraft: next } })
                }
                onValidityChange={(valid) =>
                  dispatch({ type: "patch", patch: { isWhenValid: valid } })
                }
              />
            </div>
          </PopoverPopup>
        </Popover>
      </div>

      <div className="flex items-center justify-end gap-1">
        <ConflictWarning labels={conflictLabels} />
        {(canReset || canRemove) && (
          <Menu>
            <MenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label={`Actions for ${meta.label}`}
                />
              }
            >
              <Ellipsis className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-36">
              {canReset && (
                <MenuItem
                  onClick={() => void resetCommand(row.command)}
                >
                  Reset to default
                </MenuItem>
              )}
              {canRemove && (
                <MenuItem
                  className="text-destructive"
                  onClick={() => {
                    if (row.userIndex !== null) void removeUserRuleAt(row.userIndex);
                  }}
                >
                  Remove
                </MenuItem>
              )}
            </MenuPopup>
          </Menu>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── New-binding row ─────────────────────────────────────── */

function NewRow({
  allRows,
  onCancel,
  onSaved,
}: {
  readonly allRows: ReadonlyArray<EditorRow>;
  readonly onCancel: () => void;
  readonly onSaved: () => void;
}) {
  const addRule = useKeybindingsStore((s) => s.addRule);
  const [command, setCommand] = useState<Command>(
    COMMANDS_IN_ORDER[0] ?? "new-chat",
  );
  const [draft, dispatch] = useReducer(draftReducer, undefined, () => ({
    keyDraft: "",
    whenDraft: undefined,
    isRecording: true,
    isWhenValid: true,
  }));
  const whenText = whenAstToString(draft.whenDraft);

  const conflictLabels = conflictsFor(allRows, {
    id: "new",
    key: draft.keyDraft,
    when: whenText,
  });

  const canSave = draft.keyDraft.trim().length > 0 && draft.isWhenValid;

  const save = async () => {
    const trimmedWhen = whenText.trim();
    await addRule({
      key: draft.keyDraft,
      command,
      when: trimmedWhen.length > 0 ? trimmedWhen : undefined,
    });
    onSaved();
  };

  const onKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab") return;
    event.preventDefault();
    if (event.key === "Escape") {
      onCancel();
      return;
    }
    const next = keyStringFromEvent(event.nativeEvent, IS_MAC);
    if (next === null) return;
    dispatch({ type: "patch", patch: { keyDraft: next, isRecording: false } });
  };

  return (
    <div className="grid min-w-[680px] grid-cols-[minmax(190px,1.1fr)_minmax(220px,0.85fr)_minmax(210px,1fr)_60px] items-center bg-accent/20 px-4 py-2 text-sm">
      <div className="min-w-0 pr-4">
        <Select value={command} onValueChange={(v) => setCommand(v as Command)}>
          <SelectTrigger size="sm" className="h-7 min-h-7 w-full rounded-md text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {COMMANDS_IN_ORDER.map((cmd) => (
              <SelectItem key={cmd} value={cmd} className="text-xs">
                <span className="flex flex-col">
                  <span>{COMMAND_META[cmd].label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {COMMAND_META[cmd].group}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-0 items-center gap-2 pr-4">
        <Input
          autoFocus
          aria-label="Keybinding for new rule"
          value={draft.isRecording ? "" : draft.keyDraft}
          placeholder={draft.isRecording ? "Press shortcut" : "Unassigned"}
          className={cn(
            "h-7 w-44 rounded-md font-mono text-[12px]",
            draft.isRecording && "border-primary/70 bg-primary/5",
          )}
          onFocus={() =>
            dispatch({ type: "patch", patch: { isRecording: true } })
          }
          onBlur={() =>
            dispatch({ type: "patch", patch: { isRecording: false } })
          }
          onChange={(e) =>
            dispatch({
              type: "patch",
              patch: { keyDraft: e.currentTarget.value },
            })
          }
          onKeyDown={onKey}
        />
      </div>

      <div className="pr-4">
        <Popover>
          <PopoverTrigger
            className={cn(
              "inline-flex h-7 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-left font-mono text-[12px] text-foreground shadow-xs/5 outline-none transition-colors hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24",
              !whenText && "text-muted-foreground",
            )}
            aria-label="Edit when clause for new binding"
          >
            <span className="truncate">{whenText || "Always"}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
          </PopoverTrigger>
          <PopoverPopup align="start" sideOffset={6}>
            <div className="p-3">
              <WhenExpressionBuilder
                value={draft.whenDraft}
                onChange={(next) =>
                  dispatch({ type: "patch", patch: { whenDraft: next } })
                }
                onValidityChange={(valid) =>
                  dispatch({ type: "patch", patch: { isWhenValid: valid } })
                }
              />
            </div>
          </PopoverPopup>
        </Popover>
      </div>

      <div className="flex items-center justify-end gap-1">
        <ConflictWarning labels={conflictLabels} />
        <Button size="xs" variant="ghost" className="h-7" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" className="h-7" disabled={!canSave} onClick={() => void save()}>
          Add
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────── Conflict warning bubble ───────────────────────────── */

function ConflictWarning({ labels }: { readonly labels: ReadonlyArray<string> }) {
  if (labels.length === 0) return null;
  const description =
    labels.length === 1
      ? `Conflicts with ${labels[0]}.`
      : `Conflicts with ${labels.slice(0, 3).join(", ")}${labels.length > 3 ? ", and more" : ""}.`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            aria-label={description}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-amber-500 outline-none transition-colors hover:bg-amber-500/10 focus-visible:ring-[3px] focus-visible:ring-amber-500/25"
          >
            <TriangleAlert className="size-3.5" />
          </span>
        }
      />
      <TooltipPopup
        side="top"
        className="max-w-72 whitespace-normal leading-relaxed"
      >
        {description} The most recent matching binding wins when both
        conditions can apply.
      </TooltipPopup>
    </Tooltip>
  );
}

/* ─────────────────── Expandable header search ──────────────────────────── */

function ExpandableSearch({
  query,
  onQueryChange,
  isOpen,
  onOpenChange,
  inputRef,
  countLabel,
}: {
  readonly query: string;
  readonly onQueryChange: (q: string) => void;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly countLabel: string;
}) {
  if (!isOpen) {
    return (
      <>
        <span className="text-[11px] text-muted-foreground/70">{countLabel}</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onOpenChange(true)}
                aria-label="Search keybindings"
              >
                <Search className="size-3.5" />
              </Button>
            }
          />
          <TooltipPopup side="top">Search keybindings</TooltipPopup>
        </Tooltip>
      </>
    );
  }
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={inputRef}
        autoFocus
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.currentTarget.value)}
        onBlur={() => {
          if (query.length === 0) onOpenChange(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onQueryChange("");
            onOpenChange(false);
          }
        }}
        placeholder="Search keybindings"
        aria-label="Search keybindings"
        className="h-6 w-44 rounded-md border border-input bg-background pl-7 pr-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24"
      />
    </div>
  );
}

/* ─────────────────── Reset-all footer (only with overrides) ────────────── */

function ResetAllFooter() {
  const userRulesCount = useKeybindingsStore((s) => s.userRules.length);
  const resetAll = useKeybindingsStore((s) => s.resetAll);
  if (userRulesCount === 0) return null;
  return (
    <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs">
      <span className="text-muted-foreground">
        {userRulesCount} custom rule{userRulesCount === 1 ? "" : "s"} active.
      </span>
      <Button variant="outline" size="sm" onClick={() => void resetAll()}>
        Reset all to defaults
      </Button>
    </div>
  );
}

/* ─────────────────── Wrapper used by settings-page.tsx ─────────────────── */

export function KeybindingsPane() {
  return (
    <div className="flex flex-col gap-4">
      <KeybindingsEditor />
    </div>
  );
}

/* ─────────────────── helpers ────────────────────────────────────────────── */

function findDefaultKey(command: Command): string | null {
  for (const r of DEFAULT_KEYBINDINGS) {
    if (r.command === command) return r.key;
  }
  return null;
}
