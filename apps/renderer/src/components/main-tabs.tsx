import { MessageSquare, X } from "lucide-react";

import { useUiStore } from "../store/ui.ts";
import { FileIcon } from "./file-icon.tsx";

type Props = {
  readonly headerLabel: string;
  readonly headerTitle?: string;
};

/**
 * Top-of-main-pane tab strip. Always renders the Chat tab; the file tab only
 * appears when a file has been opened from the right-side tree. The empty
 * region at the right keeps the macOS window-drag handle alive — the prior
 * static `<header>` did the same with `[-webkit-app-region:drag]`.
 */
export function MainTabs({ headerLabel, headerTitle }: Props) {
  const activeMainTab = useUiStore((s) => s.activeMainTab);
  const setActiveMainTab = useUiStore((s) => s.setActiveMainTab);
  const openFile = useUiStore((s) => s.openFile);
  const closeFileTab = useUiStore((s) => s.closeFileTab);
  const fileDirty = useUiStore((s) => s.fileDirty);

  return (
    <header className="flex h-9 shrink-0 items-stretch border-b border-border [-webkit-app-region:drag]">
      <div className="ml-16 flex items-stretch gap-0.5 [-webkit-app-region:no-drag]">
        <TabButton
          active={activeMainTab === "chat"}
          onClick={() => setActiveMainTab("chat")}
          label={headerLabel}
          title={headerTitle}
          icon={
            <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
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
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className={`flex max-w-[240px] items-center gap-1.5 px-3 text-[11px] transition-colors ${
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      {icon}
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
      className={`group flex max-w-[280px] items-center gap-1.5 px-2 text-[11px] transition-colors ${
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
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
        className="rounded p-0.5 opacity-0 transition-opacity hover:bg-foreground/10 group-hover:opacity-100"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
