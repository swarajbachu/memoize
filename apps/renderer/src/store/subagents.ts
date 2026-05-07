import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AgentDefinition } from "@forkzero/wire";

import {
  DEFAULT_SUBAGENT_PRESETS,
  type SubagentPreset,
} from "../lib/subagent-presets.ts";

/**
 * Per-preset overlay. Stores any field the user changed; `undefined`
 * fields fall back to the seed. We keep a separate overlay (rather than
 * cloning the full definition into storage) so seed updates from new
 * forkzero builds reach the user — a future tweak to the `research`
 * prompt would have applied retroactively had they not edited it.
 */
interface PresetState {
  readonly enabled: boolean;
  /** Partial overrides; merged on top of the seed at read time. */
  readonly overrides: Partial<AgentDefinition>;
}

interface SubagentsState {
  /** Master toggle: gate `enableSubagents` on new sessions. */
  readonly enableForNewSessions: boolean;
  readonly setEnableForNewSessions: (v: boolean) => void;
  /** Per-preset state keyed by `SubagentPreset.name`. */
  readonly presets: Record<string, PresetState>;
  readonly setPresetEnabled: (name: string, enabled: boolean) => void;
  readonly setPresetOverride: (
    name: string,
    override: Partial<AgentDefinition>,
  ) => void;
}

const defaultPresetsState = (): Record<string, PresetState> => {
  const out: Record<string, PresetState> = {};
  for (const seed of DEFAULT_SUBAGENT_PRESETS) {
    out[seed.name] = { enabled: true, overrides: {} };
  }
  return out;
};

export const useSubagentsStore = create<SubagentsState>()(
  persist(
    (set) => ({
      enableForNewSessions: true,
      setEnableForNewSessions: (v) => set({ enableForNewSessions: v }),
      presets: defaultPresetsState(),
      setPresetEnabled: (name, enabled) =>
        set((s) => {
          const cur = s.presets[name] ?? { enabled: true, overrides: {} };
          return {
            presets: {
              ...s.presets,
              [name]: { ...cur, enabled },
            },
          };
        }),
      setPresetOverride: (name, override) =>
        set((s) => {
          const cur = s.presets[name] ?? { enabled: true, overrides: {} };
          return {
            presets: {
              ...s.presets,
              [name]: {
                ...cur,
                overrides: { ...cur.overrides, ...override },
              },
            },
          };
        }),
    }),
    {
      name: "forkzero.subagents",
      version: 1,
    },
  ),
);

/**
 * Merge the seed and the user's overlay into the live `AgentDefinition`
 * the wire ships to the server. Used by the new-session create path.
 */
export const resolvePresetDefinition = (
  preset: SubagentPreset,
  overrides: Partial<AgentDefinition>,
): AgentDefinition => ({
  ...preset.definition,
  ...overrides,
});

/**
 * Build the `agents` map for a Claude session.create payload. Only
 * enabled presets are included; an empty result means the session
 * starts without sub-agents (unchanged from pre-feature behaviour).
 */
export const buildAgentsForNewSession = (): Readonly<
  Record<string, AgentDefinition>
> => {
  const state = useSubagentsStore.getState();
  if (!state.enableForNewSessions) return {};
  const out: Record<string, AgentDefinition> = {};
  for (const preset of DEFAULT_SUBAGENT_PRESETS) {
    const ps = state.presets[preset.name];
    if (ps && !ps.enabled) continue;
    out[preset.name] = resolvePresetDefinition(
      preset,
      ps?.overrides ?? {},
    );
  }
  return out;
};
