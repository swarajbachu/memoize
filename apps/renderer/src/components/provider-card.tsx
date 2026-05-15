import { ChevronDown, Copy } from "lucide-react";
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
  const enabled =
    useSettingsStore((s) => s.providerEnabled[providerId]) ?? true;
  const setProviderEnabled = useSettingsStore((s) => s.setProviderEnabled);
  const summary = useMemo(
    () => getProviderSummary(availability, enabled, loading),
    [availability, enabled, loading],
  );
  const styles = PROVIDER_STATUS_STYLES[summary.statusKey];
  const versionLabel = formatVersionLabel(availability?.cliVersion);
  const showUpgrade =
    enabled && availability?.cliVersionStatus === "outdated";

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border/50 bg-card transition-colors",
        !enabled && "opacity-70",
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
          <div className="flex items-center gap-2 truncate text-xs text-muted-foreground">
            <span className="truncate">{summary.headline}</span>
            {summary.detail !== null && (
              <span className="truncate">· {summary.detail}</span>
            )}
          </div>
        </div>
        <Switch
          checked={enabled}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(value) => setProviderEnabled(providerId, value)}
          aria-label={`Enable ${PROVIDER_LABEL[providerId]}`}
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
