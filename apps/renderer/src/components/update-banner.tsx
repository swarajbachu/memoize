import { ArrowUpCircle, CheckCircle2, Download, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

import type { UpdateStatus } from "@memoize/wire";

import { Button } from "~/components/ui/button";
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "~/components/ui/progress";

/**
 * In-app surface for the electron-updater lifecycle. Subscribes to the
 * preload bridge's `updates.onStatus` channel and walks the user through
 * *available → downloading → ready → restart*. Errors and idle states render
 * nothing so a transient network blip on the 6-hour poll never shows a red
 * banner.
 *
 * Renders nothing in dev (where `startAutoUpdater` is gated off in
 * `apps/desktop/src/main.ts`) since `window.memoize.updates` is still wired
 * but no events ever fire.
 */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>({ kind: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const updates = window.memoize?.updates;
    if (!updates) return;
    return updates.onStatus(setStatus);
  }, []);

  // Reset the per-session dismissal whenever a fresh "available" arrives so
  // a *new* update after the user dismissed the previous one re-surfaces.
  useEffect(() => {
    if (status.kind === "available") setDismissed(false);
  }, [status.kind]);

  if (
    dismissed ||
    status.kind === "idle" ||
    status.kind === "checking" ||
    status.kind === "not-available" ||
    status.kind === "error"
  ) {
    return null;
  }

  const onDownload = () => {
    void window.memoize?.updates?.download();
  };
  const onInstall = () => {
    void window.memoize?.updates?.installNow();
  };

  return (
    <div className="mx-3 mb-2 mt-2 flex flex-col gap-2 rounded-2xl bg-alert-warning-bg p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-warning">
          {status.kind === "ready" ? (
            <CheckCircle2 className="size-3.5" />
          ) : status.kind === "downloading" ? (
            <Download className="size-3.5" />
          ) : (
            <ArrowUpCircle className="size-3.5" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[12.5px] font-medium text-foreground">
            {status.kind === "available" &&
              `memoize ${status.version} is available`}
            {status.kind === "downloading" && "Downloading update…"}
            {status.kind === "ready" &&
              `memoize ${status.version} is ready to install`}
          </span>
          <span className="text-[11.5px] leading-snug text-muted-foreground">
            {status.kind === "available" &&
              "Download in the background — you can keep working until it's ready."}
            {status.kind === "downloading" &&
              `${Math.round(status.percent)}%${
                status.bytesPerSecond > 0
                  ? ` · ${formatRate(status.bytesPerSecond)}`
                  : ""
              }`}
            {status.kind === "ready" &&
              "Restart memoize to finish installing. We'll also install on next quit if you'd rather wait."}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
          aria-label="Dismiss update banner"
        >
          Hide
        </button>
      </div>

      {status.kind === "downloading" && (
        <Progress value={status.percent}>
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
      )}

      <div className="flex items-center justify-end gap-1.5">
        {status.kind === "available" && (
          <Button
            size="xs"
            variant="ghost"
            onClick={onDownload}
            className="gap-1.5 rounded-full text-[11px]"
          >
            <Download className="size-3" />
            Download update
          </Button>
        )}
        {status.kind === "downloading" && (
          <Button
            size="xs"
            variant="ghost"
            disabled
            className="gap-1.5 rounded-full text-[11px] text-muted-foreground"
          >
            <RotateCw className="size-3 animate-spin" />
            Downloading
          </Button>
        )}
        {status.kind === "ready" && (
          <Button
            size="xs"
            variant="ghost"
            onClick={onInstall}
            className="gap-1.5 rounded-full text-[11px]"
          >
            <RotateCw className="size-3" />
            Restart now
          </Button>
        )}
      </div>
    </div>
  );
}

function formatRate(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1_000_000) {
    return `${(bytesPerSecond / 1_000_000).toFixed(1)} MB/s`;
  }
  if (bytesPerSecond >= 1_000) {
    return `${(bytesPerSecond / 1_000).toFixed(0)} KB/s`;
  }
  return `${Math.round(bytesPerSecond)} B/s`;
}
