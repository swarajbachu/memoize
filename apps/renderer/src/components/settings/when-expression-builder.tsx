import { CircleX, Minus, Plus, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import {
  type KeybindingWhenNode,
  parseWhen,
  whenAstToString,
} from "@memoize/wire";

import { cn } from "~/lib/utils";
import { KNOWN_WHEN_IDENTIFIERS } from "../../lib/default-keybindings";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

type BooleanOperator = "and" | "or";
const DEFAULT_VARIABLE = KNOWN_WHEN_IDENTIFIERS[0] ?? "composerFocus";

/* ────────────────────────── AST utility helpers ─────────────────────────── */

/**
 * Flatten a nested `(a && b) && c` into `[a, b, c]` when both groups use
 * the same operator — lets the visual builder render the list as one
 * group with three children instead of awkward nesting.
 */
function flattenChildren(
  node: KeybindingWhenNode,
  operator: BooleanOperator,
): KeybindingWhenNode[] {
  if (node.type !== operator) return [node];
  return [
    ...flattenChildren(node.left, operator),
    ...flattenChildren(node.right, operator),
  ];
}

/** Re-assemble a flat list of children into a right-leaning binary tree. */
function buildGroup(
  children: ReadonlyArray<KeybindingWhenNode>,
  operator: BooleanOperator,
): KeybindingWhenNode | undefined {
  const first = children[0];
  if (!first) return undefined;
  return children
    .slice(1)
    .reduce<KeybindingWhenNode>(
      (left, right) => ({ type: operator, left, right }),
      first,
    );
}

/** A node that's either a bare identifier or `!identifier`. */
function conditionParts(
  node: KeybindingWhenNode,
): { identifier: string; negated: boolean } | null {
  if (node.type === "identifier") {
    return { identifier: node.name, negated: false };
  }
  if (node.type === "not" && node.node.type === "identifier") {
    return { identifier: node.node.name, negated: true };
  }
  return null;
}

function setConditionIdentifier(
  node: KeybindingWhenNode,
  identifier: string,
): KeybindingWhenNode {
  const parts = conditionParts(node);
  if (!parts) return node;
  const next: KeybindingWhenNode = { type: "identifier", name: identifier };
  return parts.negated ? { type: "not", node: next } : next;
}

function setConditionNegated(
  node: KeybindingWhenNode,
  negated: boolean,
): KeybindingWhenNode {
  const parts = conditionParts(node);
  if (!parts) return negated ? { type: "not", node } : node;
  const identifier: KeybindingWhenNode = {
    type: "identifier",
    name: parts.identifier,
  };
  return negated ? { type: "not", node: identifier } : identifier;
}

const defaultCondition = (): KeybindingWhenNode => ({
  type: "identifier",
  name: DEFAULT_VARIABLE,
});

const defaultGroup = (operator: BooleanOperator = "and"): KeybindingWhenNode => ({
  type: operator,
  left: defaultCondition(),
  right: { type: "not", node: defaultCondition() },
});

const isKnown = (id: string) => KNOWN_WHEN_IDENTIFIERS.includes(id);

/* ────────────────────────── Warning bubble ──────────────────────────────── */

function UnknownWarning({
  identifiers,
  focusable = true,
}: {
  readonly identifiers: ReadonlyArray<string>;
  readonly focusable?: boolean;
}) {
  if (identifiers.length === 0) return null;
  const label =
    identifiers.length === 1
      ? `Unknown condition: ${identifiers[0]}`
      : `Unknown conditions: ${identifiers.join(", ")}`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={focusable ? 0 : undefined}
            aria-label={label}
            className="inline-flex size-4.5 shrink-0 items-center justify-center rounded-sm text-amber-500 outline-none transition-colors hover:bg-amber-500/10 focus-visible:ring-[3px] focus-visible:ring-amber-500/25"
          >
            <TriangleAlert className="size-3.5" />
          </span>
        }
      />
      <TooltipPopup
        side="top"
        className="max-w-72 whitespace-normal leading-relaxed"
      >
        memoize doesn&apos;t recognise this condition yet. It can still be saved,
        but it may not match unless the runtime provides it.
      </TooltipPopup>
    </Tooltip>
  );
}

/* ─────────────────── Condition variable selector ────────────────────────── */

function VariableSelect({
  value,
  unknownIdentifiers,
  onChange,
}: {
  readonly value: string;
  readonly unknownIdentifiers?: ReadonlyArray<string>;
  readonly onChange: (value: string) => void;
}) {
  // Allow the user's current value even if not in the canonical list (so a
  // hand-edited file doesn't appear corrupted in the picker).
  const options = useMemo(() => {
    const seen = new Set<string>([value]);
    const out: string[] = [value];
    for (const id of KNOWN_WHEN_IDENTIFIERS) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }, [value]);
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string" && next.length > 0) onChange(next);
      }}
    >
      <SelectTrigger
        size="sm"
        className="h-7 min-h-7 min-w-0 flex-1 rounded-md font-mono text-xs"
      >
        <SelectValue placeholder="Condition" />
        {unknownIdentifiers && unknownIdentifiers.length > 0 ? (
          <UnknownWarning identifiers={unknownIdentifiers} focusable={false} />
        ) : null}
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        className="max-h-72 w-fit min-w-44"
      >
        {options.map((opt) => (
          <SelectItem
            key={opt}
            value={opt}
            className="min-h-7 w-full py-1 font-mono text-[12px]"
          >
            <span className="truncate">{opt}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ─────────────────── Recursive node editor ──────────────────────────────── */

function NodeEditor({
  node,
  depth = 0,
  onChange,
  onRemove,
}: {
  readonly node: KeybindingWhenNode;
  readonly depth?: number;
  readonly onChange: (node: KeybindingWhenNode) => void;
  readonly onRemove?: () => void;
}) {
  const condition = conditionParts(node);

  if (condition) {
    const unknown = isKnown(condition.identifier) ? [] : [condition.identifier];
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2 py-2">
        <Toggle
          pressed={condition.negated}
          onPressedChange={(pressed) =>
            onChange(setConditionNegated(node, pressed))
          }
          aria-label={`Negate ${condition.identifier}`}
          variant="outline"
          size="sm"
          className="h-7 min-w-10 px-2 text-[11px]"
        >
          Not
        </Toggle>
        <VariableSelect
          value={condition.identifier}
          unknownIdentifiers={unknown}
          onChange={(v) => onChange(setConditionIdentifier(node, v))}
        />
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7"
            aria-label="Remove condition"
            onClick={onRemove}
          >
            <Minus className="size-3.5" />
          </Button>
        )}
      </div>
    );
  }

  if (node.type === "not") {
    return (
      <div
        className={cn(
          "space-y-2 rounded-lg border border-border/70 bg-muted/20 p-2",
          depth > 0 && "border-border/50 bg-background/50",
        )}
      >
        <div className="flex items-center gap-2">
          <Toggle
            pressed
            onPressedChange={(pressed) => onChange(pressed ? node : node.node)}
            aria-label="Negate group"
            variant="outline"
            size="sm"
            className="h-7 min-w-10 px-2 text-[11px]"
          >
            Not
          </Toggle>
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-auto size-7"
              aria-label="Remove negated group"
              onClick={onRemove}
            >
              <Minus className="size-3.5" />
            </Button>
          )}
        </div>
        <div className="relative pl-4">
          <span
            className="absolute bottom-0 left-1.5 top-0 w-px bg-border/70"
            aria-hidden
          />
          <span
            className="absolute left-1.5 top-4 h-px w-2.5 bg-border/70"
            aria-hidden
          />
          <NodeEditor
            node={node.node}
            depth={depth + 1}
            onChange={(next) => onChange({ type: "not", node: next })}
          />
        </div>
      </div>
    );
  }

  // AND / OR group — render as a flat list of children with operator toggle.
  const operator: BooleanOperator = node.type === "or" ? "or" : "and";
  const children = flattenChildren(node, operator);

  // Dedupe React keys when two children render to the same canonical text
  // (rare but possible for `a || a`); suffix dupes with their index.
  const keyCounts = new Map<string, number>();
  const childEntries = children.map((child) => {
    const baseKey = `${child.type}-${whenAstToString(child)}`;
    const count = keyCounts.get(baseKey) ?? 0;
    keyCounts.set(baseKey, count + 1);
    return { child, key: count === 0 ? baseKey : `${baseKey}#${count}` };
  });

  const updateChild = (target: KeybindingWhenNode, next: KeybindingWhenNode) => {
    let did = false;
    const updated = children.map((c) => {
      if (!did && c === target) {
        did = true;
        return next;
      }
      return c;
    });
    const next2 = buildGroup(updated, operator);
    if (next2) onChange(next2);
  };

  const removeChild = (target: KeybindingWhenNode) => {
    let did = false;
    const filtered = children.filter((c) => {
      if (!did && c === target) {
        did = true;
        return false;
      }
      return true;
    });
    const next2 = buildGroup(filtered, operator);
    if (next2) onChange(next2);
    else onChange(defaultCondition());
  };

  const setOperator = (nextOp: BooleanOperator) => {
    if (nextOp === operator) return;
    const built = buildGroup(children, nextOp);
    if (built) onChange(built);
  };

  const addCondition = () => {
    const built = buildGroup([...children, defaultCondition()], operator);
    if (built) onChange(built);
  };

  const addGroup = () => {
    const nestedOp: BooleanOperator = operator === "and" ? "or" : "and";
    const built = buildGroup([...children, defaultGroup(nestedOp)], operator);
    if (built) onChange(built);
  };

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-border/60 bg-muted/10 p-2",
        depth > 0 && "border-border/70 bg-background/55",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={operator}
          onValueChange={(v) => setOperator(v as BooleanOperator)}
        >
          <SelectTrigger size="sm" className="h-7 min-h-7 w-24 rounded-md text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            alignItemWithTrigger={false}
            className="w-fit min-w-24"
          >
            <SelectItem value="and" className="min-h-7 py-1 font-mono text-[12px]">
              and
            </SelectItem>
            <SelectItem value="or" className="min-h-7 py-1 font-mono text-[12px]">
              or
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          onClick={addCondition}
        >
          <Plus className="size-3.5" />
          Condition
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          onClick={addGroup}
        >
          <Plus className="size-3.5" />
          Group
        </Button>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-auto size-7"
            aria-label="Remove group"
            onClick={onRemove}
          >
            <Minus className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {childEntries.map(({ child, key }) => (
          <div key={key} className="relative pl-4">
            <span
              className={cn(
                "absolute bottom-0 left-1.5 top-0 w-px",
                depth === 0 ? "bg-border" : "bg-border/70",
              )}
              aria-hidden
            />
            <span
              className={cn(
                "absolute left-1.5 top-4 h-px w-2.5",
                depth === 0 ? "bg-border" : "bg-border/70",
              )}
              aria-hidden
            />
            <NodeEditor
              node={child}
              depth={depth + 1}
              onChange={(next) => updateChild(child, next)}
              onRemove={() => removeChild(child)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────── Builder shell ───────────────────────────────── */

export interface WhenExpressionBuilderProps {
  /** Current AST. `undefined` means "no condition — always fires." */
  readonly value: KeybindingWhenNode | undefined;
  /** Called with new AST when either the text or the visual builder changes. */
  readonly onChange: (next: KeybindingWhenNode | undefined) => void;
  /** True when the text draft is syntactically valid; let parent disable save. */
  readonly onValidityChange?: (valid: boolean) => void;
}

/**
 * Two synchronised editors over a `KeybindingWhenNode`:
 *   - A monospaced text input for power users.
 *   - A recursive visual builder for everyone else.
 *
 * Edits in either view update the other. While the text view contains a
 * syntax error the visual half is locked behind a translucent overlay so
 * the user can't lose their place fixing the typo.
 */
export function WhenExpressionBuilder({
  value,
  onChange,
  onValidityChange,
}: WhenExpressionBuilderProps) {
  const canonicalText = whenAstToString(value);
  const [draft, setDraft] = useState(canonicalText);
  const parseResult = useMemo(() => parseDraft(draft), [draft]);
  const parseError = parseResult.kind === "error" ? parseResult.message : null;

  const updateFromText = (next: string) => {
    setDraft(next);
    const r = parseDraft(next);
    onValidityChange?.(r.kind !== "error");
    if (r.kind === "ok") onChange(r.value);
  };

  const updateFromVisual = (next: KeybindingWhenNode | undefined) => {
    const text = whenAstToString(next);
    setDraft(text);
    onValidityChange?.(true);
    onChange(next);
  };

  const addRootCondition = () => {
    if (!value) return updateFromVisual(defaultCondition());
    updateFromVisual({ type: "and", left: value, right: defaultCondition() });
  };

  const addRootGroup = () => {
    if (!value) return updateFromVisual(defaultGroup("or"));
    updateFromVisual({ type: "and", left: value, right: defaultGroup("or") });
  };

  const unknown = useMemo(() => {
    if (parseResult.kind !== "ok" || !parseResult.value) return [];
    const seen = new Set<string>();
    const walk = (n: KeybindingWhenNode) => {
      switch (n.type) {
        case "identifier":
          if (!isKnown(n.name)) seen.add(n.name);
          return;
        case "not":
          walk(n.node);
          return;
        case "and":
        case "or":
          walk(n.left);
          walk(n.right);
      }
    };
    walk(parseResult.value);
    return [...seen];
  }, [parseResult]);

  return (
    <div className="w-[min(34rem,calc(100vw-2rem))] space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">When</div>
          <div className="text-[11px] text-muted-foreground">
            Restrict this binding to a context. Empty = always fires.
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={addRootCondition}
          >
            <Plus className="size-3.5" />
            Condition
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={addRootGroup}
          >
            <Plus className="size-3.5" />
            Group
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="relative">
          <Input
            value={draft}
            onChange={(e) => updateFromText(e.currentTarget.value)}
            placeholder="Always"
            aria-invalid={Boolean(parseError)}
            aria-label="When expression"
            className={cn(
              "h-7 rounded-md font-mono text-[12px]",
              unknown.length > 0 && "pr-9",
              parseError &&
                "border-destructive/70 focus-visible:border-destructive",
            )}
          />
          {unknown.length > 0 && (
            <span className="absolute inset-y-0 right-2 flex items-center">
              <UnknownWarning identifiers={unknown} />
            </span>
          )}
        </div>
        {parseError && (
          <div className="flex items-center gap-1.5 text-[11px] text-destructive">
            <CircleX className="size-3.5" />
            {parseError}
          </div>
        )}
      </div>

      <div className="relative">
        {value ? (
          <NodeEditor
            node={value}
            onChange={updateFromVisual}
            onRemove={() => updateFromVisual(undefined)}
          />
        ) : (
          <div className="rounded-md border border-dashed border-border/80 bg-muted/15 p-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="h-7"
                onClick={addRootCondition}
              >
                <Plus className="size-3.5" />
                Condition
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={addRootGroup}
              >
                <Plus className="size-3.5" />
                Group
              </Button>
            </div>
          </div>
        )}
        {parseError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border border-destructive/30 bg-background/75 p-4 text-center text-xs text-destructive backdrop-blur-[1px]">
            Fix the expression above to continue editing visually.
          </div>
        )}
      </div>
    </div>
  );
}

type ParseResult =
  | { readonly kind: "ok"; readonly value: KeybindingWhenNode | undefined }
  | { readonly kind: "error"; readonly message: string };

function parseDraft(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { kind: "ok", value: undefined };
  const parsed = parseWhen(trimmed);
  if (parsed === null) return { kind: "ok", value: undefined };
  if ("type" in parsed) return { kind: "ok", value: parsed };
  return {
    kind: "error",
    message: `${parsed.message} (col ${parsed.position + 1})`,
  };
}
