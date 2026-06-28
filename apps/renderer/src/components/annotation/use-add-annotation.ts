import { useCallback } from "react";

import type { Annotation, NewAnnotation } from "@memoize/wire";

import { useAnnotationsStore } from "../../store/annotations.ts";
import { useSessionsStore } from "../../store/sessions.ts";

/**
 * Returns a stable callback that drops a finished annotation — a code region
 * (file editor / diff view) or an HTML element/text pick (embedded artifact) —
 * into the focused chat's draft list. The annotation surfaces live in a
 * different pane from the composer, so the target session is resolved from
 * `selectedSessionId` at confirm time. Returns the stored annotation, or
 * `null` when there is no active chat to attach to.
 */
export const useAddAnnotation = (): ((
  draft: NewAnnotation,
) => Annotation | null) =>
  useCallback((draft: NewAnnotation): Annotation | null => {
    const sessionId = useSessionsStore.getState().selectedSessionId;
    if (sessionId === null) return null;
    const id = useAnnotationsStore.getState().add(sessionId, draft);
    return { ...draft, id } as Annotation;
  }, []);
