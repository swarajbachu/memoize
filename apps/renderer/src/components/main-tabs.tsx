import { X } from "lucide-react";

import { MODELS_BY_PROVIDER, type ProviderId } from "@memoize/wire";

import { useUiStore } from "../store/ui.ts";
import { FileIcon } from "./file-icon.tsx";
import { ProviderIcon } from "./provider-icons.tsx";

type Props = {
  readonly headerLabel: string;
  readonly headerTitle?: string;
  readonly providerId?: ProviderId;
  readonly model?: string;
};

const PROVIDER_LABEL: Record<ProviderId, string> = {
  claude: "Claude",
  codex: "Codex",
  grok: "Grok",
};

const lookupModelLabel = (
  providerId: ProviderId | undefined,
  model: string | undefined,
): string | null => {
  if (providerId === undefined || model === undefined) return null;
  const opt = MODELS_BY_PROVIDER[providerId].find((m) => m.id === model);
  return opt?.label ?? model;
};

/**
 * Top-of-main-pane tab strip. Always renders the Chat tab; the file tab only
 * appears when a file has been opened from the right-side tree. The empty
 * region at the right keeps the macOS window-drag handle alive — the prior
 * static `<header>` did the same with `[-webkit-app-region:drag]`.
 *
 * Active state is signalled by a 2px bottom underline on the tab itself,
 * not a filled background — keeps the strip flat and lets the chat surface
 * read as one continuous panel with the body below.
 */
export function MainTabs({ headerLabel, headerTitle, providerId, model }: Props) {
  const activeMainTab = useUiStore((s) => s.activeMainTab);
  const setActiveMainTab = useUiStore((s) => s.setActiveMainTab);
  const openFile = useUiStore((s) => s.openFile);
  const closeFileTab = useUiStore((s) => s.closeFileTab);
  const fileDirty = useUiStore((s) => s.fileDirty);

  const modelLabel = lookupModelLabel(providerId, model);
  const tabTitle =
    providerId && modelLabel
      ? `${headerTitle ?? headerLabel} — ${PROVIDER_LABEL[providerId]} · ${modelLabel}`
      : headerTitle;

  return (
    <header className="flex h-10 shrink-0 items-stretch border-b border-border">
      <div className="flex items-stretch gap-1 px-2">
        <TabButton
          active={activeMainTab === "chat"}
          onClick={() => setActiveMainTab("chat")}
          label={headerLabel}
          title={tabTitle}
          leading={
            providerId ? (
              <ProviderIcon
                providerId={providerId}
                className="size-3.5 shrink-0 text-foreground"
              />
            ) : null
          }
        />
        {openFile && (
          <FileTabButton
            active={activeMainTab === "file"}
            name={openFile.name}
            path={openFile.path}
            dirty={fileDirty}
            onClick={() => setActiveMainTab("file")}
            onClose={closeFileTab}
          />
        )}
      </div>
      <div className="flex-1" />
    </header>
  );
}

function TabButton({
  active,
  onClick,
  label,
  title,
  leading,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  leading?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className={`relative flex max-w-[280px] items-center gap-2 px-3 text-[12px] transition-colors after:pointer-events-none after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:rounded-full after:transition-colors ${
        active
          ? "text-foreground after:bg-foreground"
          : "text-muted-foreground hover:text-foreground after:bg-transparent"
      }`}
    >
      {leading}
      <span className="truncate">{label}</span>
    </button>
  );
}

function FileTabButton({
  active,
  name,
  path,
  dirty,
  onClick,
  onClose,
}: {
  active: boolean;
  name: string;
  path: string;
  dirty: boolean;
  onClick: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className={`group relative flex max-w-[280px] items-center gap-1.5 px-3 text-[12px] transition-colors after:pointer-events-none after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:rounded-full after:transition-colors ${
        active
          ? "text-foreground after:bg-foreground"
          : "text-muted-foreground hover:text-foreground after:bg-transparent"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        title={dirty ? `${path} (unsaved)` : path}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-0"
      >
        <FileIcon name={name} kind="file" />
        <span className="truncate">{name}</span>
        {dirty ? (
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-yellow-300"
          />
        ) : null}
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close file"
        className="relative z-10 rounded p-0.5 opacity-0 transition-opacity hover:bg-foreground/10 group-hover:opacity-100"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
