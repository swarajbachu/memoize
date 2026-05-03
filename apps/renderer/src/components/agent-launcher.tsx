import { Sparkles } from "lucide-react";
import { useEffect } from "react";

import type { AgentAvailability, ProviderId } from "@forkzero/wire";

import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandShortcut,
} from "~/components/ui/command";
import { useAgentsStore } from "../store/agents.ts";
import { useWorkspaceStore } from "../store/workspace.ts";

const INSTALL_DOCS: Record<ProviderId, string> = {
  claude: "https://docs.claude.com/en/docs/claude-code",
  codex: "https://github.com/openai/codex",
};

export function AgentLauncher() {
  const open = useAgentsStore((s) => s.launcherOpen);
  const setOpen = useAgentsStore((s) => s.setLauncherOpen);
  const refresh = useAgentsStore((s) => s.refresh);
  const availability = useAgentsStore((s) => s.availability);
  const launch = useAgentsStore((s) => s.launch);
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const folders = useWorkspaceStore((s) => s.folders);
  const selected = selectedFolderId
    ? (folders.find((f) => f.id === selectedFolderId) ?? null)
    : null;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Cmd/Ctrl+K toggles the launcher.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useAgentsStore.getState().toggleLauncher();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onPick = (avail: AgentAvailability) => {
    if (!avail.cliInstalled) {
      window.open(INSTALL_DOCS[avail.providerId], "_blank", "noopener");
      return;
    }
    if (selected === null) return;
    launch(selected.id, avail);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandDialogPopup>
        <Command>
          <CommandPanel>
            <CommandInput placeholder="Run an agent here…" />
            <CommandList>
              <CommandEmpty>No agents available.</CommandEmpty>
              {availability.map((avail) => {
                const installed = avail.cliInstalled;
                const label = installed
                  ? `${avail.displayName} (CLI)`
                  : `Install ${avail.displayName}`;
                return (
                  <CommandItem
                    key={avail.providerId}
                    value={`${avail.providerId}-${label}`}
                    onClick={() => onPick(avail)}
                    className={
                      installed
                        ? undefined
                        : "text-muted-foreground"
                    }
                  >
                    <Sparkles className="size-4" />
                    <span className="flex-1">{label}</span>
                    {installed && avail.cliVersion !== undefined && (
                      <CommandShortcut>{avail.cliVersion}</CommandShortcut>
                    )}
                    {!installed && (
                      <CommandShortcut>not installed</CommandShortcut>
                    )}
                  </CommandItem>
                );
              })}
            </CommandList>
          </CommandPanel>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
