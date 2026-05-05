import {
  ExternalLink,
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

const SECTION_CLASS =
  "flex h-9 shrink-0 items-center gap-1.5 border-b border-border text-xs [-webkit-app-region:drag]";
const ACTION_CLASS = "[-webkit-app-region:no-drag]";
const ICON_BUTTON_CLASS = `${ACTION_CLASS} flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground`;

/**
 * Top bar over the projects panel: product name on the left + a left-sidebar
 * collapse toggle on the right (when the panel is open). The leading `pl-20`
 * preserves space for the macOS traffic-light controls under
 * `titleBarStyle: "hiddenInset"`.
 */
export function TopBarLeft() {
  const leftSidebarOpen = useUiStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = useUiStore((s) => s.setLeftSidebarOpen);

  return (
    <header className={`${SECTION_CLASS} pr-1 pl-20`}>
      <span className="truncate font-semibold tracking-tight text-foreground">
        forkzero
      </span>
      <span className="flex-1" />
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
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
 * Top bar over the main pane: when the projects panel is collapsed, surface
 * the open-toggle on the left. Branch name in the middle, right-sidebar
 * toggle on the right.
 */
export function TopBarMain({ folderId }: { folderId: FolderId | null }) {
  const status = useGitStatusStore((s) =>
    folderId ? (s.byFolder[folderId] ?? null) : null,
  );
  const refresh = useGitStatusStore((s) => s.refresh);
  const leftSidebarOpen = useUiStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = useUiStore((s) => s.setLeftSidebarOpen);
  const rightSidebarOpen = useUiStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useUiStore((s) => s.setRightSidebarOpen);

  useEffect(() => {
    if (folderId === null) return;
    void refresh(folderId);
    const id = window.setInterval(() => void refresh(folderId), 5000);
    return () => window.clearInterval(id);
  }, [folderId, refresh]);

  const branchLabel = status?.branch ?? null;
  const showLeftToggle = !leftSidebarOpen;
  // When the left panel is open its own header carries the toggle, so this
  // section starts flush with no left padding. When it's collapsed we slide
  // the open-toggle into the leading slot (after a traffic-light gutter so
  // the icon doesn't sit under the macOS window controls).
  const leftPad = showLeftToggle ? "pl-20" : "pl-2";

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
      {!rightSidebarOpen ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setRightSidebarOpen(true)}
                className={ICON_BUTTON_CLASS}
                aria-label="Show files panel"
              >
                <PanelRightOpen className="size-3.5" />
              </button>
            }
          />
          <TooltipPopup>Show files panel</TooltipPopup>
        </Tooltip>
      ) : null}
    </header>
  );
}

type Workflow =
  | { kind: "idle" }
  | { kind: "dirty"; count: number }
  | { kind: "ahead"; count: number }
  | { kind: "open-pr"; number: number | null; url: string };

const deriveWorkflow = (
  status: { dirtyFiles: number; ahead: number } | null,
  pr: { state: string; number: number | null; url: string | null } | null,
): Workflow => {
  if (status === null) return { kind: "idle" };
  if (status.dirtyFiles > 0) return { kind: "dirty", count: status.dirtyFiles };
  if (pr && pr.state === "open" && pr.url !== null) {
    return { kind: "open-pr", number: pr.number, url: pr.url };
  }
  if (status.ahead > 0 && (pr === null || pr.state === "none")) {
    return { kind: "ahead", count: status.ahead };
  }
  return { kind: "idle" };
};

/**
 * Top bar over the files panel: workflow status pill + primary action,
 * styled per state. Each click prefills the chat composer with a phrasing
 * the user confirms with Enter — we never silently kick off git ops.
 *
 * States today:
 *   idle     → empty
 *   dirty    → "<n> changes"  · Commit & push
 *   ahead    → "<n> ahead"    · Create PR
 *   open-pr  → "#<n> Open PR" · View PR
 *
 * Draft / checks / merge stages need new fields on `GitPrInfo` and are
 * deferred — the layout already reserves the space.
 */
export function TopBarRight({ folderId }: { folderId: FolderId | null }) {
  const status = useGitStatusStore((s) =>
    folderId ? (s.byFolder[folderId] ?? null) : null,
  );
  const pr = usePrStateStore((s) =>
    folderId ? (s.byFolder[folderId] ?? null) : null,
  );
  const insertText = useComposerBridge((s) => s.insertText);
  const selectedSessionId = useSessionsStore((s) => s.selectedSessionId);
  const setActiveMainTab = useUiStore((s) => s.setActiveMainTab);
  const setRightSidebarOpen = useUiStore((s) => s.setRightSidebarOpen);

  const sendToComposer = (text: string) => {
    setActiveMainTab("chat");
    insertText?.(text);
  };

  const workflow = deriveWorkflow(status, pr);
  const composerReady = selectedSessionId !== null && insertText !== null;

  return (
    <header className={`${SECTION_CLASS} justify-between pr-1 pl-2`}>
      <div className={`flex min-w-0 flex-1 items-center gap-2 ${ACTION_CLASS}`}>
        {workflow.kind === "dirty" ? (
          <Pill tone="amber">
            {workflow.count} change{workflow.count === 1 ? "" : "s"}
          </Pill>
        ) : null}
        {workflow.kind === "ahead" ? (
          <Pill tone="blue">
            {workflow.count} ahead
          </Pill>
        ) : null}
        {workflow.kind === "open-pr" ? (
          <>
            <Pill tone="green">#{workflow.number ?? "?"}</Pill>
            <span className="truncate text-emerald-300/90">Open PR</span>
          </>
        ) : null}
      </div>
      <div className={`flex shrink-0 items-center gap-1 ${ACTION_CLASS}`}>
        {workflow.kind === "dirty" ? (
          <ActionButton
            tone="amber"
            icon={<Upload className="size-3.5" />}
            label="Commit & push"
            disabled={!composerReady}
            onClick={() => sendToComposer("commit and push the current changes")}
          />
        ) : null}
        {workflow.kind === "ahead" ? (
          <ActionButton
            tone="blue"
            icon={<GitPullRequestArrow className="size-3.5" />}
            label="Create PR"
            disabled={!composerReady}
            onClick={() => sendToComposer("create a pull request for this branch")}
          />
        ) : null}
        {workflow.kind === "open-pr" ? (
          <ActionButton
            tone="green"
            icon={<GitMerge className="size-3.5" />}
            label="View PR"
            onClick={() =>
              window.open(workflow.url, "_blank", "noopener,noreferrer")
            }
            trailing={<ExternalLink className="size-3" />}
          />
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setRightSidebarOpen(false)}
                className={ICON_BUTTON_CLASS}
                aria-label="Hide files panel"
              >
                <PanelRightClose className="size-3.5" />
              </button>
            }
          />
          <TooltipPopup>Hide files panel</TooltipPopup>
        </Tooltip>
      </div>
    </header>
  );
}

type Tone = "amber" | "blue" | "green";

const PILL_TONE: Record<Tone, string> = {
  amber:
    "border-amber-400/30 bg-amber-500/10 text-amber-200/90",
  blue: "border-sky-400/30 bg-sky-500/10 text-sky-200/90",
  green: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200/90",
};

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] tracking-tight ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

const BUTTON_TONE: Record<Tone, string> = {
  amber:
    "border-amber-400/30 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25",
  blue: "border-sky-400/30 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25",
  green:
    "border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25",
};

function ActionButton({
  tone,
  icon,
  label,
  onClick,
  disabled,
  trailing,
}: {
  tone: Tone;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_TONE[tone]}`}
    >
      {icon}
      {label}
      {trailing}
    </button>
  );
}
