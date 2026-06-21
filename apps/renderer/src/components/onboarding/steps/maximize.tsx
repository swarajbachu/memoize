import { HugeiconsIcon } from "@hugeicons/react";
import {
  CircleArrowUp01Icon,
  Loading02Icon,
} from "@hugeicons-pro/core-bulk-rounded";
import { Effect } from "effect";
import { useEffect, useState } from "react";

import type { UsageReport } from "@memoize/wire";

import { formatTokens, formatUsd, totalTokens } from "~/lib/format-usage.ts";
import { getRpcClient } from "../../../lib/rpc-client.ts";
import { StepHeader } from "./shared.tsx";

/**
 * Monthly reference for the "token maxer" onboarding story. We do not know the
 * user's exact plan yet, so this mirrors the board's default stack: Claude Max
 * plus ChatGPT Pro. `apiValue` is API-equivalent monthly value heavy users can
 * pull from those flat fees as of mid-2026, illustrative and not guaranteed.
 */
const MONTHLY_STACK = {
  subscriptionCost: "$400",
  apiValue: "$11,500 to $15,000",
  plans: [
    { name: "Claude Max", price: "$200/mo", potential: "$1,500 to $5,000/mo" },
    { name: "ChatGPT Pro", price: "$200/mo", potential: "up to $10,000/mo" },
  ],
} as const;

const MONTHLY_CARDS: ReadonlyArray<{
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}> = [
  {
    label: "You pay this month",
    value: MONTHLY_STACK.subscriptionCost,
    detail: "Claude Max + ChatGPT Pro",
  },
  {
    label: "API value used this month",
    value: "dynamic",
    detail: "From your local agent logs",
  },
  {
    label: "You can pull this month",
    value: MONTHLY_STACK.apiValue,
    detail: "API-equivalent monthly ceiling",
  },
];

const currentMonthRange = () => {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const until = new Date(nextMonth.getTime() - 1);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return { since, until, timezone };
};

/**
 * Onboarding hook step. Reads this month's global Tokenmaxer report (scanned
 * from local CLI logs) and frames the whole monthly picture: what a user pays,
 * what API-equivalent value they already used, and what the subscription stack
 * can potentially produce.
 */
export function MaximizeStep() {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getRpcClient()
      .then((client) =>
        Effect.runPromise(
          client.usage.report({
            bucket: "monthly",
            ...currentMonthRange(),
          }),
        ),
      )
      .then((nextReport) => {
        if (cancelled) return;
        setReport(nextReport);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setReport(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = report?.summary ?? null;
  const tokens = summary !== null ? totalTokens(summary) : 0;
  const hasSpend = summary !== null && tokens > 0;
  const usedValue =
    summary !== null && summary.costUsd !== null
      ? formatUsd(summary.costUsd)
      : "$0.00";
  const sources =
    report?.bySource
      .filter((s) => totalTokens(s) > 0)
      .map((s) => s.label)
      .slice(0, 6) ?? [];
  const sourceLine = sources.length > 0 ? ` across ${sources.join(" · ")}` : "";

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        title="Maximize this month"
        subtitle="See the subscription bill, the API value you already used, and the value still available from the plans you pay for."
      />

      {loading ? (
        <SpendSkeleton />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {MONTHLY_CARDS.map((card) => (
            <MonthlyCard
              key={card.label}
              label={card.label}
              value={card.value === "dynamic" ? usedValue : card.value}
              detail={card.detail}
              accent={card.value === "dynamic"}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.025] p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <HugeiconsIcon
              icon={CircleArrowUp01Icon}
              className="size-4"
              strokeWidth={1.75}
            />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold text-foreground">
              The gap is the opportunity
            </span>
            <p className="max-w-md text-[12px] leading-relaxed text-muted-foreground">
              You pay a fixed monthly subscription. The more agents you run in
              parallel, the more API-equivalent value you get from the same
              bill.
            </p>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-white/[0.06] bg-black/10">
          {MONTHLY_STACK.plans.map((p) => (
            <PlanRow key={p.name} {...p} />
          ))}
        </div>

        {hasSpend ? (
          <p className="text-[10px] leading-snug text-muted-foreground/70">
            This month: {formatTokens(tokens)} tokens{sourceLine}.
          </p>
        ) : (
          <p className="text-[10px] leading-snug text-muted-foreground/70">
            No local usage found for this month yet. Once you run agents, this
            screen shows the API value you have already used.
          </p>
        )}
      </div>
    </div>
  );
}

function MonthlyCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className="flex min-h-32 flex-col justify-between rounded-2xl bg-white/[0.025] p-4">
      <span className="text-[11px] font-medium leading-snug text-muted-foreground">
        {label}
      </span>
      <span
        className={
          accent
            ? "text-2xl font-semibold leading-tight tracking-tight tabular-nums text-primary"
            : "text-2xl font-semibold leading-tight tracking-tight tabular-nums text-foreground"
        }
      >
        {value}
      </span>
      <span className="text-[11px] leading-snug text-muted-foreground">
        {detail}
      </span>
    </div>
  );
}

function PlanRow({
  name,
  price,
  potential,
}: {
  name: string;
  price: string;
  potential: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3 py-2.5 first:border-0">
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[12px] font-medium text-foreground">
          {name}
        </span>
        <span className="text-[11px] text-muted-foreground">{price}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="text-[13px] font-semibold tabular-nums text-primary">
          {potential}
        </span>
        <span className="text-[10px] text-muted-foreground">API value</span>
      </span>
    </div>
  );
}

function SpendSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.025] p-5">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <HugeiconsIcon
          icon={Loading02Icon}
          className="size-3.5 animate-spin"
          aria-hidden
        />
        Scanning this month&apos;s local agent logs...
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-8 w-24 animate-pulse rounded bg-white/[0.06]" />
          </div>
        ))}
      </div>
    </div>
  );
}
