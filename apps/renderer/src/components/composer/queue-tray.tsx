import type { SessionId } from "@memoize/wire";
import { HugeiconsIcon } from "@hugeicons/react";
import { PauseIcon, PlayIcon } from "@hugeicons-pro/core-bulk-rounded";
import { useState } from "react";

import { useMessagesStore } from "../../store/messages.ts";
import { QueueChip } from "./queue-chip.tsx";
import { TrayPill, trayPillActionClass } from "./tray-pill.tsx";

const EMPTY_QUEUE: ReadonlyArray<never> = [];

export function QueueTray({ sessionId }: { sessionId: SessionId }) {
  const items = useMessagesStore(
    (s) => s.queueBySession[sessionId] ?? EMPTY_QUEUE,
  );
  const paused = useMessagesStore(
    (s) => s.queuePausedBySession[sessionId] === true,
  );
  const running = useMessagesStore(
    (s) => s.runningBySession[sessionId] === true,
  );
  const reorder = useMessagesStore((s) => s.reorderQueue);
  const resume = useMessagesStore((s) => s.resumeQueue);
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

  const showPausedPill = paused && !running;

  return (
    <>
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
      {showPausedPill ? (
        <TrayPill
          flush
          tone="warning"
          icon={<HugeiconsIcon icon={PauseIcon} className="size-3.5" />}
          title="Queue paused"
          subtitle={`${items.length} waiting`}
          actions={
            <button
              type="button"
              onClick={() => void resume(sessionId)}
              className={`${trayPillActionClass} w-auto gap-1 px-1.5 hover:text-foreground`}
              aria-label="Resume queued messages"
            >
              <HugeiconsIcon icon={PlayIcon} className="size-3.5" />
              <span className="text-[11px]">Resume</span>
            </button>
          }
        />
      ) : null}
    </>
  );
}
