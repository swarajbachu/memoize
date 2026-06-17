import { Effect, Fiber, Stream } from "effect";
import { useEffect, useRef } from "react";
import { create } from "zustand";

import type { Message, SessionId } from "@memoize/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

type SidebarMessageStatusState = {
  readonly messagesBySession: Record<string, ReadonlyArray<Message>>;
};

export const useSidebarMessageStatusStore =
  create<SidebarMessageStatusState>(() => ({
    messagesBySession: {},
  }));

export function useSidebarMessageStatusSubscriptions(
  sessionIds: ReadonlyArray<SessionId>,
) {
  const fibersRef = useRef<
    Map<SessionId, Fiber.RuntimeFiber<unknown, unknown>>
  >(new Map());
  const idsKey = sessionIds.join(",");

  useEffect(() => {
    const tracked = fibersRef.current;
    const incoming = new Set(sessionIds);
    const toAdd = sessionIds.filter((id) => !tracked.has(id));
    const toRemove = Array.from(tracked.keys()).filter(
      (id) => !incoming.has(id),
    );

    for (const id of toRemove) {
      const fiber = tracked.get(id);
      tracked.delete(id);
      if (fiber !== undefined) {
        void Effect.runPromise(Fiber.interrupt(fiber)).catch(() => {});
      }
    }

    if (toAdd.length === 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const client = await getRpcClient();
        if (cancelled) return;
        for (const id of toAdd) {
          if (tracked.has(id)) continue;
          const fiber = Effect.runFork(
            Stream.runForEach(
              client.messages.stream({ sessionId: id }),
              (message) =>
                Effect.sync(() => {
                  useSidebarMessageStatusStore.setState((s) => {
                    const current = s.messagesBySession[id] ?? [];
                    if (current.some((row) => row.id === message.id)) return s;
                    return {
                      messagesBySession: {
                        ...s.messagesBySession,
                        [id]: [...current, message],
                      },
                    };
                  });
                }),
            ),
          );
          tracked.set(id, fiber);
        }
      } catch {
        // Best-effort sidebar signal; the active chat surface remains canonical.
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    return () => {
      const tracked = fibersRef.current;
      for (const fiber of tracked.values()) {
        void Effect.runPromise(Fiber.interrupt(fiber)).catch(() => {});
      }
      tracked.clear();
    };
  }, []);
}
