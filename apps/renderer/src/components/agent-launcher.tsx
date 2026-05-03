import { KeyRound, Sparkles } from "lucide-react";
import { useEffect } from "react";

import type { AgentAvailability, ProviderId } from "@forkzero/wire";

import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
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
  const startSdk = useAgentsStore((s) => s.startSdk);
  const openCredentials = useAgentsStore((s) => s.setCredentialsOpen);
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

  const onPickSdk = (avail: AgentAvailability) => {
    if (!avail.sdkConfigured || selected === null) return;
    void startSdk(selected.id, avail.providerId);
  };

  const onOpenCredentials = () => {
    setOpen(false);
    openCredentials(true);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandDialogPopup>
        <Command>
          <CommandPanel>
            <CommandInput placeholder="Run an agent here…" />
            <CommandList>
              <CommandEmpty>No agents available.</CommandEmpty>
              <CommandGroup>
                <CommandGroupLabel>Run agent</CommandGroupLabel>
                {availability.map((avail) => {
                  const installed = avail.cliInstalled;
                  const label = installed
                    ? `${avail.displayName} (CLI)`
                    : `Install ${avail.displayName}`;
                  return (
                    <CommandItem
                      key={`cli-${avail.providerId}`}
                      value={`run-cli-${avail.providerId}-${label}`}
                      onClick={() => onPick(avail)}
                      className={
                        installed ? undefined : "text-muted-foreground"
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
                {availability.map((avail) => {
                    const ready = avail.sdkConfigured;
                    const label = `${avail.displayName} (SDK)`;
                    return (
                      <CommandItem
                        key={`sdk-${avail.providerId}`}
                        value={`run-sdk-${avail.providerId}-${label}`}
                        onClick={() => {
                          if (ready) {
                            onPickSdk(avail);
                          } else {
                            setOpen(false);
                            openCredentials(true);
                          }
                        }}
                        className={ready ? undefined : "text-muted-foreground"}
                      >
                        <Sparkles className="size-4" />
                        <span className="flex-1">{label}</span>
                        <CommandShortcut>
                          {ready ? "ready" : "set API key"}
                        </CommandShortcut>
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandGroupLabel>Settings</CommandGroupLabel>
                <CommandItem
                  value="settings-credentials"
                  onClick={onOpenCredentials}
                >
                  <KeyRound className="size-4" />
                  <span className="flex-1">Provider credentials…</span>
                  <CommandShortcut>
                    {availability.filter((a) => a.sdkConfigured).length}
                    {" / "}
                    {availability.length}
                  </CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </CommandPanel>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
