import { useEffect, useRef, useState } from "react";

import { keyStringFromEvent } from "@memoize/wire";

import { cn } from "~/lib/utils";

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

interface KeyCaptureProps {
  /** Called with the captured normalized key string (e.g. "mod+shift+n"). */
  readonly onCapture: (key: string) => void;
  readonly onCancel: () => void;
  /** Optional initial display value while waiting for the first keypress. */
  readonly placeholder?: string;
}

/**
 * A focused, non-typable input that swallows the next keypress and reports
 * it back through `onCapture`. Escape cancels; Tab is allowed to bubble so
 * the user can keep tabbing through the surrounding UI. Modifier-only
 * presses (e.g. just Shift) are ignored — the parser would reject them
 * anyway, and capturing them would prevent the user from holding a
 * modifier while reaching for the base key.
 */
export function KeyCapture({
  onCapture,
  onCancel,
  placeholder = "Press a key combination…",
}: KeyCaptureProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="textbox"
      aria-label="Press the desired key combination"
      onBlur={onCancel}
      onKeyDown={(event) => {
        // Let Tab pass through so users don't get trapped here.
        if (event.key === "Tab") return;
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }
        const captured = keyStringFromEvent(event.nativeEvent, IS_MAC);
        if (captured === null) {
          // Modifier-only press — show "still listening" feedback.
          const mods: string[] = [];
          if (event.metaKey) mods.push(IS_MAC ? "⌘" : "Win");
          if (event.ctrlKey) mods.push(IS_MAC ? "⌃" : "Ctrl");
          if (event.altKey) mods.push(IS_MAC ? "⌥" : "Alt");
          if (event.shiftKey) mods.push(IS_MAC ? "⇧" : "Shift");
          setPending(mods.join(IS_MAC ? " " : "+") || null);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onCapture(captured);
      }}
      onKeyUp={() => setPending(null)}
      className={cn(
        "flex h-7 min-w-[8rem] cursor-text items-center justify-center rounded-md border border-foreground/40 bg-accent/30 px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className={pending ? "text-foreground" : "text-muted-foreground"}>
        {pending ?? placeholder}
      </span>
    </div>
  );
}
