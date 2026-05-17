import { Check, ChevronDown } from "lucide-react";
import { Fragment, useEffect, useMemo } from "react";

import type {
  AgentAvailability,
  ProviderId,
  SessionId,
} from "@memoize/wire";
import {
  MODELS_BY_PROVIDER,
  type Message,
} from "@memoize/wire";

import { cn } from "~/lib/utils";
import { useMessagesStore } from "~/store/messages";
import { useOpencodeInventory } from "~/store/opencode-inventory";
import { useProvidersStore } from "~/store/providers";
import { useSessionsStore } from "~/store/sessions";
import { useSettingsStore } from "~/store/settings";
import { ProviderIcon } from "./provider-icons";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";

const PROVIDER_LABEL: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  grok: "Grok",
  cursor: "Cursor",
  gemini: "Gemini",
  opencode: "OpenCode",
};

type ModelPickerProps =
  | {
      mode: "session";
      sessionId: SessionId;
      providerId: ProviderId;
      currentModel: string;
    }
  | {
      mode: "default";
    };

/**
 * Reusable model/provider picker used both in the per-session ChatComposer
 * footer (mode: "session") and in the empty-state ChatLanding footer
 * (mode: "default").
 *
 * In "default" mode it reads/writes the global defaults via useSettingsStore
 * (persisted) and treats the choice as always "fresh" (cross-provider
 * switches are allowed because a new chat will be created).
 */
export function ModelPicker(props: ModelPickerProps) {
  const isDefault = props.mode === "default";

  // Live values
  const defaultProviderId = useSettingsStore((s) => s.defaultProviderId);
  const defaultModelByProvider = useSettingsStore(
    (s) => s.defaultModelByProvider,
  );
  const providerEnabled = useSettingsStore((s) => s.providerEnabled);

  const providerId = isDefault ? defaultProviderId : props.providerId;
  const currentModel = isDefault
    ? defaultModelByProvider[providerId]
    : props.currentModel;

  // Setters (branch by mode)
  const setSessionModel = useSessionsStore((s) => s.setModel);
  const setSessionProvider = useSessionsStore((s) => s.setProvider);
  const setDefaultProvider = useSettingsStore((s) => s.setDefaultProvider);
  const setDefaultModel = useSettingsStore((s) => s.setDefaultModel);

  const availability = useProvidersStore((s) => s.availability);
  const opencodeInventory = useOpencodeInventory((s) => s.inventory);
  const ensureOpencodeInventory = useOpencodeInventory(
    (s) => s.ensureLoaded,
  );

  // Only relevant for session mode
  const userMessageCount = useMessagesStore((s) => {
    if (isDefault) return 0;
    const list = s.messagesBySession[(props as any).sessionId] ?? [];
    let count = 0;
    for (const m of list) {
      if ((m as Message).role === "user") count += 1;
    }
    return count;
  });
  const isFresh = isDefault ? true : userMessageCount === 0;

  // Lazy-load opencode inventory (harmless for default mode too)
  useEffect(() => {
    void ensureOpencodeInventory();
  }, [ensureOpencodeInventory]);

  const modelsForProvider = (pid: ProviderId) => {
    if (pid !== "opencode" || opencodeInventory === null) {
      return MODELS_BY_PROVIDER[pid] ?? [];
    }
    return opencodeInventory.providers.flatMap((p) =>
      p.models.map((m) => ({ id: m.id, label: m.label })),
    );
  };

  const availabilityById = useMemo(() => {
    const m = new globalThis.Map<ProviderId, AgentAvailability>();
    for (const a of availability) m.set(a.providerId, a);
    return m;
  }, [availability]);

  const pickableProviders = useMemo(() => {
    return (Object.keys(MODELS_BY_PROVIDER) as ReadonlyArray<ProviderId>).filter(
      (pid) => {
        if (pid === providerId) return true;
        if (pid === "cursor") return false;
        if (providerEnabled[pid] === false) return false;
        const a = availabilityById.get(pid);
        if (a !== undefined && a.status === "error") return false;
        return true;
      },
    );
  }, [providerId, providerEnabled, availabilityById]);

  const models = modelsForProvider(providerId);
  const current = models.find((m) => m.id === currentModel);
  const label = current?.label ?? currentModel;

  const handleChoose = (pid: ProviderId, modelId: string) => {
    const crossProvider = pid !== providerId;
    if (crossProvider && !isFresh) return; // only for non-fresh sessions

    if (isDefault) {
      setDefaultProvider(pid);
      setDefaultModel(pid, modelId);
    } else {
      const sid = (props as any).sessionId as SessionId;
      if (crossProvider) {
        void setSessionProvider(sid, pid, modelId);
      } else if (modelId !== currentModel) {
        void setSessionModel(sid, modelId);
      }
    }
  };

  const triggerTitle = isDefault
    ? "Change default model for new chats"
    : "Change model — applies to next message";

  return (
    <Menu>
      <MenuTrigger
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-foreground hover:bg-muted/60 data-[popup-open]:bg-muted/60"
        aria-label="Change model"
        title={triggerTitle}
      >
        <ProviderIcon providerId={providerId} className="size-3" />
        <span>{label}</span>
        <ChevronDown className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup side="top" align="start" className="w-72">
        {pickableProviders.map((pid, i) => (
          <Fragment key={pid}>
            {i > 0 && <MenuSeparator />}
            <MenuGroup>
              <MenuGroupLabel>{PROVIDER_LABEL[pid]}</MenuGroupLabel>
              {modelsForProvider(pid).map((m) => {
                const active = pid === providerId && m.id === currentModel;
                const crossProvider = pid !== providerId;
                const disabled = crossProvider && !isFresh;
                return (
                  <MenuItem
                    key={m.id}
                    onClick={() => handleChoose(pid, m.id)}
                    disabled={disabled}
                    title={
                      disabled
                        ? "Start a new chat to switch provider"
                        : undefined
                    }
                    className={cn(
                      "flex items-center gap-2",
                      active
                        ? "bg-accent/60 text-accent-foreground data-highlighted:bg-accent"
                        : undefined,
                    )}
                  >
                    <ProviderIcon providerId={pid} className="size-3.5" />
                    <span className="flex-1 truncate">{m.label}</span>
                    {active && <Check className="size-3.5 opacity-90" />}
                  </MenuItem>
                );
              })}
            </MenuGroup>
          </Fragment>
        ))}
      </MenuPopup>
    </Menu>
  );
}
