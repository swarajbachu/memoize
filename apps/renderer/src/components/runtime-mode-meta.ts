import { Lock, LockOpen, PencilLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { RuntimeMode } from "@memoize/wire";

/**
 * Shared label/description/icon for each runtime mode. Used by the composer's
 * permission menu and the Settings page's "Default permission mode" radio
 * cards so they stay perfectly in sync.
 */
export type ModeMeta = {
  readonly label: string;
  readonly description: string;
  readonly Icon: LucideIcon;
};

export const MODE_META: Record<RuntimeMode, ModeMeta> = {
  "approval-required": {
    label: "Supervised",
    description: "Ask before commands and file changes.",
    Icon: Lock,
  },
  "auto-accept-edits": {
    label: "Auto-accept edits",
    description: "Auto-approve edits, ask before other actions.",
    Icon: PencilLine,
  },
  "full-access": {
    label: "Full access",
    description: "Allow commands and edits without prompts.",
    Icon: LockOpen,
  },
};

export const MODES_ORDER: ReadonlyArray<RuntimeMode> = [
  "approval-required",
  "auto-accept-edits",
  "full-access",
];
