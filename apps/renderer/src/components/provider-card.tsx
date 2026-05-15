import { ChevronDown, Copy, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

import {
  MODELS_BY_PROVIDER,
  type AgentAvailability,
  type ProviderId,
} from "@memoize/wire";

import { ApiKeyRow } from "~/components/api-key-row";
import { ProviderIcon } from "~/components/provider-icons";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import {
  formatVersionLabel,
  getProviderSummary,
  PROVIDER_STATUS_STYLES,
} from "~/lib/provider-status";
import { cn } from "~/lib/utils";
import { useSettingsStore } from "~/store/settings";

const PROVIDER_LABEL: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  grok: "Grok",
  gemini: "Gemini",
};

const INSTALL_HINT: Record<ProviderId, string> = {
  claude: "npm i -g @anthropic-ai/claude-code",
  codex: "npm i -g @openai/codex",
  grok: "curl -fsSL https://x.ai/cli/install.sh | bash",
  gemini: "npm i -g @google/gemini-cli",
};

const LOGIN_HINT: Record<ProviderId, string> = {
  claude: "claude /login",
  codex: "codex login",
  grok: "grok",
  gemini: "gemini /auth",
};

/**
 * Provider-specific subscription pages. When a provider gates session
 * driving behind a paid plan (Grok → SuperGrok Heavy), the card renders
 * an inline notice + this button so the user lands on the upgrade flow
 * before they hit a session-runtime 403.
 */
const SUBSCRIPTION_INFO: Partial<
  Record<ProviderId, { readonly plan: string; readonly url: string }>
> = {
  grok: { plan: "SuperGrok Heavy", url: "https://grok.com/#subscribe" },
};

export function ProviderCard({
  providerId,
  availability,
  loading,
}: {
  providerId: ProviderId;
  availability: AgentAvailability | undefined;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const subscription = SUBSCRIPTION_INFO[providerId];
  const persistedEnabled =
    useSettingsStore((s) => s.providerEnabled[providerId]) ?? true;
  // Subscription-gated providers (Grok → SuperGrok Heavy) can never be
  // "enabled" until the user confirms the upgrade — until we have a way
  // to actually verify the plan from the CLI, we force the toggle off so
  // sessions can't be launched into a doomed 403. The visible state lies
  // to the user with intent: the underlying persisted value is whatever
  // they set, but the rendering + composer filter treat it as off.
  const enabled = subscription !== undefined ? false : persistedEnabled;
  const setProviderEnabled = useSettingsStore((s) => s.setProviderEnabled);
  const baseSummary = useMemo(
    () => getProviderSummary(availability, enabled, loading),
    [availability, enabled, loading],
  );
  // Promote the card to the violet "subscription" status when this provider
  // is plan-gated, regardless of whether the CLI itself reports
  // authenticated. The headline reads "Subscription required" so the dot
  // color isn't doing all the work.
  const summary =
    subscription !== undefined
      ? {
          ...baseSummary,
          statusKey: "subscription" as const,
          headline: `Requires ${subscription.plan}`,
          detail: null,
          authEmail: null,
        }
      : baseSummary;
  const styles = PROVIDER_STATUS_STYLES[summary.statusKey];
  const versionLabel = formatVersionLabel(availability?.cliVersion);
  const showUpgrade =
    enabled && availability?.cliVersionStatus === "outdated";

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border/50 bg-card transition-colors",
        !enabled && subscription === undefined && "opacity-70",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex size-7 shrink-0 items-center justify-center">
          <ProviderIcon providerId={providerId} className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span
              className={cn("size-1.5 shrink-0 rounded-full", styles.dot)}
              aria-hidden
            />
            <span className="truncate text-sm font-medium text-foreground">
              {PROVIDER_LABEL[providerId]}
            </span>
            {versionLabel !== null && (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {versionLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className="truncate">{summary.headline}</span>
            {summary.authEmail !== null && (
              <BlurredEmail email={summary.authEmail} />
            )}
            {summary.detail !== null && (
              <span className="truncate">· {summary.detail}</span>
            )}
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={subscription !== undefined}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(value) => {
            if (subscription !== undefined) return;
            setProviderEnabled(providerId, value);
          }}
          aria-label={
            subscription !== undefined
              ? `${PROVIDER_LABEL[providerId]} requires a ${subscription.plan} subscription`
              : `Enable ${PROVIDER_LABEL[providerId]}`
          }
          title={
            subscription !== undefined
              ? `Requires ${subscription.plan} subscription`
              : undefined
          }
        />
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {expanded && (
        <div
          className={cn(
            "flex flex-col gap-4 border-t border-border/40 px-3.5 py-3 text-xs",
            !enabled && "pointer-events-none",
          )}
        >
          {showUpgrade && (
            <CodeRow
              label="Update CLI"
              command={
                availability?.cliUpgradeCommand ?? INSTALL_HINT[providerId]
              }
            />
          )}
          {availability !== undefined && !availability.cliInstalled && (
            <CodeRow label="Install" command={INSTALL_HINT[providerId]} />
          )}
          {availability?.cliInstalled &&
            availability.authStatus === "unauthenticated" && (
              <CodeRow label="Sign in" command={LOGIN_HINT[providerId]} />
            )}
          <SubscriptionRow providerId={providerId} />

          <ModelDefault providerId={providerId} />

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              API key (optional)
            </span>
            <ApiKeyRow providerId={providerId} />
          </div>
        </div>
      )}
    </div>
  );
}

function ModelDefault({ providerId }: { providerId: ProviderId }) {
  const value = useSettingsStore(
    (s) => s.defaultModelByProvider[providerId] ?? "",
  );
  const setDefaultModel = useSettingsStore((s) => s.setDefaultModel);
  const models = MODELS_BY_PROVIDER[providerId] ?? [];
  const items = useMemo(
    () => models.map((m) => ({ value: m.id, label: m.label })),
    [models],
  );
  if (models.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">
        Default model
      </span>
      <Select
        value={value}
        onValueChange={(next) => setDefaultModel(providerId, next as string)}
        items={items}
      >
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}

/**
 * Subscription-gate notice for providers that need a paid plan beyond the
 * CLI's local OAuth (Grok → SuperGrok Heavy). The card shows this whenever
 * `SUBSCRIPTION_INFO[providerId]` is set; clicking the button opens the
 * provider's subscribe page in the user's default browser.
 */
/**
 * Open a URL in the user's OS browser via the preload bridge (Electron's
 * `shell.openExternal`). Falls back to `window.open` for web/dev contexts.
 * We intentionally avoid an in-app webview here: a paid-checkout flow
 * needs the user's real browser session, password manager, and cookies.
 */
const openExternal = (url: string) => {
  const bridge = window.memoize?.app;
  if (bridge !== undefined) {
    bridge.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
};

function SubscriptionRow({ providerId }: { providerId: ProviderId }) {
  const info = SUBSCRIPTION_INFO[providerId];
  if (info === undefined) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-violet-400/25 bg-violet-500/[0.06] px-3 py-2.5">
      <span className="text-[11px] font-medium text-violet-300">
        Requires {info.plan} subscription
      </span>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Sessions will fail if your plan doesn&apos;t include {info.plan}.
        Subscribe (or confirm your existing plan) before using {PROVIDER_LABEL[providerId]}.
      </p>
      <div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openExternal(info.url);
          }}
          className="inline-flex items-center gap-1 rounded border border-violet-400/40 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-100 transition-colors hover:bg-violet-500/20"
        >
          Subscribe
          <ExternalLink className="size-3" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * Privacy-aware email pill. Blurs the address by default (so screen-records
 * and screenshots don't leak it) and reveals on click; clicking again
 * re-blurs. Stops propagation so clicking it doesn't also collapse/expand
 * the parent card.
 */
function BlurredEmail({ email }: { email: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setRevealed((r) => !r);
      }}
      title={revealed ? "Click to hide" : "Click to reveal"}
      aria-label={revealed ? "Hide email" : "Reveal email"}
      className={cn(
        "max-w-[16rem] truncate rounded px-1 py-0.5 text-left font-mono text-[11px] transition-[filter,background-color] duration-150",
        revealed
          ? "bg-muted/40 text-foreground"
          : "bg-muted/40 text-foreground blur-[5px] select-none hover:blur-[3px]",
      )}
    >
      {email}
    </button>
  );
}

function CodeRow({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/40 px-2.5 py-1.5 font-mono text-[11px]">
        <code className="flex-1 truncate text-foreground">$ {command}</code>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={onCopy}
          className="h-6 shrink-0 px-2 text-[10px]"
        >
          <Copy className="mr-1 size-3" aria-hidden />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
