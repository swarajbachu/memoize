import { Effect, Fiber, Stream } from "effect";
import { create } from "zustand";

import {
  defaultModelFor,
  type ProviderId,
  resolveModelSlug,
  type RuntimeMode,
  type SettingsFile,
} from "@memoize/wire";

import { getRpcClient } from "../lib/rpc-client";

/**
 * Renderer view of `settings.json`. Lives in the main process — this store
 * is just a hot mirror kept in sync via `settings.stream`. Setters POST
 * patches via `settings.update`; the resulting echo through the stream
 * updates the store, so we don't optimistically write twice.
 *
 * Two pre-existing localStorage keys (`memoize.settings.v1` and
 * `memoize.subagents`) are migrated to disk on first launch via
 * `settings.migrateLocalStorage` and then cleared.
 */

const DEFAULT_PROVIDER: ProviderId = "claude";
const DEFAULT_RUNTIME_MODE: RuntimeMode = "approval-required";

const PROVIDER_IDS: ReadonlyArray<ProviderId> = [
  "claude",
  "codex",
  "grok",
  "cursor",
  "gemini",
  "opencode",
];

const seedModels = (): Record<ProviderId, string> => ({
  claude: defaultModelFor("claude"),
  codex: defaultModelFor("codex"),
  grok: defaultModelFor("grok"),
  cursor: defaultModelFor("cursor"),
  gemini: defaultModelFor("gemini"),
  opencode: defaultModelFor("opencode"),
});

const seedProviderEnabled = (): Record<ProviderId, boolean> => {
  const out = {} as Record<ProviderId, boolean>;
  for (const id of PROVIDER_IDS) out[id] = true;
  return out;
};

const OLD_SETTINGS_KEY = "memoize.settings.v1";
const OLD_SUBAGENTS_KEY = "memoize.subagents";

const fallbackSnapshot = (): SettingsSlice => ({
  defaultProviderId: DEFAULT_PROVIDER,
  defaultModelByProvider: seedModels(),
  defaultRuntimeMode: DEFAULT_RUNTIME_MODE,
  defaultAutoCreateWorktree: false,
  onboardingCompleted: false,
  providerEnabled: seedProviderEnabled(),
});

const sliceFromFile = (file: SettingsFile): SettingsSlice => {
  const models: Record<ProviderId, string> = {
    ...seedModels(),
    ...file.defaultModelByProvider,
  };
  // Re-run resolveModelSlug on every emit so a stale alias doesn't sneak
  // back through a follow-up edit to the JSON file.
  for (const id of Object.keys(models) as ProviderId[]) {
    models[id] = resolveModelSlug(id, models[id]);
  }
  return {
    defaultProviderId: file.defaultProviderId,
    defaultModelByProvider: models,
    defaultRuntimeMode: file.defaultRuntimeMode,
    defaultAutoCreateWorktree: file.defaultAutoCreateWorktree,
    onboardingCompleted: file.onboardingCompleted,
    providerEnabled: {
      ...seedProviderEnabled(),
      ...file.providerEnabled,
    },
  };
};

interface SettingsSlice {
  readonly defaultProviderId: ProviderId;
  readonly defaultModelByProvider: Record<ProviderId, string>;
  readonly defaultRuntimeMode: RuntimeMode;
  readonly defaultAutoCreateWorktree: boolean;
  readonly onboardingCompleted: boolean;
  readonly providerEnabled: Record<ProviderId, boolean>;
}

type SettingsState = SettingsSlice & {
  /** True once the first RPC fetch has resolved. Used by gates that need
   *  to wait before reading defaults (e.g. onboarding). */
  readonly loaded: boolean;
  readonly hydrate: () => Promise<void>;
  readonly setDefaultProvider: (providerId: ProviderId) => void;
  readonly setDefaultModel: (providerId: ProviderId, model: string) => void;
  readonly setDefaultRuntimeMode: (mode: RuntimeMode) => void;
  readonly setDefaultAutoCreateWorktree: (value: boolean) => void;
  readonly setOnboardingCompleted: (value: boolean) => void;
  readonly setProviderEnabled: (providerId: ProviderId, value: boolean) => void;
};

let streamFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;

const stopStream = async () => {
  if (streamFiber !== null) {
    const f = streamFiber;
    streamFiber = null;
    await Effect.runPromise(Fiber.interrupt(f));
  }
};

/**
 * One-shot localStorage migration. Reads the two pre-feature keys and
 * forwards them to the main process; the main process merges them onto
 * the on-disk settings only if the file still looks fresh, so a second
 * call (e.g. from a hot-reloaded renderer) is a no-op. Always clear
 * localStorage afterwards so the renderer doesn't carry stale data.
 */
const migrateLocalStorageOnce = async (): Promise<SettingsFile | null> => {
  if (typeof window === "undefined") return null;
  const settingsV1Raw = window.localStorage.getItem(OLD_SETTINGS_KEY);
  const subagentsRaw = window.localStorage.getItem(OLD_SUBAGENTS_KEY);
  if (settingsV1Raw === null && subagentsRaw === null) return null;
  try {
    const client = await getRpcClient();
    const file = await Effect.runPromise(
      client.settings.migrateLocalStorage({
        settingsV1Raw: settingsV1Raw ?? undefined,
        subagentsRaw: subagentsRaw ?? undefined,
      }),
    );
    window.localStorage.removeItem(OLD_SETTINGS_KEY);
    window.localStorage.removeItem(OLD_SUBAGENTS_KEY);
    return file;
  } catch {
    // If the RPC fails (rare — main is up by now), leave localStorage in
    // place so the next reload can retry. The store falls back to defaults.
    return null;
  }
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...fallbackSnapshot(),
  loaded: false,

  hydrate: async () => {
    // Drain any pre-existing localStorage first so a successful migration
    // is visible on the very first `settings.get` we do below.
    await migrateLocalStorageOnce();

    try {
      const client = await getRpcClient();
      const file = await Effect.runPromise(client.settings.get());
      set({ ...sliceFromFile(file), loaded: true });

      await stopStream();
      streamFiber = Effect.runFork(
        Stream.runForEach(client.settings.stream(), (next) =>
          Effect.sync(() => set(sliceFromFile(next))),
        ),
      );
    } catch {
      set({ loaded: true });
    }
  },

  setDefaultProvider: (providerId) => {
    set({ defaultProviderId: providerId });
    void (async () => {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.settings.update({ patch: { defaultProviderId: providerId } }),
      );
    })();
  },
  setDefaultModel: (providerId, model) => {
    const next = { ...get().defaultModelByProvider, [providerId]: model };
    set({ defaultModelByProvider: next });
    void (async () => {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.settings.update({ patch: { defaultModelByProvider: next } }),
      );
    })();
  },
  setDefaultRuntimeMode: (mode) => {
    set({ defaultRuntimeMode: mode });
    void (async () => {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.settings.update({ patch: { defaultRuntimeMode: mode } }),
      );
    })();
  },
  setDefaultAutoCreateWorktree: (value) => {
    set({ defaultAutoCreateWorktree: value });
    void (async () => {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.settings.update({
          patch: { defaultAutoCreateWorktree: value },
        }),
      );
    })();
  },
  setOnboardingCompleted: (value) => {
    set({ onboardingCompleted: value });
    void (async () => {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.settings.update({ patch: { onboardingCompleted: value } }),
      );
    })();
  },
  setProviderEnabled: (providerId, value) => {
    const next = { ...get().providerEnabled, [providerId]: value };
    set({ providerEnabled: next });
    void (async () => {
      const client = await getRpcClient();
      await Effect.runPromise(
        client.settings.update({ patch: { providerEnabled: next } }),
      );
    })();
  },
}));
