import { useCallback } from "react";

import { useAnnotationsStore } from "../../store/annotations.ts";
import { useSessionsStore } from "../../store/sessions.ts";
import type { AnnotationDraft } from "./annotate-overlay.tsx";

/**
 * Returns a stable callback that drops a finished annotation into the focused
 * chat's draft list. The file editor and diff view live in a different pane
 * from the composer, so the target session is resolved from
 * `selectedSessionId` at confirm time. Returns `false` (no-op) when there is
 * no active chat to attach to.
 */
export const useAddAnnotation = (): ((draft: AnnotationDraft) => boolean) =>
  useCallback((draft: AnnotationDraft): boolean => {
    const sessionId = useSessionsStore.getState().selectedSessionId;
    if (sessionId === null) return false;
    useAnnotationsStore.getState().add(sessionId, draft);
    return true;
  }, []);
