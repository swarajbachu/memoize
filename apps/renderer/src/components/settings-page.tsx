import {
  ArrowLeft,
  Box,
  Check,
  FolderClosed,
  GitBranch,
  Keyboard,
  RotateCw,
  Settings as SettingsIcon,
} from "lucide-react";
import { useEffect, useMemo } from "react";

import {
  MODELS_BY_PROVIDER,
  type Folder,
  type FolderId,
  type ProviderId,
  type RuntimeMode,
} from "@memoize/wire";

import {
  formatRelativeTime,
  useRelativeTimeTick,
} from "~/lib/use-relative-time.ts";
import { cn } from "~/lib/utils";
import { formatAccelerator, SHORTCUTS } from "../lib/shortcuts.ts";
import { DEFAULT_SUBAGENT_PRESETS } from "../lib/subagent-presets.ts";
import { useProvidersStore } from "../store/providers.ts";
import { useSettingsStore } from "../store/settings.ts";
import { useSubagentsStore } from "../store/subagents.ts";
import { useUiStore, type SettingsSection } from "../store/ui.ts";
import { useWorkspaceStore } from "../store/workspace.ts";
import { ProviderCard } from "./provider-card.tsx";
import { ProviderIcon } from "./provider-icons.tsx";
import { MODES_ORDER, MODE_META } from "./runtime-mode-meta.ts";
import { RepositorySettings } from "./settings-repository.tsx";
import { Button } from "./ui/button.tsx";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx";

const PROVIDER_LABEL: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  grok: "Grok",
  cursor: "Cursor",
  gemini: "Gemini",
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
    id: "providers",
    label: "Providers",
    Icon: Box,
    section: { kind: "providers" },
  },
  {
    id: "workspace",
    label: "Workspace",
    Icon: GitBranch,
    section: { kind: "workspace" },
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    Icon: Keyboard,
    section: { kind: "shortcuts" },
  },
];

/**
 * Two-pane settings surface. The left rail navigates between global
 * sections (General / Models & Providers / Workspace) and per-repository
 * settings; the right pane renders the active section's form.
 */
export function SettingsPage() {
  const setView = useUiStore((s) => s.setView);
  const section = useUiStore((s) => s.settingsSection);
  const setSection = useUiStore((s) => s.setSettingsSection);
  const folders = useWorkspaceStore((s) => s.folders);
  const loadFolders = useWorkspaceStore((s) => s.load);

  useEffect(() => {
    if (folders.length === 0) void loadFolders();
  }, [folders.length, loadFolders]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex h-9 shrink-0 items-center px-3 text-xs text-muted-foreground [-webkit-app-region:drag]">
        <div className="w-16 shrink-0" />
        <button
          type="button"
          onClick={() => setView("chat")}
          aria-label="Back to app"
          className="flex items-center gap-1 rounded p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground [-webkit-app-region:no-drag]"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to app</span>
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <Rail
          section={section}
          onSelect={setSection}
          folders={folders}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-10 py-8">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
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
    <nav className="flex w-56 shrink-0 flex-col gap-6 border-r border-border/40 bg-sidebar/40 px-3 py-6 text-sm text-sidebar-foreground">
      <div className="flex flex-col gap-0.5">
        {TOP_RAIL.map((item) => {
          const active =
            section.kind !== "repository" && section.kind === item.section.kind;
          return (
            <RailButton
              key={item.id}
              active={active}
              onClick={() => onSelect(item.section)}
              icon={item.Icon}
              label={item.label}
            />
          );
        })}
      </div>
      {folders.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-medium text-muted-foreground">
              Repositories
            </span>
            <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {folders.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            {folders.map((f) => {
              const active =
                section.kind === "repository" &&
                section.projectId === f.id;
              return (
                <RailButton
                  key={f.id}
                  active={active}
                  onClick={() =>
                    onSelect({ kind: "repository", projectId: f.id })
                  }
                  icon={FolderClosed}
                  label={f.name}
                  title={f.path}
                  truncate
                />
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}

function RailButton({
  active,
  onClick,
  icon: Icon,
  label,
  title,
  truncate,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title?: string;
  truncate?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className={cn(truncate && "truncate")}>{label}</span>
    </button>
  );
}

function SectionTitle({
  section,
  folders,
}: {
  section: SettingsSection;
  folders: ReadonlyArray<Folder>;
}) {
  const { title, subtitle } = useMemo(() => {
    if (section.kind === "general") {
      return {
        title: "General",
        subtitle: "Defaults for new chats and sub-agents.",
      };
    }
    if (section.kind === "providers") {
      return {
        title: "Providers",
        subtitle:
          "Verify what's installed, signed in, and which subscription each provider runs on.",
      };
    }
    if (section.kind === "workspace") {
      return {
        title: "Workspace",
        subtitle: "How new chats relate to your git checkout.",
      };
    }
    if (section.kind === "shortcuts") {
      return {
        title: "Keyboard shortcuts",
        subtitle: "These also appear under the menu bar.",
      };
    }
    const f = folders.find((x) => x.id === section.projectId);
    return {
      title: f?.name ?? "Repository",
      subtitle: f?.path ?? "",
    };
  }, [section, folders]);
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      {subtitle && (
        <p
          className={cn(
            "text-sm text-muted-foreground",
            section.kind === "repository" && "truncate font-mono text-xs",
          )}
          title={section.kind === "repository" ? subtitle : undefined}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Pane({ section }: { section: SettingsSection }) {
  if (section.kind === "general") return <GeneralPane />;
  if (section.kind === "providers") return <ProvidersPane />;
  if (section.kind === "workspace") return <WorkspacePane />;
  if (section.kind === "shortcuts") return <ShortcutsPane />;
  return <RepositorySettings projectId={section.projectId} />;
}

/**
 * Read-only reference list of every shortcut the app installs in the
 * native menu. Tooltips around the app point at the same `SHORTCUTS`
 * source of truth so users don't have to come here to discover them —
 * this page just collects them in one place.
 */
function ShortcutsPane() {
  return (
    <Section
      title="All shortcuts"
      description="Edit shortcuts isn't supported yet — for now these are fixed. Standard editing keys (cut, copy, paste, undo) follow your OS defaults."
    >
      <ul className="flex flex-col gap-0.5 rounded-lg border border-border/50 p-1.5">
        {SHORTCUTS.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-muted/40"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium leading-none text-foreground">
                {s.label}
              </span>
              <span className="truncate text-xs leading-snug text-muted-foreground">
                {s.description}
              </span>
            </span>
            <Kbd>{formatAccelerator(s.accelerator)}</Kbd>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="shrink-0 font-sans text-sm text-muted-foreground">
      {children}
    </kbd>
  );
}

function GeneralPane() {
  const defaultRuntimeMode = useSettingsStore((s) => s.defaultRuntimeMode);
  const setDefaultRuntimeMode = useSettingsStore(
    (s) => s.setDefaultRuntimeMode,
  );
  const setOnboardingCompleted = useSettingsStore(
    (s) => s.setOnboardingCompleted,
  );
  const setView = useUiStore((s) => s.setView);
  return (
    <>
      <Section
        title="Default permission mode"
        description="How the agent handles tool calls in new sessions. Each session can override this from its composer."
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
                active={mode === defaultRuntimeMode}
                onClick={() => setDefaultRuntimeMode(mode)}
              />
            );
          })}
        </OptionGroup>
      </Section>
      <SubagentsSection />
      <Section
        title="Onboarding"
        description="Replay the first-launch welcome flow. Your existing projects and credentials stay put."
      >
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setView("chat");
              setOnboardingCompleted(false);
            }}
          >
            Show onboarding again
          </Button>
        </div>
      </Section>
    </>
  );
}

function ProvidersPane() {
  const availability = useProvidersStore((s) => s.availability);
  const loading = useProvidersStore((s) => s.loading);
  const error = useProvidersStore((s) => s.error);
  const refresh = useProvidersStore((s) => s.refresh);
  const defaultProviderId = useSettingsStore((s) => s.defaultProviderId);
  const setDefaultProvider = useSettingsStore((s) => s.setDefaultProvider);

  // Refresh once on mount + re-poll when the window regains focus so the
  // "Checked X ago" line reflects reality without forcing the user to hit
  // refresh themselves.
  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const now = useRelativeTimeTick(15_000);
  const lastCheckedAt = useMemo(() => {
    let latest: Date | null = null;
    for (const a of availability) {
      const ts = a.lastCheckedAt;
      if (ts === undefined) continue;
      if (latest === null || ts.getTime() > latest.getTime()) latest = ts;
    }
    return latest;
  }, [availability]);

  const providers: ReadonlyArray<ProviderId> = [
    "claude",
    "codex",
    "grok",
    "gemini",
    "cursor",
  ];
  const availabilityById = useMemo(() => {
    const map = new Map<ProviderId, (typeof availability)[number]>();
    for (const a of availability) map.set(a.providerId, a);
    return map;
  }, [availability]);

  return (
    <>
      <Section
        title="Installed providers"
        description="memoize uses your existing CLI credentials — Claude Code, Codex, Grok, Gemini, and Cursor all sign in through their own login flows."
      >
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {loading
              ? "Checking…"
              : error !== null
                ? `Probe failed · ${error}`
                : lastCheckedAt
                  ? `Checked ${formatRelativeTime(lastCheckedAt, now) ?? "just now"}`
                  : availability.length > 0
                    ? "Checked"
                    : "Not checked yet"}
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh provider status"
          >
            <RotateCw
              className={cn("size-3.5", loading && "animate-spin")}
              aria-hidden
            />
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {providers.map((pid) => (
            <ProviderCard
              key={pid}
              providerId={pid}
              availability={availabilityById.get(pid)}
              loading={loading}
            />
          ))}
        </div>
      </Section>
      <Section
        title="Default agent"
        description="Which provider new chats start in. Change per session from the composer."
      >
        <OptionGroup columns={3}>
          {providers.map((pid) => (
            <OptionCard
              key={pid}
              iconNode={<ProviderIcon providerId={pid} className="size-4" />}
              title={PROVIDER_LABEL[pid]}
              active={pid === defaultProviderId}
              onClick={() => setDefaultProvider(pid)}
            />
          ))}
        </OptionGroup>
      </Section>
    </>
  );
}

function WorkspacePane() {
  const defaultAutoCreateWorktree = useSettingsStore(
    (s) => s.defaultAutoCreateWorktree,
  );
  const setDefaultAutoCreateWorktree = useSettingsStore(
    (s) => s.setDefaultAutoCreateWorktree,
  );
  return (
    <Section
      title="New chat workspace"
      description="Memoize can run each chat in its own git worktree under .memoize/repo-worktree/, branched off the project's HEAD. Per-repo settings override this default."
    >
      <CheckboxField
        checked={defaultAutoCreateWorktree}
        onChange={setDefaultAutoCreateWorktree}
        label="Create a new worktree for new chats by default"
        description='Pre-selects "New worktree" in the composer&apos;s workspace picker. You can still flip back to "Current checkout" before sending the first message.'
      />
    </Section>
  );
}

/**
 * Sub-agents settings. Master toggle + per-preset toggle. Model dropdowns
 * read the user's overlay; a future "Edit" sheet will surface the prompt
 * + tool subset.
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
  const claudeModelItems = useMemo(
    () => claudeModels.map((m) => ({ value: m.id, label: m.label })),
    [claudeModels],
  );

  return (
    <Section
      title="Sub-agents"
      description="Let your main agent delegate scoped tasks to cheaper models. Saves tokens on long sessions."
    >
      <CheckboxField
        checked={enableForNewSessions}
        onChange={setEnableForNewSessions}
        label="Enable sub-agents for new sessions"
      />

      <div
        className={cn(
          "flex flex-col gap-0.5 rounded-lg border border-border/50 p-1.5 transition-opacity",
          enableForNewSessions ? "" : "pointer-events-none opacity-50",
        )}
      >
        {DEFAULT_SUBAGENT_PRESETS.map((preset) => {
          const ps = presets[preset.name] ?? {
            enabled: true,
            overrides: {},
          };
          const model = ps.overrides.model ?? preset.definition.model;
          const rowDisabled = !enableForNewSessions || !ps.enabled;
          return (
            <div
              key={preset.name}
              className="flex items-center gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-muted/40"
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <CheckboxInput
                  checked={ps.enabled && enableForNewSessions}
                  disabled={!enableForNewSessions}
                  onChange={(v) => setPresetEnabled(preset.name, v)}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium leading-none">
                    {preset.displayName}
                  </span>
                  <span className="truncate text-xs leading-snug text-muted-foreground">
                    {preset.summary}
                  </span>
                </span>
              </label>
              <Select
                value={model ?? ""}
                disabled={rowDisabled}
                onValueChange={(next) =>
                  setPresetOverride(preset.name, { model: next as string })
                }
                items={claudeModelItems}
              >
                <SelectTrigger size="sm" className="w-auto min-w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {claudeModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-border/40 pt-6 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {description && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export function OptionGroup({
  children,
  columns,
}: {
  children: React.ReactNode;
  columns?: 2 | 3;
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "gap-2",
        columns === 2 && "grid grid-cols-2",
        columns === 3 && "grid grid-cols-3",
        !columns && "flex flex-col",
      )}
    >
      {children}
    </div>
  );
}

export function OptionCard({
  icon: Icon,
  iconNode,
  title,
  description,
  active,
  onClick,
  disabled,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  iconNode?: React.ReactNode;
  title: string;
  description?: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const compact = !description;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        compact ? "px-3 py-2" : "items-start px-3.5 py-3",
        active
          ? "border-foreground/30 bg-accent/40"
          : "border-border/50 hover:bg-muted/40",
      )}
    >
      <RadioDot active={active} className={compact ? "" : "mt-0.5"} />
      {(Icon || iconNode) && (
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center text-muted-foreground group-aria-checked:text-foreground",
            !compact && "mt-0.5",
          )}
        >
          {iconNode ?? (Icon ? <Icon className="size-4" /> : null)}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium leading-none text-foreground">
          {title}
        </span>
        {description && (
          <span className="text-xs leading-snug text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </button>
  );
}

function RadioDot({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
        active
          ? "border-foreground bg-background"
          : "border-border bg-background group-hover:border-foreground/60",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-foreground transition-transform duration-150",
          active ? "scale-100" : "scale-0",
        )}
      />
    </span>
  );
}

export function CheckboxField({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "group/checkbox flex items-start gap-3 rounded-lg border border-border/50 px-3.5 py-3 text-sm transition-colors hover:bg-muted/40 has-[:focus-visible]:border-foreground/30 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <CheckboxInput
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5"
      />
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="font-medium leading-none text-foreground">
          {label}
        </span>
        {description && (
          <span className="text-xs leading-snug text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * Visually-styled checkbox: native `<input>` is `sr-only` for accessibility
 * and form semantics, custom box is rendered as a sibling so we get
 * `peer-focus-visible` rings + a real checkmark on solid-foreground fill.
 */
export function CheckboxInput({
  checked,
  onChange,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 size-4 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden
        className={cn(
          "flex size-4 items-center justify-center rounded-[5px] border transition-colors",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background",
          checked
            ? "border-foreground bg-foreground"
            : "border-border bg-background peer-hover:border-foreground/60",
          disabled && "opacity-50",
        )}
      >
        {checked && (
          <Check
            className="size-3 text-background"
            strokeWidth={3.5}
            aria-hidden
          />
        )}
      </span>
    </span>
  );
}

/**
 * "Inherits global ↔ Custom" segmented control for per-repo overrides.
 * When inheriting, the children dim and clicks bypass. Picking any option
 * inside `children` flips back to "Custom".
 */
export function OverrideField({
  isOverridden,
  globalLabel,
  onClear,
  children,
}: {
  isOverridden: boolean;
  globalLabel: string;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border border-border/50 bg-muted/30 p-0.5 text-xs">
          <button
            type="button"
            onClick={onClear}
            className={cn(
              "rounded px-2.5 py-1 transition-colors",
              !isOverridden
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Inherit
          </button>
          <button
            type="button"
            disabled={isOverridden}
            className={cn(
              "rounded px-2.5 py-1 transition-colors",
              isOverridden
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            Custom
          </button>
        </div>
        {!isOverridden && (
          <span className="truncate text-xs text-muted-foreground">
            {globalLabel}
          </span>
        )}
      </div>
      <div
        className={cn(
          "transition-opacity",
          isOverridden ? "" : "pointer-events-none opacity-50",
        )}
      >
        {children}
      </div>
    </div>
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
  const normalizedValue =
    value !== null && (models.some((m) => m.id === value) || models.length === 0)
      ? value ?? ""
      : models[0]?.id ?? "";
  const items = useMemo(
    () => models.map((m) => ({ value: m.id, label: m.label })),
    [models],
  );
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Default model
      </span>
      <Select
        value={normalizedValue}
        onValueChange={(next) => onChange(next as string)}
        items={items}
      >
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
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

export { PROVIDER_LABEL };
export type { FolderId };
