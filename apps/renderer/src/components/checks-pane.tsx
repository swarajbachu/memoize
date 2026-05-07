import {
  CheckCircle2,
  Circle,
  CircleDashed,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";

import type { FolderId, GitPrInfo } from "@forkzero/wire";

import { softTone, type Tone } from "../lib/tones.ts";
import { useActiveWorktreeId } from "../store/active-workspace.ts";
import { gitStatusKey, useGitStatusStore } from "../store/git-status.ts";
import { prStateKey, usePrStateStore } from "../store/pr-state.ts";

const openExternal = (url: string) => {
  const bridge = window.forkzero?.app;
  if (bridge !== undefined) {
    bridge.openExternal(url);
    return;
  }
  // Web preview / dev fallback.
  window.open(url, "_blank", "noopener,noreferrer");
};

/**
 * Right-pane "Checks" tab. Mirrors the workflow state that previously lived
 * inline in the top bar — branch summary, PR pointer, draft state, and the
 * aggregated status-check rollup. The top bar keeps only the primary action
 * (Commit & push / Create PR / Merge) so the chrome stays uncluttered.
 */
export function ChecksPane({ folderId }: { folderId: FolderId | null }) {
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

  if (folderId === null) {
    return (
      <Empty>Select a project to see its branch + PR status here.</Empty>
    );
  }
  if (status === null) {
    return <Empty>Reading branch state…</Empty>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3 text-xs">
      <Section title="Branch">
        <Row label="Name">
          <span className="font-mono text-[11px] text-foreground">
            {status.branch ?? "(detached)"}
          </span>
        </Row>
        <Row label="Local changes">
          {status.dirtyFiles > 0 ? (
            <Pill tone="amber">
              {status.dirtyFiles} file{status.dirtyFiles === 1 ? "" : "s"}
            </Pill>
          ) : (
            <span className="text-muted-foreground">clean</span>
          )}
        </Row>
        <Row label="Ahead of upstream">
          {status.ahead > 0 ? (
            <Pill tone="sky">{status.ahead} commit{status.ahead === 1 ? "" : "s"}</Pill>
          ) : (
            <span className="text-muted-foreground">in sync</span>
          )}
        </Row>
      </Section>

      <Section title="Pull request">
        {pr === null || pr.state === "none" ? (
          <p className="text-muted-foreground">
            No pull request open for this branch.
          </p>
        ) : (
          <>
            <Row label="State">
              <PrStatePill pr={pr} />
            </Row>
            <Row label="Number">
              {pr.number !== null ? (
                <span className="font-mono text-foreground">#{pr.number}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Row>
            <Row label="Diff">
              <span className="font-mono text-[11px]">
                <span className="text-emerald-300/90">+{pr.additions}</span>
                {" "}
                <span className="text-rose-300/90">−{pr.deletions}</span>
              </span>
            </Row>
            {pr.url !== null ? (
              <button
                type="button"
                onClick={() => openExternal(pr.url!)}
                className="-mx-1 mt-1 flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                <ExternalLink className="size-3" />
                Open in browser
              </button>
            ) : null}
          </>
        )}
      </Section>

      <Section title="Checks">
        {pr === null || pr.state === "none" ? (
          <p className="text-muted-foreground">
            Open a pull request to see CI status here.
          </p>
        ) : (
          <ChecksSummary checks={pr.checks} isDraft={pr.isDraft} />
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">{children}</span>
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] ${softTone(tone)}`}
    >
      {children}
    </span>
  );
}

function PrStatePill({ pr }: { pr: GitPrInfo }) {
  if (pr.isDraft) return <Pill tone="zinc">Draft</Pill>;
  if (pr.state === "merged") return <Pill tone="violet">Merged</Pill>;
  if (pr.state === "closed") return <Pill tone="rose">Closed</Pill>;
  if (pr.checks === "failure") return <Pill tone="red">Open · checks failed</Pill>;
  if (pr.checks === "pending") return <Pill tone="amber">Open · checks running</Pill>;
  return <Pill tone="emerald">Open</Pill>;
}

function ChecksSummary({
  checks,
  isDraft,
}: {
  checks: GitPrInfo["checks"];
  isDraft: boolean;
}) {
  if (isDraft) {
    return (
      <Indicator
        icon={<CircleDashed className="size-4 text-zinc-400" />}
        title="Draft"
        body="Mark the PR as ready for review to start running checks."
      />
    );
  }
  if (checks === "none") {
    return (
      <Indicator
        icon={<Circle className="size-4 text-muted-foreground" />}
        title="No checks configured"
        body="There aren't any required status checks on this branch."
      />
    );
  }
  if (checks === "pending") {
    return (
      <Indicator
        icon={<Loader2 className="size-4 animate-spin text-amber-300" />}
        title="Checks running"
        body="At least one status check is still queued or in progress."
      />
    );
  }
  if (checks === "failure") {
    return (
      <Indicator
        icon={<XCircle className="size-4 text-red-400" />}
        title="Checks failed"
        body="One or more checks didn't pass. Inspect the run on GitHub."
      />
    );
  }
  return (
    <Indicator
      icon={<CheckCircle2 className="size-4 text-emerald-400" />}
      title="All checks passed"
      body="The branch is clear to merge."
    />
  );
}

function Indicator({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-muted-foreground">{body}</span>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}
