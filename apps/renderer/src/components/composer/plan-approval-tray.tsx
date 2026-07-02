import { CheckListIcon } from "@hugeicons-pro/core-bulk-rounded";
import { HugeiconsIcon } from "@hugeicons/react";

import type { SessionId } from "@zuse/wire";

import { usePermissionsStore } from "../../store/permissions.ts";
import { TrayPill } from "./tray-pill.tsx";

/**
 * Pinned "Review plan" bar docked above the composer. The proposed plan still
 * renders inline in the chat scrollback (see `ExitPlanModeRow`); this tray only
 * hoists the Approve / Cancel decision down to where the user's cursor already
 * sits, so they don't have to scroll back up to act. Renders nothing unless an
 * `ExitPlanMode` permission request is open for this session.
 */
export function PlanApprovalTray({ sessionId }: { sessionId: SessionId }) {
  const pendingRequest = usePermissionsStore((s) => {
    for (const req of Object.values(s.requestsById)) {
      if (req.sessionId !== sessionId) continue;
      if (req.kind._tag !== "Other") continue;
      if (req.kind.tool !== "ExitPlanMode") continue;
      return req;
    }
    return null;
  });
  const decide = usePermissionsStore((s) => s.decide);

  if (pendingRequest === null) return null;

  return (
    <TrayPill
      flush
      className="bg-rose-500/10 hover:bg-rose-500/15"
      icon={
        <HugeiconsIcon icon={CheckListIcon} strokeWidth={2} className="size-3.5" />
      }
      title="Review plan"
      subtitle="Approve to start building"
      actions={
        <>
          <button
            type="button"
            onClick={() => void decide(pendingRequest.id, { _tag: "Deny" })}
            className="rounded-md px-2.5 py-0.5 text-[12px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              void decide(pendingRequest.id, { _tag: "AllowOnce" })
            }
            className="rounded-md bg-foreground px-2.5 py-0.5 text-[12px] font-medium text-background hover:opacity-90"
          >
            Approve
          </button>
        </>
      }
    />
  );
}
