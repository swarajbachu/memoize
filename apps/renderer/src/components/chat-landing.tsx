import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Cancel01Icon, Folder01Icon, FolderAddIcon, SentIcon, Tick01Icon } from "@hugeicons-pro/core-bulk-rounded";
import { useMemo, useRef, useState } from "react";

import { ComposerInput, type FolderId } from "@memoize/wire";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Card, CardPanel } from "~/components/ui/card";
import { Frame, FrameFooter } from "~/components/ui/frame";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { resolveAutoWorktreeId } from "~/lib/auto-worktree";
import { useChatsStore } from "~/store/chats";
import { useMessagesStore } from "~/store/messages";
import { useSessionsStore } from "~/store/sessions";
import { useSettingsStore } from "~/store/settings";
import { useWorkspaceStore } from "~/store/workspace";
import { ChatCreatingPanel } from "./chat-creating-panel.tsx";
import { ModelPicker } from "./model-picker.tsx";

const SUGGESTIONS: ReadonlyArray<{ label: string }> = [
  { label: "Land targeted provider compatibility rules before the next harness drift" },
  { label: "Bring background activity policy onto main to cut reconnect churn" },
  { label: "Use the new resource history to finish the leak investigation" },
  { label: "Plan the next slice — what should we tackle first?" },
];

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 240;

/**
 * Landing surface shown in the main pane whenever no chat session is
 * selected — including cold start, after archiving the active session, and
 * for fresh users who haven't typed anything yet.
 *
 * Renders a centered "What should we build in <project>?" headline above a
 * mini composer + project picker + starter-prompt list. On submit we call
 * `useChatsStore.create()` with the typed text as `initialPrompt`; the
 * chat store auto-selects the new session, which causes `MainShell` to
 * swap this surface for `<ChatView />` + `<ChatComposer />` on the next
 * render.
 */
export function ChatLanding() {
  const folders = useWorkspaceStore((s) => s.folders);
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const selectFolder = useWorkspaceStore((s) => s.select);
  const addFolder = useWorkspaceStore((s) => s.add);

  const defaultProviderId = useSettingsStore((s) => s.defaultProviderId);
  const defaultModelByProvider = useSettingsStore(
    (s) => s.defaultModelByProvider,
  );
  const defaultRuntimeMode = useSettingsStore((s) => s.defaultRuntimeMode);
  const defaultAutoCreateWorktree = useSettingsStore(
    (s) => s.defaultAutoCreateWorktree,
  );

  const create = useChatsStore((s) => s.create);
  const creating = useChatsStore((s) =>
    selectedFolderId !== null ? s.creatingByProject[selectedFolderId] === true : false,
  );

  const [text, setText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Snapshot of the prompt the user just submitted. Drives the
  // ChatCreatingPanel preview so the form can be hidden during the RPC
  // without the user losing visual continuity with what they sent.
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedFolder = useMemo(
    () =>
      selectedFolderId === null
        ? null
        : (folders.find((f) => f.id === selectedFolderId) ?? null),
    [folders, selectedFolderId],
  );

  const headline = selectedFolder
    ? `What should we build in ${selectedFolder.name}?`
    : "What should we build today?";

  const onPick = (folderId: FolderId) => {
    void selectFolder(folderId);
  };
  const onAdd = () => {
    void addFolder();
  };

  const canSend =
    text.trim().length > 0 && selectedFolderId !== null && !creating;

  const submit = async (): Promise<void> => {
    if (!canSend || selectedFolderId === null) return;
    const trimmed = text.trim();
    const model = defaultModelByProvider[defaultProviderId];
    setSubmitError(null);
    setPendingPrompt(trimmed);
    // Spin up the worktree before creating the chat so the session runs in
    // it — without this the landing screen promised a worktree (see the
    // ChatCreatingPanel below) but stranded the agent in the main checkout.
    const worktreeId = await resolveAutoWorktreeId(selectedFolderId);
    const result = await create(selectedFolderId, defaultProviderId, model, {
      runtimeMode: defaultRuntimeMode,
      worktreeId,
    });
    if (result === null) {
      const reason =
        useChatsStore.getState().error ??
        `Couldn't start ${defaultProviderId}. Check that its CLI is installed and signed in.`;
      setSubmitError(reason);
      setPendingPrompt(null);
      return;
    }
    const sessionId = useSessionsStore.getState().selectedSessionId;
    if (sessionId !== null) {
      const input = new ComposerInput({
        text: trimmed,
        attachments: [],
        fileRefs: [],
        skillRefs: [],
      });
      useMessagesStore.getState().queue(sessionId, input);
      useMessagesStore.getState().flushQueue(sessionId);
    }
    setText("");
    // Don't clear pendingPrompt — the parent will unmount us when the
    // view swaps to ChatView, so the panel keeps animating until then.
  };

  const onSuggest = (prompt: string) => {
    setText(prompt);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const el = textareaRef.current;
      if (el !== null) {
        el.selectionStart = el.value.length;
        el.selectionEnd = el.value.length;
      }
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <h1 className="text-center text-xl font-medium text-foreground/90">
          {headline}
        </h1>

        {submitError !== null && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-500/[0.08] px-3 py-2 text-[12px] text-rose-200">
            <span className="mt-px shrink-0">⚠</span>
            <span className="flex-1 leading-snug">{submitError}</span>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              aria-label="Dismiss error"
              className="-mr-1 shrink-0 rounded p-0.5 text-rose-200/80 hover:bg-rose-500/[0.12] hover:text-rose-100"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          </div>
        )}

        {creating && pendingPrompt !== null ? (
          <div className="px-1">
            <ChatCreatingPanel
              providerId={defaultProviderId}
              willCreateWorktree={defaultAutoCreateWorktree}
              prompt={pendingPrompt}
            />
          </div>
        ) : (
          <>
            <Frame>
              <Card className="rounded-xl border-border/50">
                <CardPanel className="relative flex flex-col gap-2 px-3 py-2">
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (submitError !== null) setSubmitError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submit();
                      }
                    }}
                    placeholder={
                      selectedFolder
                        ? "Ask anything. Press Enter to start a new session."
                        : "Pick a project below, then ask anything."
                    }
                    style={{ minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
                    className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <div className="flex items-center justify-end">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="default"
                            size="icon-sm"
                            onClick={() => void submit()}
                            disabled={!canSend}
                            aria-label="Send"
                          >
                            <HugeiconsIcon icon={SentIcon} className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipPopup>
                        {selectedFolderId === null
                          ? "Pick a project to start"
                          : "Send (Enter)"}
                      </TooltipPopup>
                    </Tooltip>
                  </div>
                </CardPanel>
              </Card>
              <FrameFooter className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-muted-foreground">
                <ProjectPicker
                  folders={folders}
                  selectedFolderId={selectedFolderId}
                  selectedName={selectedFolder?.name ?? null}
                  onPick={onPick}
                  onAdd={onAdd}
                />
                <ModelPicker mode="default" />
              </FrameFooter>
            </Frame>

            <ul className="flex flex-col divide-y divide-border/30 overflow-hidden rounded-xl border border-border/30 bg-background/40">
              {SUGGESTIONS.map((s) => (
                <li key={s.label}>
                  <button
                    type="button"
                    onClick={() => onSuggest(s.label)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-foreground/80 hover:bg-muted/40"
                  >
                    <span className="text-muted-foreground">›</span>
                    <span className="truncate">{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function ProjectPicker({
  folders,
  selectedFolderId,
  selectedName,
  onPick,
  onAdd,
}: {
  folders: ReturnType<typeof useWorkspaceStore.getState>["folders"];
  selectedFolderId: FolderId | null;
  selectedName: string | null;
  onPick: (folderId: FolderId) => void;
  onAdd: () => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-foreground hover:bg-muted/60 data-[popup-open]:bg-muted/60"
        aria-label="Pick a project"
      >
        <HugeiconsIcon icon={Folder01Icon} className="size-3.5" />
        <span>{selectedName ?? "Pick a project"}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup side="top" align="start" className="w-64 p-1">
        {folders.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No projects yet.
          </div>
        ) : (
          folders.map((folder) => {
            const active = folder.id === selectedFolderId;
            return (
              <MenuItem
                key={folder.id}
                onClick={() => onPick(folder.id)}
                className={cn(
                  "grid grid-cols-[1rem_auto_1fr] items-center gap-x-2 rounded-md px-2 py-1.5 text-sm",
                  active
                    ? "bg-accent/40 text-accent-foreground data-highlighted:bg-accent/60"
                    : undefined,
                )}
              >
                <span className="col-start-1 row-start-1 flex items-center justify-center">
                  {active && <HugeiconsIcon icon={Tick01Icon} className="size-3.5 opacity-90" />}
                </span>
                <HugeiconsIcon icon={Folder01Icon} className="col-start-2 row-start-1 size-3.5 opacity-80" />
                <span className="col-start-3 row-start-1 truncate">
                  {folder.name}
                </span>
              </MenuItem>
            );
          })
        )}
        <MenuSeparator />
        <MenuItem
          onClick={onAdd}
          className="grid grid-cols-[1rem_auto_1fr] items-center gap-x-2 rounded-md px-2 py-1.5 text-sm"
        >
          <span className="col-start-1 row-start-1" />
          <HugeiconsIcon icon={FolderAddIcon} className="col-start-2 row-start-1 size-3.5 opacity-80" />
          <span className="col-start-3 row-start-1">Add new project</span>
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
