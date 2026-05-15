import {
  ChatGptIcon,
  ClaudeIcon,
  GoogleGeminiIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";

import type { ProviderId } from "@memoize/wire";

import { cn } from "~/lib/utils";
import { GrokIcon } from "./icons/grok-icon";

type HugeProps = ComponentProps<typeof HugeiconsIcon>;
type ProviderIconProps = Omit<HugeProps, "icon"> & {
  providerId: ProviderId;
};

type HugeProviderId = Exclude<ProviderId, "grok" | "cursor">;

const HUGE_ICON_BY_PROVIDER = {
  claude: ClaudeIcon,
  codex: ChatGptIcon,
  gemini: GoogleGeminiIcon,
} as const satisfies Record<HugeProviderId, HugeProps["icon"]>;

/**
 * Cursor brand mark. HugeIcons doesn't ship a Cursor logo, so we inline the
 * official brand SVG and tint it to match the surrounding text colour
 * (foreground in light/dark themes). Sized via the same className that the
 * HugeiconsIcon receives.
 */
function CursorBrandIcon({
  className,
  ...props
}: Omit<HugeProps, "icon">) {
  return (
    <svg
      viewBox="0 0 466.73 532.09"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-3.5 shrink-0 fill-current", className)}
      aria-hidden="true"
      {...(props as React.SVGProps<SVGSVGElement>)}
    >
      <path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z" />
    </svg>
  );
}

/**
 * Provider glyph for Claude, Codex, Grok, Gemini, and Cursor sessions.
 * Uses HugeIcons where available; Grok uses a custom icon component and
 * Cursor falls back to an inline brand mark because HugeIcons doesn't ship
 * one. Default size matches the `size-3.5` lucide pattern used elsewhere
 * in the sidebar/composer.
 */
export function ProviderIcon({
  providerId,
  className,
  strokeWidth = 1.75,
  ...props
}: ProviderIconProps) {
  if (providerId === "grok") {
    return <GrokIcon className={cn("size-3.5 shrink-0", className)} />;
  }
  if (providerId === "cursor") {
    return <CursorBrandIcon className={className} {...props} />;
  }
  return (
    <HugeiconsIcon
      icon={HUGE_ICON_BY_PROVIDER[providerId]}
      strokeWidth={strokeWidth}
      className={cn("size-3.5 shrink-0", className)}
      aria-hidden="true"
      {...props}
    />
  );
}
