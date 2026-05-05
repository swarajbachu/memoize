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

import { softInteractive, softTone, type Tone } from "../lib/tones.ts";
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
const ICON_BUTTON_CLASS = `${ACTION_CLASS} flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground`;

/**
 * Top bar over the projects panel: product name on the left + a left-pane
 * collapse toggle on the right. The leading `pl-20` preserves space for the
 * macOS traffic-light controls under `titleBarStyle: "hiddenInset"`.
 */
export function TopBarLeft() {
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
 * styled per state with the shared soft-tone palette.
 *
 * States today:
 *   idle     → empty
 *   dirty    → "<n> changes"  · Commit & push   (amber)
 *   ahead    → "<n> ahead"    · Create PR       (sky)
 *   open-pr  → "#<n>"         · View PR         (emerald)
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
          <Pill tone="sky">
            {workflow.count} ahead
          </Pill>
        ) : null}
        {workflow.kind === "open-pr" ? (
          <Pill tone="emerald">#{workflow.number ?? "?"}</Pill>
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
            tone="sky"
            icon={<GitPullRequestArrow className="size-3.5" />}
            label="Create PR"
            disabled={!composerReady}
            onClick={() => sendToComposer("create a pull request for this branch")}
          />
        ) : null}
        {workflow.kind === "open-pr" ? (
          <ActionButton
            tone="emerald"
            icon={<GitMerge className="size-3.5" />}
            label="View PR"
            onClick={() =>
              window.open(workflow.url, "_blank", "noopener,noreferrer")
            }
            trailing={<ExternalLink className="size-3 opacity-70" />}
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
      className={`flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${softInteractive(tone)}`}
    >
      {icon}
      {label}
      {trailing}
    </button>
  );
}
