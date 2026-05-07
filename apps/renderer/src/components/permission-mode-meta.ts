import { ListChecks, PencilLine, Play } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { PermissionMode } from "@forkzero/wire";

/**
 * Shared label/description/icon for each SDK lifecycle mode. Mirrors the
 * RuntimeMode pattern — the chat-composer chip and any future settings
 * surface read from this map so they stay in lockstep.
 */
export type PermissionModeMeta = {
  readonly label: string;
  readonly description: string;
  readonly Icon: LucideIcon;
};

export const PERMISSION_MODE_META: Record<PermissionMode, PermissionModeMeta> = {
  default: {
    label: "Run",
    description: "Normal operation — agent runs tools and edits files.",
    Icon: Play,
  },
  plan: {
    label: "Plan",
    description:
      "Read-only exploration — agent proposes a plan via ExitPlanMode before any changes.",
    Icon: ListChecks,
  },
  acceptEdits: {
    label: "Auto-accept edits",
    description: "Auto-approve file edits, ask before other actions.",
    Icon: PencilLine,
  },
};

export const PERMISSION_MODES_ORDER: ReadonlyArray<PermissionMode> = [
  "default",
  "plan",
  "acceptEdits",
];
