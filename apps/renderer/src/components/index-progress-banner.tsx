import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, Loading02Icon } from "@hugeicons-pro/core-bulk-rounded";
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "~/components/ui/progress";

import { useIndexStore } from "../store/code-index.ts";
import { useWorkspaceStore } from "../store/workspace.ts";

/**
 * Small chip rendered next to {@link UpdateBanner}. Hidden when the index
 * is `idle` or `ready`; shows progress while `indexing`, and a one-line
 * "indexing failed" hint with no progress bar when `error`.
 *
 * The store auto-subscribes per-folder on workspace select; this component
 * is a pure view of `statusByFolder[selectedFolderId]`.
 */
export function IndexProgressBanner() {
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const status = useIndexStore((s) =>
    selectedFolderId !== null ? s.statusByFolder[selectedFolderId] : undefined,
  );

  if (status === undefined) return null;
  if (status.state === "idle" || status.state === "ready") return null;

  const isError = status.state === "error";
  const processed = status.progress?.processed ?? 0;
  const total = status.progress?.total ?? 0;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div
      role="status"
      className="mx-3 mt-2 flex items-center gap-3 rounded-lg border border-border bg-card/70 px-3 py-2 text-[12px] text-muted-foreground shadow-sm backdrop-blur"
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-foreground">
        {isError ? (
          <HugeiconsIcon icon={Alert01Icon} className="size-3.5" />
        ) : (
          <HugeiconsIcon icon={Loading02Icon} className="size-3.5 animate-spin" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-foreground">
          {isError
            ? "Code index failed — agents will fall back to grep."
            : total > 0
              ? `Indexing ${processed}/${total}…`
              : "Indexing…"}
        </span>
        {!isError && total > 0 && (
          <Progress value={percent}>
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
        )}
      </div>
    </div>
  );
}
