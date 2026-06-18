import { ArrowRight01Icon } from "@hugeicons-pro/core-bulk-rounded";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";

import type { Chat } from "@memoize/wire";

import { isChatUnread, useChatsStore } from "../store/chats.ts";
import { Button } from "./ui/button";

/**
 * Sits just above the composer. Jumps to the freshest chat with unread
 * activity, across every project — only renders when something other than
 * the current chat is unread. `select` switches the workspace project if
 * needed, lands on the chat's active tab, and marks it read, so repeated
 * clicks walk through the unread set. Renders nothing (no wrapper, no
 * reserved space) when there's nothing unread.
 */
export function NextUnreadButton() {
  const chatsByProject = useChatsStore((s) => s.chatsByProject);
  const selectedChatId = useChatsStore((s) => s.selectedChatId);
  const selectChat = useChatsStore((s) => s.select);

  const nextUnread = useMemo(() => {
    let best: Chat | null = null;
    let bestTs = -1;
    for (const list of Object.values(chatsByProject)) {
      for (const chat of list) {
        if (!isChatUnread(chat, selectedChatId)) continue;
        const ts = chat.lastMessageAt?.getTime() ?? 0;
        if (ts > bestTs) {
          best = chat;
          bestTs = ts;
        }
      }
    }
    return best;
  }, [chatsByProject, selectedChatId]);

  if (nextUnread === null) return null;

  return (
    <div className="flex justify-end px-3 pb-1.5">
      <Button
        variant="outline"
        size="xs"
        className="text-muted-foreground"
        onClick={() => selectChat(nextUnread.id)}
        title="Jump to the next chat with unread activity"
      >
        Next unread
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
      </Button>
    </div>
  );
}
