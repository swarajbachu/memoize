import { create } from "zustand";

import {
  defaultModelFor,
  resolveModelSlug,
  type ProviderId,
  type RuntimeMode,
} from "@memoize/wire";

const STORAGE_KEY = "memoize.settings.v1";

const DEFAULT_PROVIDER: ProviderId = "claude";
const DEFAULT_RUNTIME_MODE: RuntimeMode = "approval-required";

const seedModels = (): Record<ProviderId, string> => ({
  claude: defaultModelFor("claude"),
  codex: defaultModelFor("codex"),
  grok: defaultModelFor("grok"),
  gemini: defaultModelFor("gemini"),
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
  /**
   * Per-provider on/off toggle from the Providers settings card. Defaults to
   * `true` for every provider; flipping it to `false` filters the provider
   * from the new-session picker without uninstalling its CLI.
   */
  readonly providerEnabled: Record<ProviderId, boolean>;
};

const isProviderId = (v: unknown): v is ProviderId =>
  v === "claude" || v === "codex" || v === "grok" || v === "gemini";

const isRuntimeMode = (v: unknown): v is RuntimeMode =>
  v === "approval-required" || v === "auto-accept-edits" || v === "full-access";

const seedEnabled = (): Record<ProviderId, boolean> => ({
  claude: true,
  codex: true,
  grok: true,
  gemini: true,
});

const freshDefaults = (): Persisted => ({
  defaultProviderId: DEFAULT_PROVIDER,
  defaultModelByProvider: seedModels(),
  defaultRuntimeMode: DEFAULT_RUNTIME_MODE,
  defaultAutoCreateWorktree: false,
  onboardingCompleted: false,
  providerEnabled: seedEnabled(),
});

const loadPersisted = (): Persisted => {
  if (typeof window === "undefined") return freshDefaults();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // Genuine first launch — no blob at all.
    if (raw === null) return freshDefaults();
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const seeded = seedModels();
    // Rewrite dead slugs (e.g. `gpt-5-codex` from older builds) through
    // `resolveModelSlug` so a stale localStorage doesn't keep sending a
    // model the current Codex CLI rejects.
    const models: Record<ProviderId, string> = {
      claude: resolveModelSlug(
        "claude",
        typeof parsed.defaultModelByProvider?.claude === "string"
          ? parsed.defaultModelByProvider.claude
          : seeded.claude,
      ),
      codex: resolveModelSlug(
        "codex",
        typeof parsed.defaultModelByProvider?.codex === "string"
          ? parsed.defaultModelByProvider.codex
          : seeded.codex,
      ),
      grok: resolveModelSlug(
        "grok",
        typeof parsed.defaultModelByProvider?.grok === "string"
          ? parsed.defaultModelByProvider.grok
          : seeded.grok,
      ),
      gemini: resolveModelSlug(
        "gemini",
        typeof parsed.defaultModelByProvider?.gemini === "string"
          ? parsed.defaultModelByProvider.gemini
          : seeded.gemini,
      ),
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
      providerEnabled: {
        claude:
          typeof parsed.providerEnabled?.claude === "boolean"
            ? parsed.providerEnabled.claude
            : true,
        codex:
          typeof parsed.providerEnabled?.codex === "boolean"
            ? parsed.providerEnabled.codex
            : true,
        grok:
          typeof parsed.providerEnabled?.grok === "boolean"
            ? parsed.providerEnabled.grok
            : true,
        gemini:
          typeof parsed.providerEnabled?.gemini === "boolean"
            ? parsed.providerEnabled.gemini
            : true,
      },
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
  providerEnabled: s.providerEnabled,
});

type SettingsState = Persisted & {
  readonly setDefaultProvider: (providerId: ProviderId) => void;
  readonly setDefaultModel: (providerId: ProviderId, model: string) => void;
  readonly setDefaultRuntimeMode: (mode: RuntimeMode) => void;
  readonly setDefaultAutoCreateWorktree: (value: boolean) => void;
  readonly setOnboardingCompleted: (value: boolean) => void;
  readonly setProviderEnabled: (providerId: ProviderId, value: boolean) => void;
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
  setProviderEnabled: (providerId, value) => {
    set((s) => ({
      providerEnabled: { ...s.providerEnabled, [providerId]: value },
    }));
    persist(snapshot(get()));
  },
}));
