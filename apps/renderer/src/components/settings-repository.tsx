import { GitBranch, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  MODELS_BY_PROVIDER,
  type FolderId,
  type ProviderId,
} from "@memoize/wire";

import { useRepositorySettingsStore } from "../store/repository-settings.ts";
import { useSettingsStore } from "../store/settings.ts";
import { useWorkspaceStore } from "../store/workspace.ts";
import { EMPTY_WORKTREES, useWorktreesStore } from "../store/worktrees.ts";
import { ProviderIcon } from "./provider-icons.tsx";
import { MODES_ORDER, MODE_META } from "./runtime-mode-meta.ts";
import {
  PROVIDER_LABEL,
  RadioCheck,
  SettingsFrame,
} from "./settings-page.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Frame, FrameFooter, FrameHeader } from "./ui/frame.tsx";
import { Switch } from "./ui/switch.tsx";

/**
 * Per-repository settings: provider/model/permission overrides plus
 * worktree management. Every override is nullable — `null` means "fall
 * through to the global default in `useSettingsStore`."
 */
export function RepositorySettings({ projectId }: { projectId: FolderId }) {
  const folder = useWorkspaceStore((s) =>
    s.folders.find((f) => f.id === projectId),
  );
  const settings = useRepositorySettingsStore(
    (s) => s.byProject[projectId] ?? null,
  );
  const refresh = useRepositorySettingsStore((s) => s.refresh);
  const update = useRepositorySettingsStore((s) => s.update);

  useEffect(() => {
    if (settings === null) void refresh(projectId);
  }, [projectId, refresh, settings]);

  if (folder === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        Project no longer exists. Pick another from the sidebar.
      </p>
    );
  }

  if (settings === null) {
    return (
      <p className="text-sm text-muted-foreground">Loading settings…</p>
    );
  }

  return (
    <>
      <ProviderOverrideSection
        defaultProviderId={settings.defaultProviderId}
        defaultModel={settings.defaultModel}
        onProviderAndModelChange={(provider, model) =>
          void update(projectId, {
            defaultProviderId: provider,
            defaultModel: model,
          })
        }
      />

      <RuntimeModeOverrideSection
        currentValue={settings.defaultRuntimeMode}
        onChange={(value) =>
          void update(projectId, { defaultRuntimeMode: value })
        }
      />

      <WorktreeSection
        projectId={projectId}
        autoCreate={settings.autoCreateWorktree}
        onAutoCreateChange={(value) =>
          void update(projectId, { autoCreateWorktree: value })
        }
      />
    </>
  );
}

function ProviderOverrideSection({
  defaultProviderId,
  defaultModel,
  onProviderAndModelChange,
}: {
  defaultProviderId: ProviderId | null;
  defaultModel: string | null;
  /**
   * Update provider + model in a single patch. We deliberately don't expose
   * separate setters: changing only the provider would leave a stale model
   * id behind, and firing two patches in a row races against the server's
   * read-then-write so the later response can clobber the earlier one.
   */
  onProviderAndModelChange: (
    provider: ProviderId | null,
    model: string | null,
  ) => void;
}) {
  const globalProviderId = useSettingsStore((s) => s.defaultProviderId);
  const globalModelByProvider = useSettingsStore(
    (s) => s.defaultModelByProvider,
  );
  const providerEnabled = useSettingsStore((s) => s.providerEnabled);
  const effectiveProvider: ProviderId = defaultProviderId ?? globalProviderId;
  const globalModel = globalModelByProvider[globalProviderId];
  const globalModelLabel =
    MODELS_BY_PROVIDER[globalProviderId].find((m) => m.id === globalModel)
      ?.label ??
    globalModel ??
    "—";
  const isOverridden = defaultProviderId !== null || defaultModel !== null;

  // Mirror the global "Default agent" filter: skip providers the user
  // toggled off. Cursor is still excluded because its CLI does not expose
  // enough plan information for us to distinguish signed-in from usable.
  const availableProviders = (
    ["claude", "codex", "grok", "gemini", "cursor", "opencode"] as const
  ).filter((pid) => {
    if (providerEnabled[pid] === false) return false;
    if (pid === "cursor") return false;
    return true;
  });

  const firstModelFor = (pid: ProviderId): string | null =>
    MODELS_BY_PROVIDER[pid]?.[0]?.id ?? null;

  const onToggle = (next: boolean) => {
    if (next) {
      // Turning on: seed override with the currently-effective values so the
      // user sees the same state, but it's now persisted as a repo override.
      onProviderAndModelChange(
        effectiveProvider,
        globalModelByProvider[effectiveProvider] ??
          firstModelFor(effectiveProvider),
      );
    } else {
      onProviderAndModelChange(null, null);
    }
  };

  const onPickProvider = (pid: ProviderId) => {
    onProviderAndModelChange(
      pid,
      globalModelByProvider[pid] ?? firstModelFor(pid),
    );
  };

  const onPickModel = (model: string) => {
    onProviderAndModelChange(effectiveProvider, model);
  };

  return (
    <SettingsFrame
      title="Default agent"
      trailing={<Switch checked={isOverridden} onCheckedChange={onToggle} />}
      description="Override the global default provider and model for new chats in this repo."
      flush
    >
      {isOverridden ? (
        <div
          role="radiogroup"
          aria-label="Repository default provider"
          className="flex flex-col divide-y divide-border/40"
        >
          {availableProviders.map((pid) => {
            const selected = effectiveProvider === pid;
            const models = MODELS_BY_PROVIDER[pid] ?? [];
            return (
              <div key={pid} className="flex flex-col">
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onPickProvider(pid)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                >
                  <ProviderIcon providerId={pid} className="size-4 shrink-0" />
                  <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {PROVIDER_LABEL[pid]}
                  </span>
                  <RadioCheck active={selected} />
                </button>
                {selected && models.length > 0 && (
                  <div className="flex flex-col gap-1.5 px-4 pb-3 pl-11">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                      Model
                    </span>
                    <div
                      role="radiogroup"
                      aria-label={`Model for ${PROVIDER_LABEL[pid]}`}
                      className="flex flex-col"
                    >
                      {models.map((m) => {
                        const isCurrentModel = defaultModel === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            role="radio"
                            aria-checked={isCurrentModel}
                            onClick={() => onPickModel(m.id)}
                            className="group flex items-center gap-3 py-1.5 text-left"
                          >
                            <RadioCheck active={isCurrentModel} />
                            <span className="text-sm text-foreground">
                              {m.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          Inheriting{" "}
          <span className="text-foreground">
            {PROVIDER_LABEL[globalProviderId]} · {globalModelLabel}
          </span>
        </p>
      )}
    </SettingsFrame>
  );
}

function RuntimeModeOverrideSection({
  currentValue,
  onChange,
}: {
  currentValue: typeof MODES_ORDER[number] | null;
  onChange: (v: typeof MODES_ORDER[number] | null) => void;
}) {
  const globalMode = useSettingsStore((s) => s.defaultRuntimeMode);
  const effective = currentValue ?? globalMode;
  const isOverridden = currentValue !== null;
  const onToggle = (next: boolean) => {
    if (next) onChange(globalMode);
    else onChange(null);
  };
  return (
    <SettingsFrame
      title="Default permission mode"
      trailing={<Switch checked={isOverridden} onCheckedChange={onToggle} />}
      description="Override the global permission posture for new chats in this repo."
      flush
    >
      {isOverridden ? (
        <div
          role="radiogroup"
          aria-label="Repository default permission mode"
          className="flex flex-col divide-y divide-border/40"
        >
          {MODES_ORDER.map((mode) => {
            const m = MODE_META[mode];
            const selected = effective === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(mode)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <m.Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {m.label}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {m.description}
                  </span>
                </span>
                <RadioCheck active={selected} className="mt-0.5" />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          Inheriting{" "}
          <span className="text-foreground">{MODE_META[globalMode].label}</span>
        </p>
      )}
    </SettingsFrame>
  );
}

function WorktreeSection({
  projectId,
  autoCreate,
  onAutoCreateChange,
}: {
  projectId: FolderId;
  autoCreate: boolean;
  onAutoCreateChange: (v: boolean) => void;
}) {
  const worktrees = useWorktreesStore(
    (s) => s.byProject[projectId] ?? EMPTY_WORKTREES,
  );
  const refresh = useWorktreesStore((s) => s.refresh);
  const remove = useWorktreesStore((s) => s.remove);
  const [pendingDirty, setPendingDirty] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);

  useEffect(() => {
    void refresh(projectId);
  }, [projectId, refresh]);

  const sorted = useMemo(
    () =>
      [...worktrees].sort((a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime(),
      ),
    [worktrees],
  );

  const onRemove = async (
    worktreeId: typeof worktrees[number]["id"],
    name: string,
    force: boolean,
  ) => {
    setPendingError(null);
    const result = await remove(projectId, worktreeId, force);
    if (result.ok) {
      setPendingDirty(null);
      return;
    }
    if (
      !force &&
      (result.reason.includes("WorktreeDirtyError") ||
        result.reason.toLowerCase().includes("dirty"))
    ) {
      setPendingDirty(name);
      return;
    }
    setPendingError(result.reason);
  };

  return (
    <>
      <SettingsFrame
        title="Auto-create a worktree for new chats"
        trailing={
          <Switch
            checked={autoCreate}
            onCheckedChange={onAutoCreateChange}
          />
        }
        description={`When on, the composer's workspace picker pre-selects a fresh worktree. You can still flip back to "Current checkout" before sending the first message.`}
      />

      <Frame>
        <FrameHeader className="flex flex-row items-center justify-between px-2 py-2 w-full">
          <p className="text-sm font-semibold text-foreground">Worktrees</p>
          <span className="text-[11px] text-muted-foreground/80">
            {sorted.length} {sorted.length === 1 ? "worktree" : "worktrees"}
          </span>
        </FrameHeader>

        <Card>
          {sorted.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              No worktrees yet. Memoize creates one for you when you start a
              new chat.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/40">
              {sorted.map((wt) => (
                <li
                  key={wt.id}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20"
                >
                  <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                  <div
                    className="flex min-w-0 flex-col gap-0.5"
                    title={wt.path}
                  >
                    <span className="truncate text-sm font-medium text-foreground">
                      {wt.name}
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {wt.branch}
                      <span className="text-muted-foreground/60">
                        {" "}
                        · off {wt.baseBranch}
                      </span>
                    </span>
                  </div>
                  {pendingDirty === wt.name ? (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="destructive-outline"
                        size="sm"
                        onClick={() => void onRemove(wt.id, wt.name, true)}
                      >
                        Force remove
                      </Button>
                      <Button
                        variant="settings"
                        size="sm"
                        onClick={() => setPendingDirty(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="settings"
                      size="sm"
                      onClick={() => void onRemove(wt.id, wt.name, false)}
                      title="Remove this worktree from disk (branch stays)"
                    >
                      <Trash2 className="size-3" />
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <FrameFooter className="px-2 py-1 w-full">
          {pendingDirty !== null ? (
            <p className="text-xs leading-relaxed text-amber-400">
              {pendingDirty} has uncommitted changes. Force-remove to discard
              them.
            </p>
          ) : pendingError !== null ? (
            <p className="text-xs leading-relaxed text-red-400">
              {pendingError}
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Git worktrees for this repo. Each lives under
              ~/.memoize/&lt;repo&gt;/&lt;name&gt;/ on disk.
            </p>
          )}
        </FrameFooter>
      </Frame>
    </>
  );
}
