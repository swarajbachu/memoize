import { ChatGptIcon, ClaudeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";

import type { ProviderId } from "@memoize/wire";

import { cn } from "~/lib/utils";

type HugeProps = ComponentProps<typeof HugeiconsIcon>;
type ProviderIconProps = Omit<HugeProps, "icon"> & {
  providerId: ProviderId;
};

const ICON_BY_PROVIDER = {
  claude: ClaudeIcon,
  codex: ChatGptIcon,
} as const satisfies Record<ProviderId, HugeProps["icon"]>;

/**
 * Provider glyph for both Claude and Codex sessions. Uses HugeIcons (no
 * remote downloads, no inline SVGs to maintain). Default size matches the
 * `size-3.5` lucide pattern used elsewhere in the sidebar/composer.
 */
export function ProviderIcon({
  providerId,
  className,
  strokeWidth = 1.75,
  ...props
}: ProviderIconProps) {
  return (
    <HugeiconsIcon
      icon={ICON_BY_PROVIDER[providerId]}
      strokeWidth={strokeWidth}
      className={cn("size-3.5 shrink-0", className)}
      aria-hidden="true"
      {...props}
    />
  );
}
