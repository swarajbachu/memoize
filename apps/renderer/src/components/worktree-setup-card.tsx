import {
  Alert01Icon,
  GitBranchIcon,
  Tick01Icon,
} from "@hugeicons-pro/core-bulk-rounded";
import { HugeiconsIcon } from "@hugeicons/react";

import { useActiveContext } from "../store/active-workspace.ts";
import { EMPTY_WORKTREES, useWorktreesStore } from "../store/worktrees.ts";
import { Button } from "./ui/button.tsx";
import { Spinner } from "./ui/spinner";

/**
 * Inline timeline card shown while the active session's worktree is being set
 * up. Streams the live setup log (driven by `worktree.setupStream` →
 * `useWorktreesStore.subscribeSetup`) and offers a rerun on failure. Renders
 * nothing once setup has succeeded/skipped, or when there's no worktree.
 */
export function WorktreeSetupCard() {
  const ctx = useActiveContext();
  const worktree = useWorktreesStore((s) => {
    if (ctx.status !== "ready" || ctx.worktreeId === null) return null;
    const list = s.byProject[ctx.folderId] ?? EMPTY_WORKTREES;
    return list.find((w) => w.id === ctx.worktreeId) ?? null;
  });
  const rerunSetup = useWorktreesStore((s) => s.rerunSetup);

  if (worktree === null) return null;
  const status = worktree.setupStatus;
  // Done & clean — nothing to surface.
  if (status === "succeeded" || status === "skipped") return null;

  const running = status === "running" || status === "pending";
  const failed = status === "failed";
  const output = worktree.setupOutput;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4">
      <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/15">
        <header className="flex items-center gap-2 border-b border-border/40 px-3.5 py-2.5">
          <HugeiconsIcon
            icon={GitBranchIcon}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="flex-1 text-[13px] font-medium text-foreground/90">
            Creating a worktree and running setup
          </span>
          {running ? (
            <Spinner className="size-3.5 text-muted-foreground" />
          ) : failed ? (
            <HugeiconsIcon
              icon={Alert01Icon}
              className="size-4 text-[var(--accent-red)]"
            />
          ) : null}
        </header>
        <div className="flex flex-col gap-1.5 px-3.5 py-2.5 text-[12px]">
          <StepRow state="done" label={`Created worktree ${worktree.name}`} />
          <StepRow
            state={running ? "running" : failed ? "failed" : "done"}
            label={
              running
                ? "Running environment setup"
                : failed
                  ? "Environment setup failed"
                  : "Environment setup complete"
            }
          />
        </div>
        {output.trim().length > 0 ? (
          <pre className="max-h-48 overflow-auto border-t border-border/40 bg-background/40 px-3.5 py-2.5 font-mono text-[11px] leading-5 whitespace-pre-wrap text-foreground/80">
            {output}
          </pre>
        ) : null}
        {failed ? (
          <div className="flex justify-end border-t border-border/40 px-3.5 py-2">
            <Button
              variant="settings"
              size="sm"
              onClick={() =>
                void rerunSetup(worktree.projectId, worktree.id)
              }
            >
              Rerun setup
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StepRow({
  state,
  label,
}: {
  state: "done" | "running" | "failed";
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {state === "running" ? (
        <Spinner className="size-3 shrink-0 text-muted-foreground" />
      ) : state === "failed" ? (
        <HugeiconsIcon
          icon={Alert01Icon}
          className="size-3.5 shrink-0 text-[var(--accent-red)]"
        />
      ) : (
        <HugeiconsIcon
          icon={Tick01Icon}
          className="size-3.5 shrink-0 text-foreground/60"
        />
      )}
      <span
        className={
          state === "failed" ? "text-[var(--accent-red)]" : "text-foreground/80"
        }
      >
        {label}
      </span>
    </div>
  );
}
