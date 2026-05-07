import {
  ArrowLeft,
  Check,
  FolderClosed,
  GitBranch,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo } from "react";

import {
  MODELS_BY_PROVIDER,
  type Folder,
  type FolderId,
  type ProviderId,
  type RuntimeMode,
} from "@forkzero/wire";

import { cn } from "~/lib/utils";
import { DEFAULT_SUBAGENT_PRESETS } from "../lib/subagent-presets.ts";
import { useSettingsStore } from "../store/settings.ts";
import { useSubagentsStore } from "../store/subagents.ts";
import { useUiStore, type SettingsSection } from "../store/ui.ts";
import { useWorkspaceStore } from "../store/workspace.ts";
import { ProviderIcon } from "./provider-icons.tsx";
import { MODES_ORDER, MODE_META } from "./runtime-mode-meta.ts";
import { RepositorySettings } from "./settings-repository.tsx";

const PROVIDER_LABEL: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

type RailItemBase = {
  readonly id: string;
  readonly label: string;
  readonly Icon: React.ComponentType<{ className?: string }>;
  readonly section: SettingsSection;
};

const TOP_RAIL: ReadonlyArray<RailItemBase> = [
  {
    id: "general",
    label: "General",
    Icon: SettingsIcon,
    section: { kind: "general" },
  },
  {
    id: "models",
    label: "Models & Providers",
    Icon: Sparkles,
    section: { kind: "models" },
  },
  {
    id: "git",
    label: "Git",
    Icon: GitBranch,
    section: { kind: "git" },
  },
];

/**
 * Two-pane settings surface. The left rail navigates between global
 * sections (General / Models & Providers / Git) and per-repository
 * settings; the right pane renders the active section's form.
 *
 * Defaults persisted in `useSettingsStore` are applied to every new
 * session created from the sidebar's "New chat" button. The composer's
 * popovers can override per-session.
 */
export function SettingsPage() {
  const setView = useUiStore((s) => s.setView);
  const section = useUiStore((s) => s.settingsSection);
  const setSection = useUiStore((s) => s.setSettingsSection);
  const folders = useWorkspaceStore((s) => s.folders);
  const loadFolders = useWorkspaceStore((s) => s.load);

  // First-mount: surface every project so the rail's Repositories list
  // doesn't read empty just because the user has been on a different
  // surface. WorkspaceStore guards against re-fetching when already loaded.
  useEffect(() => {
    if (folders.length === 0) void loadFolders();
  }, [folders.length, loadFolders]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
      <header className="flex h-9 shrink-0 items-center justify-between px-3 text-xs text-muted-foreground [-webkit-app-region:drag]">
        <div className="ml-16 flex items-center gap-1.5 select-none">
          <button
            type="button"
            onClick={() => setView("chat")}
            aria-label="Back to app"
            className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground [-webkit-app-region:no-drag]"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to app</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setView("chat")}
          aria-label="Close settings"
          className="rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground [-webkit-app-region:no-drag]"
        >
          <X className="size-3.5" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <Rail
          section={section}
          onSelect={setSection}
          folders={folders}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-6">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
            <SectionTitle section={section} folders={folders} />
            <Pane section={section} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Rail({
  section,
  onSelect,
  folders,
}: {
  section: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  folders: ReadonlyArray<Folder>;
}) {
  return (
    <nav className="flex w-48 shrink-0 flex-col gap-4 border-r border-border/40 px-3 py-6 text-sm">
      <div className="flex flex-col gap-0.5">
        {TOP_RAIL.map((item) => {
          const active =
            section.kind !== "repository" && section.kind === item.section.kind;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.section)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                active
                  ? "bg-accent/40 text-foreground"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <item.Icon className="size-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      {folders.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="px-2 text-[11px] uppercase tracking-wider text-muted-foreground/80">
            Repositories
          </div>
          <div className="flex flex-col gap-0.5">
            {folders.map((f) => {
              const active =
                section.kind === "repository" &&
                section.projectId === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() =>
                    onSelect({ kind: "repository", projectId: f.id })
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                    active
                      ? "bg-accent/40 text-foreground"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                  title={f.path}
                >
                  <FolderClosed className="size-4 shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}

function SectionTitle({
  section,
  folders,
}: {
  section: SettingsSection;
  folders: ReadonlyArray<Folder>;
}) {
  const title = useMemo(() => {
    if (section.kind === "general") return "General";
    if (section.kind === "models") return "Models & Providers";
    if (section.kind === "git") return "Git";
    const f = folders.find((x) => x.id === section.projectId);
    return f?.name ?? "Repository";
  }, [section, folders]);
  return (
    <h1 className="text-lg font-semibold text-foreground">{title}</h1>
  );
}

function Pane({ section }: { section: SettingsSection }) {
  if (section.kind === "general") return <GeneralPane />;
  if (section.kind === "models") return <ModelsPane />;
  if (section.kind === "git") return <GitPane />;
  return <RepositorySettings projectId={section.projectId} />;
}

function GeneralPane() {
  const defaultRuntimeMode = useSettingsStore((s) => s.defaultRuntimeMode);
  const setDefaultRuntimeMode = useSettingsStore(
    (s) => s.setDefaultRuntimeMode,
  );
  return (
    <>
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
      <SubagentsSection />
    </>
  );
}

function ModelsPane() {
  const defaultProviderId = useSettingsStore((s) => s.defaultProviderId);
  const defaultModelByProvider = useSettingsStore(
    (s) => s.defaultModelByProvider,
  );
  const setDefaultProvider = useSettingsStore((s) => s.setDefaultProvider);
  const setDefaultModel = useSettingsStore((s) => s.setDefaultModel);
  const providers: ReadonlyArray<ProviderId> = ["claude", "codex"];
  return (
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
  );
}

function GitPane() {
  const defaultAutoCreateWorktree = useSettingsStore(
    (s) => s.defaultAutoCreateWorktree,
  );
  const setDefaultAutoCreateWorktree = useSettingsStore(
    (s) => s.setDefaultAutoCreateWorktree,
  );
  return (
    <Section
      title="Worktrees"
      description="Forkzero can run each chat in its own git worktree under .forkzero/repo-worktree/, branched off the project's HEAD. Per-repo settings can override this."
    >
      <label className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          checked={defaultAutoCreateWorktree}
          onChange={(e) => setDefaultAutoCreateWorktree(e.target.checked)}
          className="size-4 accent-foreground"
        />
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="font-medium leading-none">
            Default to creating a new worktree for new chats
          </span>
          <span className="text-xs text-muted-foreground leading-snug">
            Newly added repositories inherit this preference; existing repos
            keep whatever you set on their per-repo page.
          </span>
        </span>
      </label>
    </Section>
  );
}

/**
 * Sub-agents settings. Master toggle + per-preset toggle. Model dropdowns
 * read the user's overlay; a future "Edit" sheet will surface the prompt
 * + tool subset (out of scope for v1 — the seed values are already
 * sensible defaults).
 */
function SubagentsSection() {
  const enableForNewSessions = useSubagentsStore(
    (s) => s.enableForNewSessions,
  );
  const setEnableForNewSessions = useSubagentsStore(
    (s) => s.setEnableForNewSessions,
  );
  const presets = useSubagentsStore((s) => s.presets);
  const setPresetEnabled = useSubagentsStore((s) => s.setPresetEnabled);
  const setPresetOverride = useSubagentsStore((s) => s.setPresetOverride);

  const claudeModels = MODELS_BY_PROVIDER.claude;

  return (
    <Section
      title="Sub-agents"
      description="Let your main agent delegate scoped tasks to cheaper models. Saves tokens on long sessions."
    >
      <label className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          checked={enableForNewSessions}
          onChange={(e) => setEnableForNewSessions(e.target.checked)}
          className="size-4 accent-foreground"
        />
        <span className="flex-1">Enable sub-agents for new sessions</span>
      </label>

      <div
        className={cn(
          "flex flex-col gap-2 rounded-md border border-border/40 p-2",
          enableForNewSessions ? "" : "opacity-60",
        )}
      >
        {DEFAULT_SUBAGENT_PRESETS.map((preset) => {
          const ps = presets[preset.name] ?? {
            enabled: true,
            overrides: {},
          };
          const model = ps.overrides.model ?? preset.definition.model;
          return (
            <div
              key={preset.name}
              className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/30"
            >
              <input
                type="checkbox"
                checked={ps.enabled && enableForNewSessions}
                disabled={!enableForNewSessions}
                onChange={(e) =>
                  setPresetEnabled(preset.name, e.target.checked)
                }
                className="size-4 accent-foreground"
              />
              <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {preset.displayName}
                </span>
                <span className="text-xs text-muted-foreground leading-snug">
                  {preset.summary}
                </span>
              </div>
              <select
                value={model ?? ""}
                disabled={!enableForNewSessions || !ps.enabled}
                onChange={(e) =>
                  setPresetOverride(preset.name, { model: e.target.value })
                }
                className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs outline-none focus:border-foreground/40 disabled:opacity-50"
              >
                {claudeModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function Section({
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

export function ModelSelect({
  providerId,
  value,
  onChange,
}: {
  providerId: ProviderId;
  value: string | null;
  onChange: (model: string) => void;
}) {
  const models = MODELS_BY_PROVIDER[providerId] ?? [];
  // Avoid leaving the saved default pointing at a removed model.
  const normalizedValue =
    value !== null && (models.some((m) => m.id === value) || models.length === 0)
      ? value ?? ""
      : models[0]?.id ?? "";
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

// Re-exported helpers consumed by `ChatComposer`'s "ensure valid defaults"
// path that picks an effective provider/model when the user's saved
// default isn't currently logged in.
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

// `FolderId` is referenced by the Repositories rail item; re-exporting the
// type keeps the settings-page.tsx -> settings-repository.tsx boundary
// well-typed without a separate types module.
export type { FolderId };
