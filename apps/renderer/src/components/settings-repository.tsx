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
  CheckboxField,
  ModelSelect,
  OptionCard,
  OptionGroup,
  OverrideField,
  PROVIDER_LABEL,
  Section,
} from "./settings-page.tsx";

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
        onProviderChange={(value) =>
          void update(projectId, { defaultProviderId: value })
        }
        onModelChange={(value) =>
          void update(projectId, { defaultModel: value })
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
  onProviderChange,
  onModelChange,
}: {
  defaultProviderId: ProviderId | null;
  defaultModel: string | null;
  onProviderChange: (v: ProviderId | null) => void;
  onModelChange: (v: string | null) => void;
}) {
  const globalProviderId = useSettingsStore((s) => s.defaultProviderId);
  const globalModelByProvider = useSettingsStore(
    (s) => s.defaultModelByProvider,
  );
  const effectiveProvider: ProviderId = defaultProviderId ?? globalProviderId;
  const globalModel = globalModelByProvider[globalProviderId];
  const globalModelLabel =
    MODELS_BY_PROVIDER[globalProviderId].find((m) => m.id === globalModel)
      ?.label ?? globalModel ?? "—";
  const isOverridden = defaultProviderId !== null || defaultModel !== null;
  return (
    <Section
      title="Default agent"
      description="Override the global default provider and model for new chats in this repo."
    >
      <OverrideField
        isOverridden={isOverridden}
        globalLabel={`${PROVIDER_LABEL[globalProviderId]} · ${globalModelLabel}`}
        onClear={() => {
          onProviderChange(null);
          onModelChange(null);
        }}
      >
        <div className="flex flex-col gap-3">
          <OptionGroup columns={2}>
            {(["claude", "codex"] as ReadonlyArray<ProviderId>).map((pid) => (
              <OptionCard
                key={pid}
                iconNode={<ProviderIcon providerId={pid} className="size-4" />}
                title={PROVIDER_LABEL[pid]}
                active={effectiveProvider === pid}
                onClick={() => onProviderChange(pid)}
              />
            ))}
          </OptionGroup>
          <ModelSelect
            providerId={effectiveProvider}
            value={defaultModel}
            onChange={(model) => onModelChange(model)}
          />
        </div>
      </OverrideField>
    </Section>
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
  return (
    <Section
      title="Default permission mode"
      description="Override the global permission posture for new chats in this repo."
    >
      <OverrideField
        isOverridden={currentValue !== null}
        globalLabel={MODE_META[globalMode].label}
        onClear={() => onChange(null)}
      >
        <OptionGroup>
          {MODES_ORDER.map((mode) => {
            const m = MODE_META[mode];
            return (
              <OptionCard
                key={mode}
                icon={m.Icon}
                title={m.label}
                description={m.description}
                active={effective === mode}
                onClick={() => onChange(mode)}
              />
            );
          })}
        </OptionGroup>
      </OverrideField>
    </Section>
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
    <Section
      title="Worktrees"
      description="Git worktrees for this repo. Each lives under .memoize/repo-worktree/ on disk."
    >
      <div className="flex flex-col gap-3">
        <CheckboxField
          checked={autoCreate}
          onChange={onAutoCreateChange}
          label="Auto-create a worktree for new chats"
          description='When on, the composer&apos;s workspace picker pre-selects a fresh worktree. You can still flip back to "Current checkout" before sending the first message.'
        />

        {sorted.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/50 px-3 py-6 text-center text-xs text-muted-foreground">
            No worktrees yet. Memoize creates one for you when you start a new
            chat.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 rounded-lg border border-border/50 p-1.5">
            {sorted.map((wt) => (
              <li
                key={wt.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-muted/40"
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
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void onRemove(wt.id, wt.name, true)}
                      className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-400 transition-colors hover:bg-red-500/20"
                    >
                      Force remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDirty(null)}
                      className="rounded-md border border-border/50 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onRemove(wt.id, wt.name, false)}
                    className="flex items-center gap-1 rounded-md border border-border/50 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    title="Remove this worktree from disk (branch stays)"
                  >
                    <Trash2 className="size-3" />
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {pendingDirty !== null && (
          <p className="text-xs text-amber-400">
            {pendingDirty} has uncommitted changes. Force-remove to discard
            them.
          </p>
        )}
        {pendingError !== null && (
          <p className="text-xs text-red-400">{pendingError}</p>
        )}
      </div>
    </Section>
  );
}
