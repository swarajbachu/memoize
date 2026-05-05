import { FolderTree, TerminalSquare } from "lucide-react";
import { useState } from "react";

import { useWorkspaceStore } from "../store/workspace.ts";
import { FileTree } from "./file-tree.tsx";
import { RightPaneHeader } from "./right-pane-header.tsx";
import { TerminalPane } from "./terminal-pane.tsx";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "./ui/tooltip.tsx";

type Tab = "files" | "terminal";

/**
 * Right-pane shell with two tabs: project file tree and a single PTY scoped
 * to the active project. Both children mount once and stay mounted (kept
 * via `hidden` toggling) so switching tabs preserves terminal scrollback
 * and the file tree's expanded state.
 */
export function RightPane() {
  const folders = useWorkspaceStore((s) => s.folders);
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const selected = selectedFolderId
    ? (folders.find((f) => f.id === selectedFolderId) ?? null)
    : null;
  const [tab, setTab] = useState<Tab>("files");

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar/60">
      {selected ? <RightPaneHeader projectName={selected.name} /> : null}
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border px-1 text-xs">
        <TabButton
          active={tab === "files"}
          onClick={() => setTab("files")}
          icon={<FolderTree className="size-3.5" />}
          label="Files"
          tooltip="Browse project files"
        />
        <TabButton
          active={tab === "terminal"}
          onClick={() => setTab("terminal")}
          icon={<TerminalSquare className="size-3.5" />}
          label="Terminal"
          tooltip="Open a terminal in the project root"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {selected === null ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No project selected.
          </p>
        ) : (
          <>
            <div
              hidden={tab !== "files"}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <FileTree key={selected.id} folderId={selected.id} />
            </div>
            <div hidden={tab !== "terminal"} className="min-h-0 flex-1">
              <TerminalPane />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  tooltip,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors ${
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            {icon}
            {label}
          </button>
        }
      />
      <TooltipPopup>{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
