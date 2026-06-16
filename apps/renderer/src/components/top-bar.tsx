import {
  Check,
  ChevronDown,
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
  Wand2,
  Wrench,
} from "lucide-react";
import { Effect } from "effect";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import {
  ComposerInput,
  type FolderId,
  type GitMergeMethod,
  type WorktreeId,
} from "@memoize/wire";

import { getRpcClient } from "../lib/rpc-client.ts";
import { formatShortcut } from "../lib/shortcuts.ts";
import {
  GlassActionButton,
  GlassChip,
  type GlassTone,
} from "./glass-action.tsx";
import { TooltipShortcut } from "./projects-sidebar.tsx";
import { useActiveContext } from "../store/active-workspace.ts";
import { gitStatusKey, useGitStatusStore } from "../store/git-status.ts";
import { useMergePrefs } from "../store/merge-prefs.ts";
import { useMessagesStore } from "../store/messages.ts";
import { prStateKey, usePrStateStore } from "../store/pr-state.ts";
import { useSessionsStore } from "../store/sessions.ts";
import { useUiStore } from "../store/ui.ts";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu.tsx";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip.tsx";

/**
 * Open a URL in the user's real browser via the desktop bridge, falling back
 * to `window.open` when running outside Electron (Storybook / web preview).
 * Mirrors `pr-pane.tsx`'s helper.
 */
const openExternal = (url: string): void => {
  const bridge = window.memoize?.app;
  if (bridge !== undefined) {
    bridge.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
};

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
        Memoize
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
    folderId ? (s.byKey[gitStatusKey(folderId, worktreeId)] ?? null) : null,
  );
  const refresh = useGitStatusStore((s) => s.refresh);
  const refreshPr = usePrStateStore((s) => s.refresh);
  const leftSidebarOpen = useUiStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = useUiStore((s) => s.setLeftSidebarOpen);
  const rightSidebarOpen = useUiStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useUiStore((s) => s.setRightSidebarOpen);
  const isFullScreen = useUiStore((s) => s.isFullScreen);

  // Poll both `git status` (branch / dirty / ahead) and the PR state (CI
  // rollup, mergeable, auto-merge) on the same 5s tick so the top-bar PR
  // cluster shows live "N checks running" without the PR pane being open.
  useEffect(() => {
    if (folderId === null) return;
    const tick = () => {
      void refresh(folderId, worktreeId);
      void refreshPr(folderId, worktreeId);
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [folderId, refresh, refreshPr, worktreeId]);

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
  const leftPad = showLeftToggle ? (isFullScreen ? "pl-2" : "pl-20") : "pl-2";

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
      <div
        className={`flex min-w-0 flex-1 items-center gap-1.5 ${ACTION_CLASS}`}
      >
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

type OpenPrWorkflow = {
  kind: "open-pr";
  number: number | null;
  url: string | null;
  isDraft: boolean;
  checks: "none" | "pending" | "success" | "failure";
  mergeable: "clean" | "conflicting" | "unknown";
  checksTotal: number;
  checksRunning: number;
  checksPassing: number;
  checksFailing: number;
  autoMergeEnabled: boolean;
};

type Workflow =
  | { kind: "idle" }
  | { kind: "dirty"; count: number }
  | { kind: "ahead"; count: number }
  | { kind: "ready-for-pr" }
  | OpenPrWorkflow;

/**
 * Priority is the user's next sensible action, in order of urgency:
 *   1. dirty   — uncommitted files in the working tree
 *   2. ahead   — local commits not yet pushed; push before creating or
 *                updating a PR
 *   3. open-pr — a PR exists and the working tree + upstream are in sync
 *   4. ready-for-pr — clean pushed worktree branch with no open PR
 *   5. idle    — nothing to do
 *
 * Each kind carries only the fields its button needs, so the renderer
 * doesn't have to re-narrow PR shape downstream.
 */
const deriveWorkflow = (
  status: { branch: string | null; dirtyFiles: number; ahead: number } | null,
  pr: {
    state: string;
    number: number | null;
    url: string | null;
    isDraft?: boolean;
    checks?: "none" | "pending" | "success" | "failure";
    mergeable?: "clean" | "conflicting" | "unknown";
    checksTotal?: number;
    checksRunning?: number;
    checksPassing?: number;
    checksFailing?: number;
    autoMergeEnabled?: boolean;
  } | null,
  canCreatePrWhenSynced: boolean,
): Workflow => {
  const prOpen = pr !== null && pr.state === "open";
  const prKnownNotOpen = pr !== null && !prOpen;
  if (status === null) return { kind: "idle" };
  if (status.dirtyFiles > 0) return { kind: "dirty", count: status.dirtyFiles };
  if (status.ahead > 0) return { kind: "ahead", count: status.ahead };
  if (pr && prOpen) {
    return {
      kind: "open-pr",
      number: pr.number,
      url: pr.url,
      isDraft: pr.isDraft === true,
      checks: pr.checks ?? "none",
      mergeable: pr.mergeable ?? "unknown",
      checksTotal: pr.checksTotal ?? 0,
      checksRunning: pr.checksRunning ?? 0,
      checksPassing: pr.checksPassing ?? 0,
      checksFailing: pr.checksFailing ?? 0,
      autoMergeEnabled: pr.autoMergeEnabled === true,
    };
  }
  if (canCreatePrWhenSynced && prKnownNotOpen) return { kind: "ready-for-pr" };
  return { kind: "idle" };
};

const canCreatePrFromSyncedBranch = (
  status: { branch: string | null } | null,
  ctx: ReturnType<typeof useActiveContext>,
): boolean => {
  if (ctx.status !== "ready" || ctx.worktreePending) return false;
  if (ctx.rootKind === "worktree") return true;
  const branch = status?.branch ?? null;
  return branch !== null && branch !== "main" && branch !== "master";
};

/**
 * Refresh both git status and PR state after a direct git/gh action so the
 * top-bar workflow re-derives immediately rather than waiting for the next
 * 5s poll.
 */
const refreshAfterAction = (
  folderId: FolderId,
  worktreeId: WorktreeId | null,
): void => {
  void useGitStatusStore.getState().refresh(folderId, worktreeId);
  void usePrStateStore.getState().refresh(folderId, worktreeId);
};

/**
 * Top bar over the files panel: a PR-integration cluster on the left
 * (clickable hash + live CI status) and the primary action(s) on the right.
 *
 * Mechanical actions run directly with a spinner (Merge, Mark ready, Push
 * commits, Auto-merge toggle, capturing CI logs). Actions that need the agent
 * (Resolve conflicts, Create PR, Commit & push, Fix CI) auto-submit a new chat
 * message — they never just pre-fill the composer.
 */
export function TopBarRight() {
  const ctx = useActiveContext();
  const folderId = ctx.status === "ready" ? ctx.folderId : null;
  const worktreeId = ctx.status === "ready" ? ctx.worktreeId : null;
  const status = useGitStatusStore((s) =>
    folderId ? (s.byKey[gitStatusKey(folderId, worktreeId)] ?? null) : null,
  );
  const pr = usePrStateStore((s) =>
    folderId ? (s.byKey[prStateKey(folderId, worktreeId)] ?? null) : null,
  );
  const selectedSessionId = useSessionsStore((s) => s.selectedSessionId);
  const setActiveMainTab = useUiStore((s) => s.setActiveMainTab);

  // Auto-submit a new chat message to the active session (no manual Send).
  const sendToAgent = (text: string) => {
    if (selectedSessionId === null) return;
    setActiveMainTab("chat");
    void useMessagesStore.getState().send(selectedSessionId, text);
  };

  const canCreatePrWhenSynced = canCreatePrFromSyncedBranch(status, ctx);
  const workflow = deriveWorkflow(status, pr, canCreatePrWhenSynced);
  const agentReady = selectedSessionId !== null;

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
        {workflow.kind === "ready-for-pr" ? (
          <GlassChip tone="zinc">No PR</GlassChip>
        ) : null}
        {workflow.kind === "open-pr" ? (
          <>
            <PrHashChip workflow={workflow} />
            <CiStatus workflow={workflow} />
          </>
        ) : null}
      </div>
      <div className={`flex shrink-0 items-center gap-1 ${ACTION_CLASS}`}>
        {workflow.kind === "dirty" ? (
          <GlassActionButton
            tone="amber"
            icon={<Upload />}
            label="Commit & push"
            disabled={!agentReady}
            onClick={() => sendToAgent("commit and push the current changes")}
          />
        ) : null}
        {workflow.kind === "ahead" && folderId !== null ? (
          // Pushing committed changes needs no agent — do it directly.
          <DirectActionButton
            tone="pink"
            icon={<Upload />}
            label="Push commits"
            loadingLabel="Pushing…"
            run={async () => {
              const client = await getRpcClient();
              await Effect.runPromise(
                client.git.push({ folderId, worktreeId }),
              );
            }}
            onSuccess={() => refreshAfterAction(folderId, worktreeId)}
          />
        ) : null}
        {workflow.kind === "ready-for-pr" ? (
          <GlassActionButton
            tone="pink"
            icon={<GitPullRequestArrow />}
            label="Create PR"
            disabled={!agentReady}
            onClick={() => sendToAgent("create a pull request for this branch")}
          />
        ) : null}
        {workflow.kind === "open-pr" && workflow.mergeable === "conflicting" ? (
          <GlassActionButton
            tone="red"
            icon={<TriangleAlert />}
            label="Resolve conflicts"
            disabled={!agentReady}
            onClick={() =>
              sendToAgent(
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
            disabled={!agentReady}
          />
        ) : null}
        {workflow.kind === "open-pr" &&
        workflow.mergeable !== "conflicting" &&
        workflow.checks !== "failure" &&
        workflow.isDraft &&
        folderId !== null ? (
          <DirectActionButton
            tone="zinc"
            icon={<GitMerge />}
            label="Mark ready"
            loadingLabel="Marking…"
            run={async () => {
              const client = await getRpcClient();
              await Effect.runPromise(
                client.git.markReady({ folderId, worktreeId }),
              );
            }}
            onSuccess={() => refreshAfterAction(folderId, worktreeId)}
          />
        ) : null}
        {workflow.kind === "open-pr" &&
        workflow.mergeable !== "conflicting" &&
        workflow.checks !== "failure" &&
        !workflow.isDraft &&
        folderId !== null ? (
          <>
            {workflow.checks === "pending" ? (
              <AutoMergeToggle
                folderId={folderId}
                worktreeId={worktreeId}
                enabled={workflow.autoMergeEnabled}
              />
            ) : (
              <MergeButton folderId={folderId} worktreeId={worktreeId} />
            )}
          </>
        ) : null}
      </div>
    </header>
  );
}

const openPrChipTone = (w: OpenPrWorkflow): GlassTone => {
  if (w.mergeable === "conflicting") return "red";
  if (w.checks === "failure") return "red";
  if (w.checks === "pending") return "amber";
  if (w.isDraft) return "zinc";
  return "green";
};

/**
 * PR number pill. Clicking it opens the PR on GitHub in the OS browser.
 * Tinted by the same workflow tone the merge button uses.
 */
function PrHashChip({ workflow }: { workflow: OpenPrWorkflow }) {
  const checksRunning = workflow.checksRunning;
  const label =
    checksRunning > 0
      ? `${checksRunning} check${checksRunning === 1 ? "" : "s"} running`
      : `#${workflow.number ?? "?"}`;
  const content =
    checksRunning > 0 ? (
      <span className="flex items-center gap-1.5">
        <Loader2 className="size-3 animate-spin" />
        {label}
      </span>
    ) : (
      label
    );
  if (workflow.url === null) {
    return <GlassChip tone={openPrChipTone(workflow)}>{content}</GlassChip>;
  }
  const url = workflow.url;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => openExternal(url)}
            className="cursor-pointer rounded-md transition-opacity hover:opacity-80"
            aria-label={`Open pull request #${workflow.number ?? "?"} on GitHub`}
          >
            <GlassChip tone={openPrChipTone(workflow)}>{content}</GlassChip>
          </button>
        }
      />
      <TooltipPopup>
        Open pull request #{workflow.number ?? "?"} on GitHub
      </TooltipPopup>
    </Tooltip>
  );
}

/**
 * Live CI rollup readout. Polled via the top-bar's 5s pr-state refresh.
 *   running → spinner + "N checks running"
 *   failing → "N checks failing" (red)
 *   passing → "Checks passed" (green)
 *   none    → nothing
 */
function CiStatus({ workflow }: { workflow: OpenPrWorkflow }) {
  if (workflow.checksTotal === 0) return null;
  if (workflow.checksRunning > 0) return null;
  if (workflow.checksFailing > 0) {
    const n = workflow.checksFailing;
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-[var(--accent-red)]">
        <TriangleAlert className="size-3.5" />
        {n} check{n === 1 ? "" : "s"} failing
      </span>
    );
  }
  return null;
}

/**
 * GlassActionButton wrapper for direct (non-agent) git/gh actions. Shows a
 * spinner while the RPC is in flight and, on failure, a red warning affordance
 * whose tooltip carries gh's verbatim error (click to dismiss). The user can
 * retry once it clears.
 */
function DirectActionButton({
  tone,
  icon,
  label,
  loadingLabel,
  disabled,
  run,
  onSuccess,
}: {
  tone: GlassTone;
  icon: ReactNode;
  label: string;
  loadingLabel: string;
  disabled?: boolean;
  run: () => Promise<unknown>;
  onSuccess?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await run();
      onSuccess?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {error !== null ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setError(null)}
                className="flex size-6 items-center justify-center rounded-sm text-[var(--accent-red)] hover:bg-foreground/5"
                aria-label="Action failed — dismiss"
              >
                <TriangleAlert className="size-3.5" />
              </button>
            }
          />
          <TooltipPopup className="max-w-xs">{error}</TooltipPopup>
        </Tooltip>
      ) : null}
      <GlassActionButton
        tone={tone}
        icon={loading ? <Loader2 className="animate-spin" /> : icon}
        label={loading ? loadingLabel : label}
        disabled={disabled || loading}
        onClick={onClick}
      />
    </div>
  );
}

const MERGE_METHOD_LABEL: Record<GitMergeMethod, string> = {
  merge: "Create a merge commit",
  squash: "Squash and merge",
  rebase: "Rebase and merge",
};

/**
 * Direct Merge button + method picker. The chevron opens a menu to choose
 * merge / squash / rebase; the choice is remembered (merge-prefs store) so the
 * next PR defaults to it, mirroring GitHub's behaviour. Disabled while checks
 * are still pending.
 */
function MergeButton({
  folderId,
  worktreeId,
}: {
  folderId: FolderId;
  worktreeId: WorktreeId | null;
}) {
  const method = useMergePrefs((s) => s.method);
  const deleteBranch = useMergePrefs((s) => s.deleteBranch);
  const setMethod = useMergePrefs((s) => s.setMethod);

  return (
    <div className="flex items-center gap-1">
      <DirectActionButton
        tone="green"
        icon={<GitMerge />}
        label="Merge"
        loadingLabel="Merging…"
        run={async () => {
          const client = await getRpcClient();
          await Effect.runPromise(
            client.git.mergePr({
              folderId,
              worktreeId,
              action: "merge",
              method,
              deleteBranch,
            }),
          );
        }}
        onSuccess={() => refreshAfterAction(folderId, worktreeId)}
      />
      <Menu>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                className="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                aria-label="Choose merge method"
              >
                <ChevronDown className="size-3.5" />
              </MenuTrigger>
            }
          />
          <TooltipPopup>Merge method</TooltipPopup>
        </Tooltip>
        <MenuPopup align="end" className="min-w-[200px]">
          {(["merge", "squash", "rebase"] as const).map((m) => (
            <MenuItem
              key={m}
              onClick={() => setMethod(m)}
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-xs hover:bg-sidebar-accent"
            >
              <Check
                className={`size-3.5 ${method === m ? "opacity-100" : "opacity-0"}`}
              />
              {MERGE_METHOD_LABEL[m]}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    </div>
  );
}

/**
 * Auto-merge toggle. Arms / disarms GitHub-native auto-merge via
 * `gh pr merge --auto` / `--disable-auto`. The enabled state is sourced from
 * polled PR state (`autoMergeEnabled`), so it reflects GitHub's truth even
 * across app restarts. If the repo doesn't allow auto-merge, gh's error
 * surfaces in the warning tooltip.
 */
function AutoMergeToggle({
  folderId,
  worktreeId,
  enabled,
}: {
  folderId: FolderId;
  worktreeId: WorktreeId | null;
  enabled: boolean;
}) {
  const method = useMergePrefs((s) => s.method);
  const deleteBranch = useMergePrefs((s) => s.deleteBranch);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.git.mergePr({
          folderId,
          worktreeId,
          action: enabled ? "disable-auto" : "enable-auto",
          method,
          deleteBranch,
        }),
      );
      refreshAfterAction(folderId, worktreeId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const tip = enabled
    ? "Auto-merge is on. GitHub will merge this PR automatically once all required checks pass. Click to turn off."
    : `Auto-merge on success — GitHub merges this PR automatically once all required checks pass, using your selected merge method (${method}). Requires the repository to allow auto-merge.`;

  return (
    <div className="flex items-center gap-1">
      {error !== null ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setError(null)}
                className="flex size-6 items-center justify-center rounded-sm text-[var(--accent-red)] hover:bg-foreground/5"
                aria-label="Auto-merge failed — dismiss"
              >
                <TriangleAlert className="size-3.5" />
              </button>
            }
          />
          <TooltipPopup className="max-w-xs">{error}</TooltipPopup>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => void toggle()}
              disabled={loading}
              style={
                { ["--tone" as string]: "var(--accent-blue)" } as CSSProperties
              }
              className={`glass-tone flex h-7 items-center gap-1.5 rounded-[10px] px-2.5 text-[11px] font-semibold tracking-tight transition-opacity disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-3.5 ${
                enabled ? "" : "opacity-60 hover:opacity-90"
              }`}
              aria-pressed={enabled}
            >
              {loading ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {enabled ? "Auto-merge on" : "Auto-merge"}
            </button>
          }
        />
        <TooltipPopup className="max-w-xs">{tip}</TooltipPopup>
      </Tooltip>
    </div>
  );
}

const errorMessage = (err: unknown): string => {
  if (typeof err === "object" && err !== null && "reason" in err) {
    const reason = (err as { reason?: unknown }).reason;
    if (typeof reason === "string" && reason.length > 0) return reason;
  }
  if (err instanceof Error && err.message.length > 0) return err.message;
  return "Something went wrong.";
};

/**
 * Failing-checks CTA. Asks the server to drop a captured
 * `.memoize/failing-checks-<ts>.txt` artifact, then **auto-submits** a new chat
 * message referencing it as a file ref — the agent starts working immediately,
 * no manual Send.
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
  const selectedSessionId = useSessionsStore((s) => s.selectedSessionId);
  const setActiveMainTab = useUiStore((s) => s.setActiveMainTab);

  const onClick = async () => {
    if (loading || selectedSessionId === null) return;
    setLoading(true);
    try {
      const client = await getRpcClient();
      const artifact = await Effect.runPromise(
        client.git.fixFailingChecks({ folderId, worktreeId }),
      );
      setActiveMainTab("chat");
      const input = new ComposerInput({
        text: "Please look at the failing CI checks captured in this log and fix them.",
        attachments: [],
        fileRefs: [
          {
            relPath: artifact.relPath,
            absPath: artifact.absPath,
            kind: "file",
          },
        ],
        skillRefs: [],
      });
      await useMessagesStore.getState().send(selectedSessionId, input);
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
      label={loading ? "Capturing…" : "Fix CI errors"}
      disabled={disabled || loading}
      onClick={onClick}
    />
  );
}
