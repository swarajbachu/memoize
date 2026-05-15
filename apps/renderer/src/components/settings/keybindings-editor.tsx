import { Plus, RotateCcw, Search, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  type Command,
  type KeybindingRule,
  collectWhenIdentifiers,
  formatKeyForDisplay,
  parseKey,
  parseWhen,
} from "@memoize/wire";

import { cn } from "~/lib/utils";
import {
  COMMAND_META,
  COMMANDS_IN_ORDER,
  DEFAULT_KEYBINDINGS,
  KNOWN_WHEN_IDENTIFIERS,
} from "../../lib/default-keybindings";
import { useKeybindingsStore } from "../../store/keybindings";
import { Button } from "../ui/button";
import { KeyCapture } from "./key-capture";

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

/* ──────────────── data shaping — turn resolved rules into editor rows ───────── */

interface EditorRow {
  readonly rule: KeybindingRule;
  readonly isDefault: boolean;
  /** Index into `userRules` — only meaningful when `isDefault === false`. */
  readonly userIndex: number | null;
}

const isKnownIdentifier = (name: string): boolean =>
  KNOWN_WHEN_IDENTIFIERS.includes(name);

const conflictKey = (rule: KeybindingRule): string =>
  `${rule.key}::${rule.when ?? ""}`;

/* ───────────────────────────── KeybindingsEditor ─────────────────────────────── */

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Build editor rows from resolved rules. We track each rule's index into
  // `userRules` separately so the remove/replace actions know what to mutate.
  const rows: ReadonlyArray<EditorRow> = useMemo(() => {
    const list: EditorRow[] = [];
    for (const r of resolved) {
      const userIndex = userRules.indexOf(r.rule);
      list.push({
        rule: r.rule,
        isDefault: userIndex === -1,
        userIndex: userIndex === -1 ? null : userIndex,
      });
    }
    return list;
  }, [resolved, userRules]);

  // Conflict map: how many rules share `key + when`. Any value > 1 → warn.
  const conflictCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const k = conflictKey(row.rule);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return rows;
    return rows.filter((row) => {
      const meta = COMMAND_META[row.rule.command];
      if (meta.label.toLowerCase().includes(q)) return true;
      if (row.rule.command.toLowerCase().includes(q)) return true;
      if (row.rule.key.toLowerCase().includes(q)) return true;
      if (row.rule.when?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [rows, query]);

  return (
    <section className="flex flex-col gap-4 pt-1">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">
          Keyboard shortcuts
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Rebind any command. Bindings persist to{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
            keybindings.json
          </code>{" "}
          under your app data folder and can be hand-edited. Standard editing
          keys (cut, copy, paste, undo) follow your OS defaults.
        </p>
      </header>

      {error !== null && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Failed to load keybindings: {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex flex-1 items-center">
          <Search
            className="absolute left-2.5 size-3.5 text-muted-foreground"
            aria-hidden
          />
          <input
            type="text"
            placeholder="Search by command, key, or when clause…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-full rounded-md border border-border/50 bg-background pl-8 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
          disabled={adding}
        >
          <Plus className="mr-1 size-3.5" />
          Add binding
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/50">
        <div className="grid grid-cols-[1fr_minmax(8rem,12rem)_minmax(8rem,14rem)_auto] gap-2 border-b border-border/50 bg-muted/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Command</span>
          <span>Key</span>
          <span>When</span>
          <span className="text-right">Actions</span>
        </div>
        {!loaded && (
          <div className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
            Loading…
          </div>
        )}
        {loaded && filtered.length === 0 && (
          <div className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
            No bindings match this search.
          </div>
        )}
        {filtered.map((row, i) => {
          const conflict = (conflictCounts.get(conflictKey(row.rule)) ?? 0) > 1;
          const rowId = `${row.rule.command}|${row.rule.key}|${row.rule.when ?? ""}|${i}`;
          const isEditing = editingId === rowId;
          return (
            <Row
              key={rowId}
              row={row}
              conflict={conflict}
              isEditing={isEditing}
              onEdit={() => setEditingId(rowId)}
              onCancel={() => setEditingId(null)}
              onSaved={() => setEditingId(null)}
            />
          );
        })}
        {adding && (
          <AddRow
            onCancel={() => setAdding(false)}
            onSaved={() => setAdding(false)}
          />
        )}
      </div>
    </section>
  );
}

/* ───────────────────────────── Single row ────────────────────────────────────── */

function Row({
  row,
  conflict,
  isEditing,
  onEdit,
  onCancel,
  onSaved,
}: {
  readonly row: EditorRow;
  readonly conflict: boolean;
  readonly isEditing: boolean;
  readonly onEdit: () => void;
  readonly onCancel: () => void;
  readonly onSaved: () => void;
}) {
  const replaceUserRuleAt = useKeybindingsStore((s) => s.replaceUserRuleAt);
  const removeUserRuleAt = useKeybindingsStore((s) => s.removeUserRuleAt);
  const addRule = useKeybindingsStore((s) => s.addRule);

  const [captureMode, setCaptureMode] = useState(false);
  const [whenDraft, setWhenDraft] = useState(row.rule.when ?? "");

  const meta = COMMAND_META[row.rule.command];
  const keyValid = parseKey(row.rule.key) !== null;
  const formattedKey = keyValid
    ? formatKeyForDisplay(row.rule.key, IS_MAC)
    : row.rule.key;

  const whenIssue = useMemo(() => evaluateWhenIssue(row.rule.when), [row.rule.when]);

  const handleSave = async (nextKey: string, nextWhen: string) => {
    const trimmedWhen = nextWhen.trim();
    const next: KeybindingRule = {
      key: nextKey,
      command: row.rule.command,
      when: trimmedWhen.length > 0 ? trimmedWhen : undefined,
    };
    if (row.isDefault || row.userIndex === null) {
      await addRule(next);
    } else {
      await replaceUserRuleAt(row.userIndex, next);
    }
    onSaved();
  };

  const handleRemove = async () => {
    if (row.userIndex === null) return;
    await removeUserRuleAt(row.userIndex);
  };

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_minmax(8rem,12rem)_minmax(8rem,14rem)_auto] items-center gap-2 border-b border-border/30 px-3 py-2 last:border-b-0 hover:bg-muted/20",
        isEditing && "bg-muted/30",
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">
          {meta.label}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {meta.group} · {row.rule.command}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {captureMode ? (
          <KeyCapture
            onCapture={async (key) => {
              setCaptureMode(false);
              await handleSave(key, whenDraft);
            }}
            onCancel={() => setCaptureMode(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCaptureMode(true)}
            className={cn(
              "inline-flex h-7 items-center rounded-md border border-border/40 bg-background px-2 text-xs text-foreground transition-colors hover:border-foreground/40 hover:bg-muted/40",
              !keyValid && "border-destructive/60 text-destructive",
            )}
            aria-label={`Change keybinding for ${meta.label}`}
          >
            {formattedKey}
          </button>
        )}
        {conflict && (
          <span
            title="Another rule binds the same chord in the same context. The last-defined rule wins."
            className="text-amber-500"
          >
            <TriangleAlert className="size-3.5" aria-hidden />
          </span>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        {isEditing ? (
          <input
            type="text"
            value={whenDraft}
            onChange={(e) => setWhenDraft(e.target.value)}
            placeholder="optional"
            className="h-7 w-full rounded-md border border-border/40 bg-background px-2 text-xs text-foreground outline-none focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : (
          <span className="truncate text-xs text-muted-foreground">
            {row.rule.when ?? "—"}
          </span>
        )}
        {whenIssue !== null && (
          <span className="text-[10px] text-amber-500">{whenIssue}</span>
        )}
      </div>

      <div className="flex justify-end gap-1">
        {!isEditing && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
        )}
        {isEditing && (
          <>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSave(row.rule.key, whenDraft)}
            >
              Save when
            </Button>
          </>
        )}
        {!row.isDefault && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleRemove()}
            title="Remove this user rule"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        )}
        {row.isDefault && (
          <Button
            variant="ghost"
            size="sm"
            disabled
            title="This is the built-in default. Click Edit to override it; the original is restored when the override is removed."
          >
            <RotateCcw className="size-3.5" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────── Add-new row ─────────────────────────────────── */

function AddRow({
  onCancel,
  onSaved,
}: {
  readonly onCancel: () => void;
  readonly onSaved: () => void;
}) {
  const addRule = useKeybindingsStore((s) => s.addRule);
  const [command, setCommand] = useState<Command>(
    COMMANDS_IN_ORDER[0] ?? "new-chat",
  );
  const [whenDraft, setWhenDraft] = useState("");

  return (
    <div className="grid grid-cols-[1fr_minmax(8rem,12rem)_minmax(8rem,14rem)_auto] items-center gap-2 border-b border-border/30 bg-accent/20 px-3 py-2">
      <select
        value={command}
        onChange={(e) => setCommand(e.target.value as Command)}
        className="h-7 w-full rounded-md border border-border/40 bg-background px-2 text-xs text-foreground"
      >
        {COMMANDS_IN_ORDER.map((cmd) => (
          <option key={cmd} value={cmd}>
            {COMMAND_META[cmd].group} · {COMMAND_META[cmd].label}
          </option>
        ))}
      </select>
      <KeyCapture
        onCapture={async (key) => {
          const trimmedWhen = whenDraft.trim();
          await addRule({
            key,
            command,
            when: trimmedWhen.length > 0 ? trimmedWhen : undefined,
          });
          onSaved();
        }}
        onCancel={onCancel}
      />
      <input
        type="text"
        value={whenDraft}
        onChange={(e) => setWhenDraft(e.target.value)}
        placeholder="optional when clause"
        className="h-7 w-full rounded-md border border-border/40 bg-background px-2 text-xs text-foreground"
      />
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/* ──────────────────────────── Helpers ─────────────────────────────────────── */

/**
 * Return a human-readable issue for the given `when` string, or `null` if
 * it's empty / well-formed and references only known identifiers.
 */
function evaluateWhenIssue(when: string | undefined): string | null {
  if (when === undefined || when.length === 0) return null;
  const parsed = parseWhen(when);
  if (parsed === null) return null;
  if (!("type" in parsed)) {
    return `${parsed.message} (col ${parsed.position + 1})`;
  }
  const ids = collectWhenIdentifiers(parsed);
  const unknown = [...ids].filter((id) => !isKnownIdentifier(id));
  if (unknown.length > 0) {
    return `Unknown identifier: ${unknown.join(", ")}`;
  }
  return null;
}

/**
 * Stable export so settings-page.tsx imports it directly. Wraps the editor
 * in the same `Section` chrome the other panes use.
 */
export function KeybindingsPane() {
  return (
    <div className="flex flex-col gap-4">
      <KeybindingsEditor />
      <ResetAllRow />
    </div>
  );
}

function ResetAllRow() {
  const userRulesCount = useKeybindingsStore((s) => s.userRules.length);
  const resetAll = useKeybindingsStore((s) => s.resetAll);
  if (userRulesCount === 0) return null;
  return (
    <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs">
      <span className="text-muted-foreground">
        You have {userRulesCount} custom rule{userRulesCount === 1 ? "" : "s"}.
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void resetAll()}
      >
        Reset all to defaults
      </Button>
    </div>
  );
}

/* Re-export default-keybindings so the editor file owns a single boundary. */
export { DEFAULT_KEYBINDINGS };
