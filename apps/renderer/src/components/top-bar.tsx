import {
  ExternalLink,
  GitBranch,
  GitPullRequestArrow,
  PanelRightClose,
  PanelRightOpen,
  Upload,
} from "lucide-react";
import { useEffect } from "react";

import type { FolderId } from "@forkzero/wire";

import { useComposerBridge } from "../store/composer-bridge.ts";
import { useGitStatusStore } from "../store/git-status.ts";
import { usePrStateStore } from "../store/pr-state.ts";
import { useSessionsStore } from "../store/sessions.ts";
import { useUiStore } from "../store/ui.ts";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "./ui/tooltip.tsx";

const ACTION_CLASS = "[-webkit-app-region:no-drag]";

/**
 * Full-width app top bar. The whole strip is a macOS drag region
 * (`[-webkit-app-region:drag]`) so users can grab any empty space to move
 * the window — non-drag islands re-enable interaction with `ACTION_CLASS`.
 *
 * Order, left → right:
 *   1. ~80px gutter that the traffic-light controls overlap (titleBarStyle is
 *      `hiddenInset`).
 *   2. Branch + dirty count from `git.status`.
 *   3. Spacer.
 *   4. Contextual workflow button derived from `git.status` + `git.prState`:
 *        dirty                              → Commit & push
 *        clean + ahead > 0 + no PR          → Create PR
 *        open PR                            → View PR
 *      Click prefills the chat composer with a phrasing and focuses it; the
 *      user confirms with Enter so we never silently kick off git ops.
 *      Draft / checks / merge stages need new wire fields and are deferred.
 *   5. Right-sidebar toggle that drives the files panel's collapsed state.
 */
export function TopBar({ folderId }: { folderId: FolderId | null }) {
  const status = useGitStatusStore((s) =>
    folderId ? (s.byFolder[folderId] ?? null) : null,
  );
  const refresh = useGitStatusStore((s) => s.refresh);
  const pr = usePrStateStore((s) =>
    folderId ? (s.byFolder[folderId] ?? null) : null,
  );
  const insertText = useComposerBridge((s) => s.insertText);
  const selectedSessionId = useSessionsStore((s) => s.selectedSessionId);
  const setActiveMainTab = useUiStore((s) => s.setActiveMainTab);
  const rightSidebarOpen = useUiStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useUiStore((s) => s.setRightSidebarOpen);

  useEffect(() => {
    if (folderId === null) return;
    void refresh(folderId);
    const id = window.setInterval(() => void refresh(folderId), 5000);
    return () => window.clearInterval(id);
  }, [folderId, refresh]);

  const sendToComposer = (text: string) => {
    setActiveMainTab("chat");
    insertText?.(text);
  };

  const branchLabel = status?.branch ?? null;

  let action: React.ReactNode = null;
  if (status && status.dirtyFiles > 0) {
    action = (
      <ActionButton
        icon={<Upload className="size-3.5" />}
        label="Commit & push"
        disabled={selectedSessionId === null || insertText === null}
        onClick={() => sendToComposer("commit and push the current changes")}
      />
    );
  } else if (
    status &&
    status.dirtyFiles === 0 &&
    status.ahead > 0 &&
    (pr === null || pr.state === "none")
  ) {
    action = (
      <ActionButton
        icon={<GitPullRequestArrow className="size-3.5" />}
        label="Create PR"
        disabled={selectedSessionId === null || insertText === null}
        onClick={() => sendToComposer("create a pull request for this branch")}
      />
    );
  } else if (pr && pr.state === "open" && pr.url) {
    const url = pr.url;
    action = (
      <ActionButton
        icon={<ExternalLink className="size-3.5" />}
        label={pr.number ? `View PR #${pr.number}` : "View PR"}
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
      />
    );
  }

  return (
    <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border pr-2 text-xs [-webkit-app-region:drag]">
      <div className="w-20 shrink-0" aria-hidden />
      <div className={`flex min-w-0 flex-1 items-center gap-1.5 ${ACTION_CLASS}`}>
        {branchLabel ? (
          <>
            <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium" title={branchLabel}>
              {branchLabel}
            </span>
            {status && status.dirtyFiles > 0 ? (
              <span className="shrink-0 text-muted-foreground">
                · {status.dirtyFiles} change
                {status.dirtyFiles === 1 ? "" : "s"}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      {action ? <div className={ACTION_CLASS}>{action}</div> : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              className={`${ACTION_CLASS} rounded p-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground`}
              aria-label={
                rightSidebarOpen ? "Hide files panel" : "Show files panel"
              }
            >
              {rightSidebarOpen ? (
                <PanelRightClose className="size-3.5" />
              ) : (
                <PanelRightOpen className="size-3.5" />
              )}
            </button>
          }
        />
        <TooltipPopup>
          {rightSidebarOpen ? "Hide files panel" : "Show files panel"}
        </TooltipPopup>
      </Tooltip>
    </header>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}
