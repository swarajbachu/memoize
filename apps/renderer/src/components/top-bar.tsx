import {
  GitBranch,
  GitMerge,
  GitPullRequestArrow,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Upload,
} from "lucide-react";
import { useEffect } from "react";

import type { FolderId } from "@memoize/wire";

import {
  softInteractive,
  softTone,
  solidInteractive,
  type Tone,
} from "../lib/tones.ts";
import { useActiveWorktreeId } from "../store/active-workspace.ts";
import { useComposerBridge } from "../store/composer-bridge.ts";
import { gitStatusKey, useGitStatusStore } from "../store/git-status.ts";
import { prStateKey, usePrStateStore } from "../store/pr-state.ts";
import { useSessionsStore } from "../store/sessions.ts";
import { useUiStore } from "../store/ui.ts";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "./ui/tooltip.tsx";

const SECTION_CLASS =
  "flex h-9 shrink-0 items-center gap-1.5 border-b border-border text-xs [-webkit-app-region:drag]";
const ACTION_CLASS = "[-webkit-app-region:no-drag]";
const ICON_BUTTON_CLASS = `${ACTION_CLASS} flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground`;

/**
 * Top bar over the projects panel: product name on the left + a left-pane
 * collapse toggle on the right. In windowed mode we leave 80px clear at
 * the start so the macOS traffic-light controls have room; in fullscreen
 * the controls are gone, so we hug the edge instead.
 */
export function TopBarLeft() {
  const setLeftSidebarOpen = useUiStore((s) => s.setLeftSidebarOpen);
  const isFullScreen = useUiStore((s) => s.isFullScreen);

  return (
    <header
      className={`${SECTION_CLASS} pr-1 ${isFullScreen ? "pl-3" : "pl-20"}`}
    >
      <span className="truncate font-semibold tracking-tight text-foreground">
        memoize
      </span>
      <span className="flex-1" />
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => setLeftSidebarOpen(false)}
              className={ICON_BUTTON_CLASS}
              aria-label="Hide projects panel"
            >
              <PanelLeftClose className="size-3.5" />
            </button>
          }
        />
        <TooltipPopup>Hide projects panel</TooltipPopup>
      </Tooltip>
    </header>
  );
}

/**
 * Top bar over the main pane. Holds the projects-panel open-toggle (only
 * when that panel is collapsed), the branch label, and the right-pane
 * open/close toggle (always visible — the user expects to find it here
 * regardless of which way the files panel is currently leaning).
 */
export function TopBarMain({ folderId }: { folderId: FolderId | null }) {
  // The branch label follows the active session's worktree so users see the
  // worktree's branch (e.g. happy-otter-42) when they're chatting against it,
  // not the main checkout's branch.
  const worktreeId = useActiveWorktreeId();
  const status = useGitStatusStore((s) =>
    folderId
      ? (s.byKey[gitStatusKey(folderId, worktreeId)] ?? null)
      : null,
  );
  const refresh = useGitStatusStore((s) => s.refresh);
  const leftSidebarOpen = useUiStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = useUiStore((s) => s.setLeftSidebarOpen);
  const rightSidebarOpen = useUiStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useUiStore((s) => s.setRightSidebarOpen);
  const isFullScreen = useUiStore((s) => s.isFullScreen);

  useEffect(() => {
    if (folderId === null) return;
    void refresh(folderId, worktreeId);
    const id = window.setInterval(
      () => void refresh(folderId, worktreeId),
      5000,
    );
    return () => window.clearInterval(id);
  }, [folderId, refresh, worktreeId]);

  const branchLabel = status?.branch ?? null;
  const showLeftToggle = !leftSidebarOpen;
  // When the left panel is open its own header carries the traffic-light
  // gutter, so this section starts flush. When it's collapsed we slide the
  // open-toggle into the leading slot — and in windowed mode reserve 80px
  // for the macOS controls. Native fullscreen hides those controls, so we
  // skip the reserve.
  const leftPad = showLeftToggle
    ? isFullScreen
      ? "pl-2"
      : "pl-20"
    : "pl-2";

  return (
    <header className={`${SECTION_CLASS} ${leftPad} pr-1`}>
      {showLeftToggle ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setLeftSidebarOpen(true)}
                className={ICON_BUTTON_CLASS}
                aria-label="Show projects panel"
              >
                <PanelLeftOpen className="size-3.5" />
              </button>
            }
          />
          <TooltipPopup>Show projects panel</TooltipPopup>
        </Tooltip>
      ) : null}
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
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              className={ICON_BUTTON_CLASS}
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

type Workflow =
  | { kind: "idle" }
  | { kind: "dirty"; count: number }
  | { kind: "ahead"; count: number }
  | {
      kind: "open-pr";
      number: number | null;
      url: string | null;
      isDraft: boolean;
      checks: "none" | "pending" | "success" | "failure";
    };

const deriveWorkflow = (
  status: { dirtyFiles: number; ahead: number } | null,
  pr: {
    state: string;
    number: number | null;
    url: string | null;
    isDraft?: boolean;
    checks?: "none" | "pending" | "success" | "failure";
  } | null,
): Workflow => {
  if (status === null) return { kind: "idle" };
  if (status.dirtyFiles > 0) return { kind: "dirty", count: status.dirtyFiles };
  if (pr && pr.state === "open") {
    return {
      kind: "open-pr",
      number: pr.number,
      url: pr.url,
      isDraft: pr.isDraft === true,
      checks: pr.checks ?? "none",
    };
  }
  if (status.ahead > 0 && (pr === null || pr.state === "none")) {
    return { kind: "ahead", count: status.ahead };
  }
  return { kind: "idle" };
};


/**
 * Top bar over the files panel: workflow status pill + primary action,
 * styled per state with the shared soft-tone palette.
 *
 * States today:
 *   idle     → empty
 *   dirty    → "<n> changes"  · Commit & push   (amber)
 *   ahead    → "<n> ahead"    · Create PR       (sky)
 *   open-pr  → "#<n>"         · Merge           (emerald)
 *
 * Draft / checks-pending stages need new fields on `GitPrInfo` and are
 * deferred — the layout already reserves the space.
 */
export function TopBarRight({ folderId }: { folderId: FolderId | null }) {
  const worktreeId = useActiveWorktreeId();
  const status = useGitStatusStore((s) =>
    folderId
      ? (s.byKey[gitStatusKey(folderId, worktreeId)] ?? null)
      : null,
  );
  const pr = usePrStateStore((s) =>
    folderId
      ? (s.byKey[prStateKey(folderId, worktreeId)] ?? null)
      : null,
  );
  const insertText = useComposerBridge((s) => s.insertText);
  const selectedSessionId = useSessionsStore((s) => s.selectedSessionId);
  const setActiveMainTab = useUiStore((s) => s.setActiveMainTab);

  const sendToComposer = (text: string) => {
    setActiveMainTab("chat");
    insertText?.(text);
  };

  const workflow = deriveWorkflow(status, pr);
  const composerReady = selectedSessionId !== null && insertText !== null;

  return (
    <header className={`${SECTION_CLASS} justify-between px-2`}>
      <div className={`flex min-w-0 flex-1 items-center gap-2 ${ACTION_CLASS}`}>
        {workflow.kind === "dirty" ? (
          <Pill tone="amber">
            {workflow.count} change{workflow.count === 1 ? "" : "s"}
          </Pill>
        ) : null}
        {workflow.kind === "ahead" ? (
          <Pill tone="sky">{workflow.count} ahead</Pill>
        ) : null}
        {workflow.kind === "open-pr" ? (
          <Pill tone={prBadgeTone(workflow)}>#{workflow.number ?? "?"}</Pill>
        ) : null}
      </div>
      <div className={`flex shrink-0 items-center gap-1 ${ACTION_CLASS}`}>
        {workflow.kind === "dirty" ? (
          <ActionButton
            tone="amber"
            variant="solid"
            icon={<Upload className="size-3.5" />}
            label="Commit & push"
            disabled={!composerReady}
            onClick={() => sendToComposer("commit and push the current changes")}
          />
        ) : null}
        {workflow.kind === "ahead" ? (
          <ActionButton
            tone="sky"
            variant="solid"
            icon={<GitPullRequestArrow className="size-3.5" />}
            label="Create PR"
            disabled={!composerReady}
            onClick={() => sendToComposer("create a pull request for this branch")}
          />
        ) : null}
        {workflow.kind === "open-pr" ? (
          <ActionButton
            tone="emerald"
            variant="solid"
            icon={<GitMerge className="size-3.5" />}
            label={workflow.isDraft ? "Mark ready" : "Merge"}
            disabled={
              !composerReady ||
              workflow.checks === "pending" ||
              workflow.checks === "failure"
            }
            onClick={() =>
              sendToComposer(
                workflow.isDraft
                  ? "mark this pull request as ready for review"
                  : "merge this pull request and delete the branch",
              )
            }
          />
        ) : null}
      </div>
    </header>
  );
}

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`flex shrink-0 items-center rounded-sm px-1.5 py-0.5 font-mono text-[10px] tracking-tight ${softTone(tone)}`}
    >
      {children}
    </span>
  );
}

type Variant = "solid" | "soft";

function ActionButton({
  tone,
  variant,
  icon,
  label,
  onClick,
  disabled,
  trailing,
}: {
  tone: Tone;
  variant: Variant;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  const palette =
    variant === "solid" ? solidInteractive(tone) : softInteractive(tone);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${palette}`}
    >
      {icon}
      {label}
      {trailing}
    </button>
  );
}

const prBadgeTone = (
  w: Extract<Workflow, { kind: "open-pr" }>,
): Tone => {
  if (w.checks === "failure") return "red";
  if (w.checks === "pending") return "amber";
  if (w.isDraft) return "zinc";
  return "emerald";
};
