import type { SessionId } from "@memoize/wire";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { listItem } from "../../lib/motion.ts";
import { useMessagesStore } from "../../store/messages.ts";
import { QueueChip } from "./queue-chip.tsx";
import { TrayPill } from "./tray-pill.tsx";

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

  // Each row is wrapped in a `motion.div` so it can animate its own height on
  // enter/exit and FLIP-animate its position on reorder (`layout`). The flush
  // separator border moves from the pill to the wrapper: the pill is now its
  // wrapper's last-child, so its own `last:border-b-0` makes it borderless and
  // the wrapper draws the divider instead — identical to the un-animated look.
  // `initial={false}` skips the entrance replay on mount / session-switch;
  // only rows added afterwards animate in.
  return (
    <AnimatePresence initial={false}>
      {showPausedPill ? (
        <motion.div
          key="paused"
          layout
          variants={listItem}
          initial="initial"
          animate="animate"
          exit="exit"
          className="overflow-hidden border-b border-border/40 last:border-b-0"
        >
          <TrayPill
            flush
            title="Queue paused because you interrupted"
            actions={
              <button
                type="button"
                onClick={() => void resume(sessionId)}
                className="rounded px-1.5 py-0.5 text-[12px] text-muted-foreground hover:text-foreground"
                aria-label="Resume queued messages"
              >
                Resume
              </button>
            }
          />
        </motion.div>
      ) : null}
      {items.map((item, index) => (
        <motion.div
          key={item.id}
          layout
          variants={listItem}
          initial="initial"
          animate="animate"
          exit="exit"
          className="overflow-hidden border-b border-border/40 last:border-b-0"
        >
          <QueueChip
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
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
