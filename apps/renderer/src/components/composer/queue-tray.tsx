import type { SessionId } from "@memoize/wire";

import { useMessagesStore } from "../../store/messages.ts";
import { QueueChip } from "./queue-chip.tsx";

const EMPTY_QUEUE: ReadonlyArray<never> = [];

export function QueueTray({ sessionId }: { sessionId: SessionId }) {
  const items = useMessagesStore(
    (s) => s.queueBySession[sessionId] ?? EMPTY_QUEUE,
  );
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-border/40 px-2 py-1.5">
      {items.map((item) => (
        <QueueChip key={item.id} sessionId={sessionId} item={item} />
      ))}
    </div>
  );
}
