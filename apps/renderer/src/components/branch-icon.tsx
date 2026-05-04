import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "~/lib/utils";

/**
 * Branch / PR state for a session row's leading glyph. v1 only paints color;
 * the icon shape stays the same so the row never reflows when state flips.
 *   - default — no PR linked yet (muted text or selected-foreground)
 *   - pr-open — PR open against base branch (emerald)
 *   - pr-closed — PR merged or closed (purple)
 */
export type BranchState = "default" | "pr-open" | "pr-closed";

const COLOR_BY_STATE: Record<BranchState, { idle: string; selected: string }> =
  {
    default: {
      idle: "text-muted-foreground",
      selected: "text-sidebar-accent-foreground",
    },
    "pr-open": { idle: "text-emerald-400", selected: "text-emerald-300" },
    "pr-closed": { idle: "text-purple-400", selected: "text-purple-300" },
  };

export function BranchIcon({
  state = "default",
  selected = false,
  className,
}: {
  state?: BranchState;
  selected?: boolean;
  className?: string;
}) {
  const color = COLOR_BY_STATE[state];
  return (
    <HugeiconsIcon
      icon={GitBranchIcon}
      strokeWidth={2}
      className={cn(
        "size-3.5 shrink-0 transition-colors",
        selected ? color.selected : color.idle,
        className,
      )}
      aria-hidden="true"
    />
  );
}
