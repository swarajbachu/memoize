import { create } from "zustand";

import {
  defaultModelFor,
  type ProviderId,
  type RuntimeMode,
} from "@memoize/wire";

const STORAGE_KEY = "memoize.settings.v1";

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
  /**
   * Global preference for "create a fresh worktree on new chat." Per-repo
   * `autoCreateWorktree` overrides this; the Repositories pane in Settings
   * seeds new repos from this value.
   */
  readonly defaultAutoCreateWorktree: boolean;
  readonly onboardingCompleted: boolean;
};

const isProviderId = (v: unknown): v is ProviderId =>
  v === "claude" || v === "codex";

const isRuntimeMode = (v: unknown): v is RuntimeMode =>
  v === "approval-required" || v === "auto-accept-edits" || v === "full-access";

const freshDefaults = (): Persisted => ({
  defaultProviderId: DEFAULT_PROVIDER,
  defaultModelByProvider: seedModels(),
  defaultRuntimeMode: DEFAULT_RUNTIME_MODE,
  defaultAutoCreateWorktree: false,
  onboardingCompleted: false,
});

const loadPersisted = (): Persisted => {
  if (typeof window === "undefined") return freshDefaults();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // Genuine first launch — no blob at all.
    if (raw === null) return freshDefaults();
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
      defaultAutoCreateWorktree:
        typeof parsed.defaultAutoCreateWorktree === "boolean"
          ? parsed.defaultAutoCreateWorktree
          : false,
      // Existing users — blob present but pre-dating the onboarding flag —
      // skip the wizard. Only a missing blob (handled above) is treated as
      // first launch.
      onboardingCompleted:
        typeof parsed.onboardingCompleted === "boolean"
          ? parsed.onboardingCompleted
          : true,
    };
  } catch {
    return freshDefaults();
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

const snapshot = (s: Persisted): Persisted => ({
  defaultProviderId: s.defaultProviderId,
  defaultModelByProvider: s.defaultModelByProvider,
  defaultRuntimeMode: s.defaultRuntimeMode,
  defaultAutoCreateWorktree: s.defaultAutoCreateWorktree,
  onboardingCompleted: s.onboardingCompleted,
});

type SettingsState = Persisted & {
  readonly setDefaultProvider: (providerId: ProviderId) => void;
  readonly setDefaultModel: (providerId: ProviderId, model: string) => void;
  readonly setDefaultRuntimeMode: (mode: RuntimeMode) => void;
  readonly setDefaultAutoCreateWorktree: (value: boolean) => void;
  readonly setOnboardingCompleted: (value: boolean) => void;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadPersisted(),
  setDefaultProvider: (providerId) => {
    set({ defaultProviderId: providerId });
    persist(snapshot(get()));
  },
  setDefaultModel: (providerId, model) => {
    set((s) => ({
      defaultModelByProvider: { ...s.defaultModelByProvider, [providerId]: model },
    }));
    persist(snapshot(get()));
  },
  setDefaultRuntimeMode: (mode) => {
    set({ defaultRuntimeMode: mode });
    persist(snapshot(get()));
  },
  setDefaultAutoCreateWorktree: (value) => {
    set({ defaultAutoCreateWorktree: value });
    persist(snapshot(get()));
  },
  setOnboardingCompleted: (value) => {
    set({ onboardingCompleted: value });
    persist(snapshot(get()));
  },
}));
