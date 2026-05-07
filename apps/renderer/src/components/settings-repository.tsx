import { Check, GitBranch, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  MODELS_BY_PROVIDER,
  type FolderId,
  type ProviderId,
} from "@forkzero/wire";

import { cn } from "~/lib/utils";
import { useRepositorySettingsStore } from "../store/repository-settings.ts";
import { useSettingsStore } from "../store/settings.ts";
import { useWorkspaceStore } from "../store/workspace.ts";
import { EMPTY_WORKTREES, useWorktreesStore } from "../store/worktrees.ts";
import { ProviderIcon } from "./provider-icons.tsx";
import { MODES_ORDER, MODE_META } from "./runtime-mode-meta.ts";
import { ModelSelect, Section } from "./settings-page.tsx";

const PROVIDER_LABEL: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

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
      <Section
        title="Path"
        description="Where this repository lives on disk."
      >
        <div className="rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
          {folder.path}
        </div>
      </Section>

      <ProviderOverrideSection
        projectId={projectId}
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
  projectId,
  defaultProviderId,
  defaultModel,
  onProviderChange,
  onModelChange,
}: {
  projectId: FolderId;
  defaultProviderId: ProviderId | null;
  defaultModel: string | null;
  onProviderChange: (v: ProviderId | null) => void;
  onModelChange: (v: string | null) => void;
}) {
  const globalProviderId = useSettingsStore((s) => s.defaultProviderId);
  const effectiveProvider: ProviderId = defaultProviderId ?? globalProviderId;
  return (
    <Section
      title="Default agent"
      description="Override the global default provider and model for new chats started in this repo. Leave on global to inherit."
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onProviderChange(null)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
              defaultProviderId === null
                ? "border-foreground/40 bg-accent/40"
                : "border-border/60 hover:bg-muted/40",
            )}
            title={`Use global default (${PROVIDER_LABEL[globalProviderId]})`}
          >
            <span className="flex-1 text-left">Use global</span>
            {defaultProviderId === null && (
              <Check className="size-3.5 opacity-80" />
            )}
          </button>
          {(["claude", "codex"] as ReadonlyArray<ProviderId>).map((pid) => {
            const active = defaultProviderId === pid;
            return (
              <button
                key={pid}
                type="button"
                onClick={() => onProviderChange(pid)}
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
        <div className="flex items-end gap-2">
          <ModelSelect
            providerId={effectiveProvider}
            value={defaultModel}
            onChange={(model) => onModelChange(model)}
          />
          <button
            type="button"
            onClick={() => onModelChange(null)}
            disabled={defaultModel === null}
            className="rounded-md border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
            title="Clear override and inherit global default model"
          >
            Use global
          </button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Project: <span className="font-mono">{projectId}</span>
        </span>
      </div>
    </Section>
  );
}

function RuntimeModeOverrideSection({
  currentValue,
  onChange,
}: {
  currentValue: string | null;
  onChange: (v: typeof MODES_ORDER[number] | null) => void;
}) {
  return (
    <Section
      title="Default permission mode"
      description="Override the global permission posture for new chats in this repo."
    >
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
            currentValue === null
              ? "border-foreground/40 bg-accent/40"
              : "border-border/60 hover:bg-muted/40",
          )}
        >
          <span className="flex-1 text-left">Use global default</span>
          {currentValue === null && <Check className="size-3.5 opacity-80" />}
        </button>
        {MODES_ORDER.map((mode) => {
          const m = MODE_META[mode];
          const ItemIcon = m.Icon;
          const active = currentValue === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
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
      description="Forkzero-managed git worktrees for this repo. Each lives at .forkzero/repo-worktree/<name>/ and tracks branch forkzero/<name>."
    >
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={autoCreate}
            onChange={(e) => onAutoCreateChange(e.target.checked)}
            className="size-4 accent-foreground"
          />
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="font-medium leading-none">
              Auto-create a worktree for new chats
            </span>
            <span className="text-xs text-muted-foreground leading-snug">
              When on, the composer's workspace picker pre-selects a fresh
              worktree. You can still flip back to "Current checkout"
              before sending the first message.
            </span>
          </span>
        </label>

        {sorted.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/40 px-3 py-4 text-center text-xs text-muted-foreground">
            No worktrees yet. The composer creates one on demand.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 rounded-md border border-border/40 p-1">
            {sorted.map((wt) => (
              <li
                key={wt.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/30"
              >
                <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {wt.name}
                  </span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {wt.branch} · off {wt.baseBranch}
                  </span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground/80">
                    {wt.path}
                  </span>
                </div>
                {pendingDirty === wt.name ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void onRemove(wt.id, wt.name, true)}
                      className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/20"
                    >
                      Force remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDirty(null)}
                      className="rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onRemove(wt.id, wt.name, false)}
                    className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
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
