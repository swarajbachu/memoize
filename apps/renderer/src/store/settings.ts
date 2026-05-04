import { create } from "zustand";

import {
  defaultModelFor,
  type ProviderId,
  type RuntimeMode,
} from "@forkzero/wire";

const STORAGE_KEY = "forkzero.settings.v1";

const DEFAULT_PROVIDER: ProviderId = "claude";
const DEFAULT_RUNTIME_MODE: RuntimeMode = "approval-required";

const seedModels = (): Record<ProviderId, string> => ({
  claude: defaultModelFor("claude"),
  codex: defaultModelFor("codex"),
});

type Persisted = {
  readonly defaultProviderId: ProviderId;
  readonly defaultModelByProvider: Record<ProviderId, string>;
  readonly defaultRuntimeMode: RuntimeMode;
};

const isProviderId = (v: unknown): v is ProviderId =>
  v === "claude" || v === "codex";

const isRuntimeMode = (v: unknown): v is RuntimeMode =>
  v === "approval-required" || v === "auto-accept-edits" || v === "full-access";

const loadPersisted = (): Persisted => {
  if (typeof window === "undefined") {
    return {
      defaultProviderId: DEFAULT_PROVIDER,
      defaultModelByProvider: seedModels(),
      defaultRuntimeMode: DEFAULT_RUNTIME_MODE,
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return {
        defaultProviderId: DEFAULT_PROVIDER,
        defaultModelByProvider: seedModels(),
        defaultRuntimeMode: DEFAULT_RUNTIME_MODE,
      };
    }
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const seeded = seedModels();
    const models: Record<ProviderId, string> = {
      claude:
        typeof parsed.defaultModelByProvider?.claude === "string"
          ? parsed.defaultModelByProvider.claude
          : seeded.claude,
      codex:
        typeof parsed.defaultModelByProvider?.codex === "string"
          ? parsed.defaultModelByProvider.codex
          : seeded.codex,
    };
    return {
      defaultProviderId: isProviderId(parsed.defaultProviderId)
        ? parsed.defaultProviderId
        : DEFAULT_PROVIDER,
      defaultModelByProvider: models,
      defaultRuntimeMode: isRuntimeMode(parsed.defaultRuntimeMode)
        ? parsed.defaultRuntimeMode
        : DEFAULT_RUNTIME_MODE,
    };
  } catch {
    return {
      defaultProviderId: DEFAULT_PROVIDER,
      defaultModelByProvider: seedModels(),
      defaultRuntimeMode: DEFAULT_RUNTIME_MODE,
    };
  }
};

const persist = (state: Persisted) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota / private-mode failures are non-fatal — settings stay in memory.
  }
};

type SettingsState = Persisted & {
  readonly setDefaultProvider: (providerId: ProviderId) => void;
  readonly setDefaultModel: (providerId: ProviderId, model: string) => void;
  readonly setDefaultRuntimeMode: (mode: RuntimeMode) => void;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadPersisted(),
  setDefaultProvider: (providerId) => {
    set({ defaultProviderId: providerId });
    const s = get();
    persist({
      defaultProviderId: s.defaultProviderId,
      defaultModelByProvider: s.defaultModelByProvider,
      defaultRuntimeMode: s.defaultRuntimeMode,
    });
  },
  setDefaultModel: (providerId, model) => {
    set((s) => ({
      defaultModelByProvider: { ...s.defaultModelByProvider, [providerId]: model },
    }));
    const s = get();
    persist({
      defaultProviderId: s.defaultProviderId,
      defaultModelByProvider: s.defaultModelByProvider,
      defaultRuntimeMode: s.defaultRuntimeMode,
    });
  },
  setDefaultRuntimeMode: (mode) => {
    set({ defaultRuntimeMode: mode });
    const s = get();
    persist({
      defaultProviderId: s.defaultProviderId,
      defaultModelByProvider: s.defaultModelByProvider,
      defaultRuntimeMode: s.defaultRuntimeMode,
    });
  },
}));
