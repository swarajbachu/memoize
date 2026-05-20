import {
  GitBranch,
  GitMerge,
  GitPullRequestArrow,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  TriangleAlert,
  Upload,
  Wrench,
} from "lucide-react";
import { Effect } from "effect";
import { useEffect, useState } from "react";

import type { FolderId, WorktreeId } from "@memoize/wire";

import { getRpcClient } from "../lib/rpc-client.ts";
import { formatShortcut } from "../lib/shortcuts.ts";
import {
  GlassActionButton,
  GlassChip,
  type GlassTone,
} from "./glass-action.tsx";
import { TooltipShortcut } from "./projects-sidebar.tsx";
import { useActiveContext } from "../store/active-workspace.ts";
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
        Nuuk
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
        <TooltipPopup>
          <TooltipShortcut
            label="Hide projects panel"
            shortcut={formatShortcut("toggle-left-sidebar")}
          />
        </TooltipPopup>
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
export function TopBarMain() {
  // Pull folderId + worktreeId from the canonical active context so the
  // branch label can never disagree with the terminal cwd, file tree root,
  // or composer chip — they all read from the same hook.
  const ctx = useActiveContext();
  const folderId = ctx.status === "ready" ? ctx.folderId : null;
  const worktreeId = ctx.status === "ready" ? ctx.worktreeId : null;
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

  // After a worktree/project switch the status row in `byKey` is keyed by
  // the *new* (folderId, worktreeId), so reading `status` returns null
  // until the first refresh lands — which is the correct behavior. No
  // stale-branch flash during the swap.
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
          <TooltipPopup>
            <TooltipShortcut
              label="Show projects panel"
              shortcut={formatShortcut("toggle-left-sidebar")}
            />
          </TooltipPopup>
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
          <TooltipShortcut
            label={rightSidebarOpen ? "Hide files panel" : "Show files panel"}
            shortcut={formatShortcut("toggle-right-sidebar")}
          />
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
      mergeable: "clean" | "conflicting" | "unknown";
    };

/**
 * Priority is the user's next sensible action, in order of urgency:
 *   1. dirty   — uncommitted files in the working tree
 *   2. ahead   — local commits not yet pushed (regardless of PR state — if
 *                there are unpushed commits, that's what the user should do
 *                next, not stare at failing checks on stale code)
 *   3. open-pr — a PR exists and the working tree + upstream are in sync
 *   4. idle    — nothing to do
 *
 * Each kind carries only the fields its button needs, so the renderer
 * doesn't have to re-narrow PR shape downstream.
 */
const deriveWorkflow = (
  status: { dirtyFiles: number; ahead: number } | null,
  pr: {
    state: string;
    number: number | null;
    url: string | null;
    isDraft?: boolean;
    checks?: "none" | "pending" | "success" | "failure";
    mergeable?: "clean" | "conflicting" | "unknown";
  } | null,
): Workflow => {
  if (status === null) return { kind: "idle" };
  if (status.dirtyFiles > 0) return { kind: "dirty", count: status.dirtyFiles };
  if (status.ahead > 0) return { kind: "ahead", count: status.ahead };
  if (pr && pr.state === "open") {
    return {
      kind: "open-pr",
      number: pr.number,
      url: pr.url,
      isDraft: pr.isDraft === true,
      checks: pr.checks ?? "none",
      mergeable: pr.mergeable ?? "unknown",
    };
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
export function TopBarRight() {
  const ctx = useActiveContext();
  const folderId = ctx.status === "ready" ? ctx.folderId : null;
  const worktreeId = ctx.status === "ready" ? ctx.worktreeId : null;
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
          <GlassChip tone="amber">
            {workflow.count} change{workflow.count === 1 ? "" : "s"}
          </GlassChip>
        ) : null}
        {workflow.kind === "ahead" ? (
          <GlassChip tone="pink">{workflow.count} ahead</GlassChip>
        ) : null}
        {workflow.kind === "open-pr" ? (
          <GlassChip tone={openPrChipTone(workflow)}>
            #{workflow.number ?? "?"}
          </GlassChip>
        ) : null}
      </div>
      <div className={`flex shrink-0 items-center gap-1 ${ACTION_CLASS}`}>
        {workflow.kind === "dirty" ? (
          <GlassActionButton
            tone="amber"
            icon={<Upload />}
            label="Commit & push"
            disabled={!composerReady}
            onClick={() => sendToComposer("commit and push the current changes")}
          />
        ) : null}
        {workflow.kind === "ahead" ? (
          <GlassActionButton
            tone="pink"
            icon={<GitPullRequestArrow />}
            label={pr && pr.state === "open" ? "Push commits" : "Create PR"}
            disabled={!composerReady}
            onClick={() =>
              sendToComposer(
                pr && pr.state === "open"
                  ? "push the unpushed commits on this branch"
                  : "create a pull request for this branch",
              )
            }
          />
        ) : null}
        {workflow.kind === "open-pr" && workflow.mergeable === "conflicting" ? (
          <GlassActionButton
            tone="red"
            icon={<TriangleAlert />}
            label="Resolve conflicts"
            disabled={!composerReady}
            onClick={() =>
              sendToComposer(
                "this pull request has merge conflicts — help me resolve them",
              )
            }
          />
        ) : null}
        {workflow.kind === "open-pr" &&
        workflow.mergeable !== "conflicting" &&
        workflow.checks === "failure" &&
        folderId !== null ? (
          <FixActionsButton
            folderId={folderId}
            worktreeId={worktreeId}
            disabled={!composerReady}
          />
        ) : null}
        {workflow.kind === "open-pr" &&
        workflow.mergeable !== "conflicting" &&
        workflow.checks !== "failure" ? (
          <GlassActionButton
            tone={workflow.isDraft ? "zinc" : "green"}
            icon={<GitMerge />}
            label={workflow.isDraft ? "Mark ready" : "Merge"}
            disabled={!composerReady || workflow.checks === "pending"}
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

const openPrChipTone = (
  w: Extract<Workflow, { kind: "open-pr" }>,
): GlassTone => {
  if (w.mergeable === "conflicting") return "red";
  if (w.checks === "failure") return "red";
  if (w.checks === "pending") return "amber";
  if (w.isDraft) return "zinc";
  return "green";
};

/**
 * Failing-checks CTA. On click, asks the server to drop a captured
 * `.memoize/failing-checks-<ts>.txt` artifact, then attaches it to the
 * composer as `@<relPath>` and primes the agent with a short instruction so
 * the user just has to hit send.
 *
 * Stateful (loading spinner) because the server has to call `gh run view
 * --log-failed` once per failing run; on a chunky pipeline this can take a
 * couple seconds.
 */
function FixActionsButton({
  folderId,
  worktreeId,
  disabled,
}: {
  folderId: FolderId;
  worktreeId: WorktreeId | null;
  disabled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const attachFile = useComposerBridge((s) => s.attachFile);
  const insertText = useComposerBridge((s) => s.insertText);
  const focusComposer = useComposerBridge((s) => s.focus);
  const setActiveMainTab = useUiStore((s) => s.setActiveMainTab);

  const onClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const client = await getRpcClient();
      const artifact = await Effect.runPromise(
        client.git.fixFailingChecks({ folderId, worktreeId }),
      );
      setActiveMainTab("chat");
      attachFile?.({
        relPath: artifact.relPath,
        absPath: artifact.absPath,
        kind: "file",
      });
      insertText?.(
        `Please look at the failing CI checks captured in this log and fix them.`,
      );
      focusComposer?.();
    } catch {
      // Server already surfaces a GitCommandError; nothing useful to render
      // in-place. The user can retry — leave the button enabled.
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassActionButton
      tone="red"
      icon={loading ? <Loader2 className="animate-spin" /> : <Wrench />}
      label={loading ? "Capturing…" : "Fix actions"}
      disabled={disabled || loading}
      onClick={onClick}
    />
  );
}

