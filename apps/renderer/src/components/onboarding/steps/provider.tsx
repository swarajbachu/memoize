import { Check, ExternalLink, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import type { AgentAvailability, ProviderId } from "@memoize/wire";

import { ProviderIcon } from "~/components/provider-icons";
import { PROVIDER_LABEL } from "~/components/settings-page";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { useProvidersStore } from "../../../store/providers.ts";
import { useSettingsStore } from "../../../store/settings.ts";
import { StepHeader } from "./shared.tsx";

// Subscription-gated providers — same set surfaced as violet notices on the
// settings ProviderCard and filtered out of the composer's provider picker.
// We can't verify the plan from the CLI, so the onboarding card flags the
// requirement before the user picks the provider and discovers it the
// hard way mid-session.
const SUBSCRIPTION_INFO: Partial<
  Record<ProviderId, { readonly plan: string; readonly url: string }>
> = {
  grok: { plan: "SuperGrok Heavy", url: "https://grok.com/#subscribe" },
  cursor: { plan: "Cursor Pro", url: "https://cursor.com/pricing" },
};

const openExternal = (url: string): void => {
  if (typeof window === "undefined") return;
  const bridge = (window as unknown as {
    memoize?: { app?: { openExternal?: (u: string) => void } };
  }).memoize?.app?.openExternal;
  if (typeof bridge === "function") {
    bridge(url);
    return;
  }
  window.open(url, "_blank", "noopener");
};

const LOGIN_HINT: Record<ProviderId, string> = {
  claude: "claude /login",
  codex: "codex login",
  grok: "grok",
  cursor: "cursor-agent login",
  gemini: "gemini",
  opencode: "opencode auth login",
};

const INSTALL_HINT: Record<ProviderId, string> = {
  claude: "npm i -g @anthropic-ai/claude-code",
  codex: "npm i -g @openai/codex",
  grok: "curl -fsSL https://x.ai/cli/install.sh | bash",
  cursor: "curl https://cursor.com/install -fsS | bash",
  gemini: "npm i -g @google/gemini-cli",
  opencode: "curl -fsSL https://opencode.ai/install | bash",
};

const PROVIDER_TAGLINE: Record<ProviderId, string> = {
  claude: "Anthropic · Opus, Sonnet, Haiku",
  codex: "OpenAI · GPT-5 family",
  grok: "xAI · Grok",
  cursor: "Cursor · GPT, Sonnet, Opus",
  gemini: "Google · Gemini 3 Pro",
  opencode: "Any model · Local agents",
};

type ProviderState =
  | { readonly kind: "loading" }
  | { readonly kind: "missing" } // CLI not installed
  | { readonly kind: "outdated"; readonly current: string; readonly required: string; readonly command: string | null } // installed but below SDK floor
  | { readonly kind: "signed-out" } // CLI installed, not logged in, no API key
  | { readonly kind: "subscription"; readonly plan: string } // logged in but missing required paid plan (e.g. SuperGrok Heavy)
  | { readonly kind: "ready"; readonly via: "cli" | "key" };

function deriveState(
  providerId: ProviderId,
  availability: ReadonlyArray<AgentAvailability>,
  loading: boolean,
): ProviderState {
  const a = availability.find((x) => x.providerId === providerId);
  if (a === undefined) {
    return loading ? { kind: "loading" } : { kind: "missing" };
  }
  if (!a.cliInstalled) return { kind: "missing" };
  // Outdated trumps logged-in / ready: a stale CLI will reject the SDK's
  // probe flags regardless of auth state, so showing "Connected" here would
  // be misleading.
  if (a.cliVersionStatus === "outdated") {
    return {
      kind: "outdated",
      current: a.cliVersion ?? "unknown version",
      required: a.cliVersionMinRequired ?? "a newer version",
      command: a.cliUpgradeCommand ?? null,
    };
  }

  // For subscription-gated providers (grok, cursor), the server-side probe
  // (parseGrokAuthJson etc.) sets authLabel to "Requires SuperGrok Heavy"
  // (or equivalent) when the JWT tier is insufficient, even if cliLoggedIn
  // is true. We surface this as a distinct state so onboarding no longer
  // lies to paying users who already have the plan.
  if (a.cliLoggedIn) {
    const subInfo = SUBSCRIPTION_INFO[providerId];
    const unmet =
      subInfo !== undefined &&
      (a.authLabel ?? "").toLowerCase().includes("require");
    if (unmet) {
      return { kind: "subscription", plan: subInfo.plan };
    }
    return { kind: "ready", via: "cli" };
  }

  if (a.hasApiKey) return { kind: "ready", via: "key" };
  return { kind: "signed-out" };
}

export function ProviderStep() {
  const defaultProviderId = useSettingsStore((s) => s.defaultProviderId);
  const setDefaultProvider = useSettingsStore((s) => s.setDefaultProvider);
  const availability = useProvidersStore((s) => s.availability);
  const loading = useProvidersStore((s) => s.loading);

  const providers: ReadonlyArray<ProviderId> = [
    "claude",
    "codex",
    "grok",
    "gemini",
    "cursor",
    "opencode",
  ];

  return (
    <div className="flex flex-col gap-7">
      <StepHeader
        kicker="Step 1"
        title="Pick your agent"
        subtitle="Nuuk uses your existing CLI credentials — no API keys required."
      />

      <div className="grid grid-cols-2 gap-2.5">
        {providers.map((pid) => (
          <ProviderCard
            key={pid}
            providerId={pid}
            state={deriveState(pid, availability, loading)}
            active={pid === defaultProviderId}
            onClick={() => setDefaultProvider(pid)}
          />
        ))}
      </div>

      <ProviderStatus
        providerId={defaultProviderId}
        state={deriveState(defaultProviderId, availability, loading)}
      />
    </div>
  );
}

function ProviderCard({
  providerId,
  state,
  active,
  onClick,
}: {
  providerId: ProviderId;
  state: ProviderState;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl p-4 text-left transition-all",
        active
          ? "bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "bg-white/[0.025] hover:bg-white/[0.05]",
      )}
    >
      {active && (
        <span className="absolute right-3 top-3 flex size-4 items-center justify-center rounded-full bg-foreground text-background">
          <Check className="size-2.5" strokeWidth={3.5} />
        </span>
      )}
      <div className="flex w-full items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.06] text-foreground">
          <ProviderIcon providerId={providerId} className="size-4" />
        </span>
        {!active && <StateDot state={state} />}
      </div>
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-medium leading-none text-foreground">
          {PROVIDER_LABEL[providerId]}
        </span>
        <span className="text-[11px] leading-snug text-muted-foreground">
          {PROVIDER_TAGLINE[providerId]}
        </span>
      </span>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StateLine state={state} />
        {/* Only show the "Subscription" badge when the probe actually
            detected an unmet plan requirement. Users with a valid tier
            (authLabel = "SuperGrok Heavy") see a normal "CLI logged in"
            card without the badge. */}
        {state.kind === "subscription" && (
          <span className="rounded-full bg-violet-500/[0.12] px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-violet-300">
            Subscription
          </span>
        )}
      </div>
    </button>
  );
}

function StateDot({ state }: { state: ProviderState }) {
  const styles: Record<ProviderState["kind"], string> = {
    loading: "bg-muted-foreground/40 animate-pulse",
    missing: "bg-rose-400/80",
    outdated: "bg-amber-400",
    "signed-out": "bg-amber-400",
    subscription: "bg-amber-400",
    ready: "bg-emerald-400",
  };
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        styles[state.kind],
      )}
      aria-hidden
    />
  );
}

function StateLine({ state }: { state: ProviderState }) {
  const text =
    state.kind === "loading"
      ? "Checking…"
      : state.kind === "missing"
        ? "Not installed"
        : state.kind === "outdated"
          ? "Update required"
          : state.kind === "signed-out"
            ? "Sign in required"
            : state.kind === "subscription"
              ? "Subscription required"
              : state.via === "cli"
                ? "CLI logged in"
                : "API key set";
  const tone =
    state.kind === "ready"
      ? "text-emerald-300/90"
      : state.kind === "signed-out" ||
          state.kind === "outdated" ||
          state.kind === "subscription"
        ? "text-amber-300/90"
        : state.kind === "missing"
          ? "text-rose-300/90"
          : "text-muted-foreground";
  return (
    <span className={cn("text-[10px] font-medium tracking-wide", tone)}>
      {text.toUpperCase()}
    </span>
  );
}

function ProviderStatus({
  providerId,
  state,
}: {
  providerId: ProviderId;
  state: ProviderState;
}) {
  const refresh = useProvidersStore((s) => s.refresh);

  const headline =
    state.kind === "loading"
      ? "Checking your machine…"
      : state.kind === "ready"
        ? state.via === "cli"
          ? "Ready to go"
          : "Ready — using API key"
        : state.kind === "signed-out"
          ? "Sign in to the CLI"
          : state.kind === "subscription"
            ? "Subscription required"
            : state.kind === "outdated"
              ? "Update the CLI"
              : "Install the CLI";

  const subline =
    state.kind === "loading"
      ? "Probing CLI install + login state."
      : state.kind === "ready"
        ? state.via === "cli"
          ? "We picked up your existing CLI session."
          : "Stored in your OS keychain."
        : state.kind === "signed-out"
          ? "Already installed — just run the login command below."
          : state.kind === "subscription"
            ? "Your CLI login was detected, but the required paid plan was not confirmed."
            : state.kind === "outdated"
              ? `${PROVIDER_LABEL[providerId]} ${state.current} is too old; Memoize needs ${state.required}.`
              : `${PROVIDER_LABEL[providerId]}'s CLI isn't on your PATH yet.`;

  const showLoginBlock = state.kind === "signed-out";
  const showInstallBlock = state.kind === "missing";
  const showUpgradeBlock = state.kind === "outdated";
  const apiSummary = state.kind === "ready" && state.via === "key";

  // Only show the violet subscription nag when the probe explicitly told us
  // the plan requirement is unmet (authLabel contains "Requires"). If the
  // user has a valid SuperGrok Heavy JWT (tier >= 5), authLabel will be
  // "SuperGrok Heavy" and we treat them as ready (no nag).
  const subscriptionInfo = SUBSCRIPTION_INFO[providerId];
  const showSubscriptionNotice = state.kind === "subscription";

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-medium text-foreground">
            {headline}
          </span>
          <span className="text-[11px] leading-snug text-muted-foreground">
            {subline}
          </span>
        </div>
        <StatusPill state={state} />
      </div>

      {showSubscriptionNotice && subscriptionInfo !== undefined && (
        <SubscriptionNotice
          providerId={providerId}
          plan={subscriptionInfo.plan}
          url={subscriptionInfo.url}
        />
      )}

      {showInstallBlock && (
        <CodeRow
          command={INSTALL_HINT[providerId]}
          onRecheck={() => void refresh()}
        />
      )}
      {showUpgradeBlock && state.kind === "outdated" && (
        <CodeRow
          command={state.command ?? INSTALL_HINT[providerId]}
          onRecheck={() => void refresh()}
        />
      )}
      {showLoginBlock && (
        <CodeRow
          command={LOGIN_HINT[providerId]}
          onRecheck={() => void refresh()}
        />
      )}

      <details className="group/keys">
        <summary className="cursor-pointer select-none list-none text-[11px] text-muted-foreground hover:text-foreground">
          {apiSummary
            ? "API key saved — replace it"
            : "or paste an API key instead"}
        </summary>
        <div className="pt-3">
          <ApiKeyRow providerId={providerId} />
        </div>
      </details>
    </div>
  );
}

function SubscriptionNotice({
  providerId,
  plan,
  url,
}: {
  providerId: ProviderId;
  plan: string;
  url: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-violet-400/25 bg-violet-500/[0.08] px-3 py-2.5">
      <span className="text-[11px] font-medium text-violet-200">
        Requires {plan} subscription
      </span>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Sessions will fail if your plan doesn&apos;t include {plan}. Subscribe
        (or confirm your existing plan) before using {PROVIDER_LABEL[providerId]}.
      </p>
      <div>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => openExternal(url)}
          className="gap-1.5 rounded-full bg-violet-500/15 px-2.5 text-[11px] text-violet-200 hover:bg-violet-500/25 hover:text-violet-100"
        >
          <ExternalLink className="size-3" />
          Subscribe to {plan}
        </Button>
      </div>
    </div>
  );
}

function CodeRow({
  command,
  onRecheck,
}: {
  command: string;
  onRecheck: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-black/30 px-3 py-2 font-mono text-[12px]">
      <code className="truncate text-foreground/90">$ {command}</code>
      <Button
        size="xs"
        variant="ghost"
        onClick={onRecheck}
        className="h-6 shrink-0 rounded-full px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
      >
        Recheck
      </Button>
    </div>
  );
}

function StatusPill({ state }: { state: ProviderState }) {
  const map: Record<
    ProviderState["kind"],
    { label: string; dot: string; bg: string; text: string }
  > = {
    loading: {
      label: "Checking",
      dot: "bg-muted-foreground/50",
      bg: "bg-white/[0.04]",
      text: "text-muted-foreground",
    },
    missing: {
      label: "Not installed",
      dot: "bg-rose-400",
      bg: "bg-rose-400/12",
      text: "text-rose-300",
    },
    outdated: {
      label: "Update",
      dot: "bg-amber-400",
      bg: "bg-amber-400/12",
      text: "text-amber-300",
    },
    "signed-out": {
      label: "Sign in",
      dot: "bg-amber-400",
      bg: "bg-amber-400/12",
      text: "text-amber-300",
    },
    subscription: {
      label: "Subscribe",
      dot: "bg-amber-400",
      bg: "bg-amber-400/12",
      text: "text-amber-300",
    },
    ready: {
      label: "Connected",
      dot: "bg-emerald-400",
      bg: "bg-emerald-400/12",
      text: "text-emerald-300",
    },
  };
  const s = map[state.kind];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
        s.bg,
        s.text,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

function ApiKeyRow({ providerId }: { providerId: ProviderId }) {
  const setCredential = useProvidersStore((s) => s.setCredential);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const onSave = async () => {
    if (value.trim().length === 0) return;
    setBusy(true);
    setStatus(null);
    try {
      await setCredential(providerId, value.trim());
      setValue("");
      setStatus("Saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type={reveal ? "text" : "password"}
            placeholder="paste API key"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            className="h-9 rounded-xl border-0 bg-white/[0.04]"
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label={reveal ? "Hide key" : "Reveal key"}
            tabIndex={-1}
          >
            {reveal ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </button>
        </div>
        <Button
          size="sm"
          onClick={() => void onSave()}
          disabled={busy || value.trim().length === 0}
          className="rounded-full px-4"
        >
          Save
        </Button>
      </div>
      {status !== null && (
        <p className="text-[11px] text-muted-foreground">{status}</p>
      )}
    </div>
  );
}
