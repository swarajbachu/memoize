import type { SessionId } from "@memoize/wire";
import { useState } from "react";

import { useMessagesStore } from "../../store/messages.ts";
import { QueueChip } from "./queue-chip.tsx";

const EMPTY_QUEUE: ReadonlyArray<never> = [];

export function QueueTray({ sessionId }: { sessionId: SessionId }) {
  const items = useMessagesStore(
    (s) => s.queueBySession[sessionId] ?? EMPTY_QUEUE,
  );
  const reorder = useMessagesStore((s) => s.reorderQueue);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  if (items.length === 0) return null;

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    reorder(
      sessionId,
      next.map((q) => q.id),
    );
  };

  return (
    <div className="border-b border-border/40 bg-muted/15">
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>Queue</span>
        <span>{items.length}</span>
      </div>
      {items.map((item, index) => (
        <QueueChip
          key={item.id}
          sessionId={sessionId}
          item={item}
          index={index}
          count={items.length}
          dragging={dragIndex === index}
          onMove={move}
          onDragStart={() => setDragIndex(index)}
          onDragOver={() => {
            if (dragIndex !== null && dragIndex !== index) {
              move(dragIndex, index);
              setDragIndex(index);
            }
          }}
          onDrop={() => setDragIndex(null)}
        />
      ))}
    </div>
  );
}
