import { Check, X } from "lucide-react";

import {
  MODELS_BY_PROVIDER,
  type ProviderId,
  type RuntimeMode,
} from "@forkzero/wire";

import { cn } from "~/lib/utils";
import { useSettingsStore } from "../store/settings.ts";
import { useUiStore } from "../store/ui.ts";
import { ProviderIcon } from "./provider-icons.tsx";
import { MODES_ORDER, MODE_META } from "./runtime-mode-meta.ts";

const PROVIDER_LABEL: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

/**
 * Full-page settings surface that takes over the main pane while open.
 * Defaults persisted here are applied to every new session created from
 * the sidebar's `New chat` button — the popover only re-appears when the
 * user's chosen provider isn't logged in.
 */
export function SettingsPage() {
  const setView = useUiStore((s) => s.setView);
  const defaultProviderId = useSettingsStore((s) => s.defaultProviderId);
  const defaultModelByProvider = useSettingsStore(
    (s) => s.defaultModelByProvider,
  );
  const defaultRuntimeMode = useSettingsStore((s) => s.defaultRuntimeMode);
  const setDefaultProvider = useSettingsStore((s) => s.setDefaultProvider);
  const setDefaultModel = useSettingsStore((s) => s.setDefaultModel);
  const setDefaultRuntimeMode = useSettingsStore(
    (s) => s.setDefaultRuntimeMode,
  );

  const providers: ReadonlyArray<ProviderId> = ["claude", "codex"];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
      <header className="flex h-9 shrink-0 items-center justify-between px-3 text-xs text-muted-foreground [-webkit-app-region:drag]">
        <span className="ml-16 select-none">Settings</span>
        <button
          type="button"
          onClick={() => setView("chat")}
          aria-label="Close settings"
          className="rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground [-webkit-app-region:no-drag]"
        >
          <X className="size-3.5" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
          <Section
            title="Default agent"
            description="New chats start with this provider and model. You can still change them per session from the composer."
          >
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2">
                {providers.map((pid) => {
                  const active = pid === defaultProviderId;
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => setDefaultProvider(pid)}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                        active
                          ? "border-foreground/40 bg-accent/40"
                          : "border-border/60 hover:bg-muted/40",
                      )}
                    >
                      <ProviderIcon providerId={pid} className="size-4" />
                      <span className="flex-1 text-left">
                        {PROVIDER_LABEL[pid]}
                      </span>
                      {active && <Check className="size-3.5 opacity-80" />}
                    </button>
                  );
                })}
              </div>
              <ModelSelect
                providerId={defaultProviderId}
                value={defaultModelByProvider[defaultProviderId]}
                onChange={(model) => setDefaultModel(defaultProviderId, model)}
              />
            </div>
          </Section>

          <Section
            title="Default permission mode"
            description="How the agent handles tool calls in new sessions. Each session can override this from its composer."
          >
            <div className="flex flex-col gap-2">
              {MODES_ORDER.map((mode) => {
                const m = MODE_META[mode];
                const ItemIcon = m.Icon;
                const active = mode === defaultRuntimeMode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDefaultRuntimeMode(mode)}
                    className={cn(
                      "grid grid-cols-[1.25rem_1.25rem_1fr_1rem] items-start gap-x-3 rounded-md border px-3 py-3 text-left transition-colors",
                      active
                        ? "border-foreground/40 bg-accent/40"
                        : "border-border/60 hover:bg-muted/40",
                    )}
                  >
                    <ItemIcon className="col-start-2 row-start-1 mt-0.5 size-4 shrink-0" />
                    <div className="col-start-3 row-start-1 flex flex-col gap-1">
                      <span className="text-sm font-medium leading-none">
                        {m.label}
                      </span>
                      <span className="text-xs text-muted-foreground leading-snug">
                        {m.description}
                      </span>
                    </div>
                    {active && (
                      <Check className="col-start-4 row-start-1 mt-0.5 size-3.5 opacity-80" />
                    )}
                  </button>
                );
              })}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ModelSelect({
  providerId,
  value,
  onChange,
}: {
  providerId: ProviderId;
  value: string;
  onChange: (model: string) => void;
}) {
  const models = MODELS_BY_PROVIDER[providerId] ?? [];
  // Avoid leaving the saved default pointing at a removed model.
  const normalizedValue =
    models.some((m) => m.id === value) || models.length === 0
      ? value
      : models[0]!.id;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Default model</span>
      <select
        value={normalizedValue}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ensureValidDefaultsForRuntime(
  ready: ReadonlyArray<ProviderId>,
): { providerId: ProviderId; model: string; runtimeMode: RuntimeMode } | null {
  const settings = useSettingsStore.getState();
  if (ready.length === 0) return null;
  const provider = ready.includes(settings.defaultProviderId)
    ? settings.defaultProviderId
    : ready[0]!;
  const model =
    settings.defaultModelByProvider[provider] ??
    MODELS_BY_PROVIDER[provider][0]!.id;
  return { providerId: provider, model, runtimeMode: settings.defaultRuntimeMode };
}
