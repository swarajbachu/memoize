import {
  GitBranchIcon,
  MessageAdd01Icon,
  Rocket01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";

import type { ProviderId } from "@memoize/wire";

import { cn } from "~/lib/utils";
import { PROVIDER_LABEL } from "./settings-page";
import { ThreeDots } from "./ui/loaders";

/**
 * Step-by-step progress shown while `chat.create` is in flight. The RPC
 * itself is atomic (no sub-step events from the server), so the step
 * transitions are time-based — they give the user a sense of "things are
 * happening" instead of one stale 2–5s spinner. The final step is always
 * the active one and stays until the parent unmounts this panel (which
 * happens when MainShell swaps to ChatView).
 *
 * Visual model lifted from the Conductor workspace-bootstrap screen:
 * minimal monochrome icons, plain rows, key values rendered as small
 * inline code-chips. No bounding card, no big circles.
 */
type Stage = {
  readonly id: string;
  readonly icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  /** Ms to spend on this step before advancing. `null` = stay forever. */
  readonly hold: number | null;
  /** Rendered to the right of the icon. May contain <Chip> elements. */
  readonly render: () => React.ReactNode;
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[12px] text-foreground/90">
      {children}
    </code>
  );
}

export function ChatCreatingPanel({
  providerId,
  willCreateWorktree,
  prompt,
}: {
  readonly providerId: ProviderId;
  /** Whether this chat will spin up its own git worktree. Adds the
   * "branching a fresh worktree" step when true. */
  readonly willCreateWorktree: boolean;
  /** The user's just-submitted prompt. Empty string when this panel was
   * launched from the sidebar "+" button (no prompt yet). */
  readonly prompt: string;
}) {
  const providerLabel = PROVIDER_LABEL[providerId] ?? providerId;

  const stages = useMemo<ReadonlyArray<Stage>>(() => {
    const out: Array<Stage> = [
      {
        id: "chat",
        icon: MessageAdd01Icon,
        hold: 350,
        render: () => <>Created a new chat</>,
      },
    ];
    if (willCreateWorktree) {
      out.push({
        id: "worktree",
        icon: GitBranchIcon,
        hold: 900,
        render: () => (
          <>
            Branching a fresh worktree off <Chip>main</Chip>
          </>
        ),
      });
      out.push({
        id: "setup",
        icon: SparklesIcon,
        hold: 1800,
        render: () => <>Running setup script</>,
      });
    }
    out.push({
      id: "provider",
      icon: Rocket01Icon,
      hold: 1400,
      render: () => (
        <>
          Starting <Chip>{providerLabel}</Chip>
        </>
      ),
    });
    out.push({
      id: "ready",
      icon: SparklesIcon,
      hold: null,
      render: () => <>Loading workspace…</>,
    });
    return out;
  }, [providerLabel, willCreateWorktree]);

  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const stage = stages[i];
      if (stage === undefined || stage.hold === null) return;
      timer = setTimeout(() => {
        if (cancelled) return;
        i += 1;
        setActive(i);
        tick();
      }, stage.hold);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [stages]);

  return (
    <div className="flex flex-col gap-4">
      {prompt.length > 0 && (
        <div className="rounded-md border border-border/40 bg-muted/25 px-2.5 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Queued
          </div>
          <p className="line-clamp-3 text-[13px] leading-relaxed text-foreground/85">
            {prompt}
          </p>
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {stages.map((stage, i) => {
          const state =
            i < active ? "done" : i === active ? "active" : "pending";
          return (
            <li
              key={stage.id}
              className={cn(
                "flex items-center gap-2.5 text-[13px] leading-tight transition-colors",
                state === "done" && "text-foreground/70",
                state === "active" && "text-foreground",
                state === "pending" && "text-muted-foreground/40",
              )}
            >
              <HugeiconsIcon
                icon={stage.icon}
                className={cn(
                  "size-3.5 shrink-0",
                  state === "pending" && "opacity-60",
                )}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="min-w-0 truncate">{stage.render()}</span>
              {state === "active" && (
                <span className="ml-1 inline-flex items-center text-muted-foreground">
                  <ThreeDots dotSize={2.5} cellPadding={1} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
