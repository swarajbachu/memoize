import { ArrowUpCircle, Check, Copy, ExternalLink, RotateCw } from "lucide-react";
import { useState } from "react";

import type { ProviderId } from "@memoize/wire";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogViewport,
} from "~/components/ui/dialog";
import { useProvidersStore } from "../store/providers.ts";

// Per-provider docs URL we link from "Read upgrade guide" so users who
// can't (or don't want to) run the one-liner know where to find proper
// install steps for their setup.
const UPGRADE_DOCS_URL: Record<ProviderId, string> = {
  claude: "https://docs.claude.com/en/docs/claude-code/setup",
  codex: "https://github.com/openai/codex#installation",
};

/**
 * Shown when the user tries to start a session against a provider whose
 * locally-installed CLI is older than the SDK we ship against. The card
 * appears *before* the SDK gets a chance to throw its cryptic error so
 * users see an actionable upgrade path instead of a stack trace.
 *
 * Driven by `providers.upgradeRequiredFor`. The `NewSessionButton` flips
 * that flag on click when the chosen provider has
 * `cliVersionStatus === "outdated"` on the availability row.
 */
export function CliUpgradeDialog() {
  const providerId = useProvidersStore((s) => s.upgradeRequiredFor);
  const setProviderId = useProvidersStore((s) => s.setUpgradeRequiredFor);
  const availability = useProvidersStore((s) => s.availability);
  const refresh = useProvidersStore((s) => s.refresh);
  const refreshing = useProvidersStore((s) => s.loading);
  const [copied, setCopied] = useState(false);

  const row =
    providerId === null
      ? null
      : availability.find((a) => a.providerId === providerId) ?? null;

  const open = providerId !== null && row !== null;
  const command = row?.cliUpgradeCommand ?? null;
  const docsUrl = providerId === null ? null : UPGRADE_DOCS_URL[providerId];

  const onCopy = async () => {
    if (command === null) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can fail under strict CSP; the user still sees the
      // command and can select it manually. Don't toast — silently
      // failing here is better than blocking the upgrade path on a
      // permission edge case.
    }
  };

  const onRecheck = async () => {
    await refresh();
    // The store update flows back via the selector above. If the user
    // has actually upgraded, `cliVersionStatus` will flip to `"ok"`
    // and `NewSessionButton`'s next click will pass the gate. We still
    // need to clear the dialog state explicitly — otherwise it stays
    // open until they hit close.
    const latest = useProvidersStore.getState();
    const nextRow = latest.availability.find(
      (a) => a.providerId === providerId,
    );
    if (nextRow?.cliVersionStatus === "ok") {
      setProviderId(null);
    }
  };

  const onOpenDocs = () => {
    if (docsUrl === null) return;
    window.memoize?.app?.openExternal(docsUrl);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setProviderId(null);
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogPopup className="max-w-md" showCloseButton>
            <div className="flex items-start gap-3 px-6 pt-6">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
                <ArrowUpCircle className="size-4" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <DialogTitle className="text-base">
                  Update {row?.displayName ?? "this CLI"}
                </DialogTitle>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  {row?.cliVersion !== undefined
                    ? `You have ${row.cliVersion}.`
                    : "Your installed CLI is older than memoize expects."}
                  {row?.cliVersionMinRequired !== undefined &&
                    ` memoize needs ${row.cliVersionMinRequired} or newer.`}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 px-6 pb-6 pt-4">
              {command !== null ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-black/30 px-3 py-2 font-mono text-[12px]">
                  <code className="truncate text-foreground/90">
                    $ {command}
                  </code>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => void onCopy()}
                    className="h-6 shrink-0 gap-1 rounded-full px-2.5 text-[11px]"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" /> Copy
                      </>
                    )}
                  </Button>
                </div>
              ) : null}

              <p className="text-[11px] text-muted-foreground">
                Run the command in your terminal, then hit Recheck.
              </p>

              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onOpenDocs}
                  disabled={docsUrl === null}
                  className="gap-1.5 rounded-full text-[12px]"
                >
                  <ExternalLink className="size-3.5" />
                  Upgrade guide
                </Button>
                <Button
                  size="sm"
                  onClick={() => void onRecheck()}
                  disabled={refreshing}
                  className="gap-1.5 rounded-full px-4"
                >
                  <RotateCw
                    className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
                  />
                  Recheck
                </Button>
              </div>
            </div>
          </DialogPopup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}
