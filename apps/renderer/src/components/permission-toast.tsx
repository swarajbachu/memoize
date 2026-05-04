import { ShieldAlert, ShieldCheck, ShieldX, Zap } from "lucide-react";
import { useEffect, useMemo } from "react";

import type {
  PermissionDecision,
  PermissionKind,
  PermissionRequest,
  SessionId,
} from "@forkzero/wire";

import { usePermissionsStore } from "../store/permissions.ts";

const kindHeadline = (kind: PermissionKind): string => {
  switch (kind._tag) {
    case "Bash":
      return "Run shell command?";
    case "FileWrite":
      return "Write file?";
    case "Network":
      return "Make network request?";
    case "Other":
      return `Use tool ${kind.tool}?`;
  }
};

const kindDetail = (kind: PermissionKind): string => {
  switch (kind._tag) {
    case "Bash":
      return kind.command;
    case "FileWrite":
      return kind.path;
    case "Network":
      return kind.url;
    case "Other":
      return kind.summary;
  }
};

const ALLOW_ONCE: PermissionDecision = { _tag: "AllowOnce" };
const ALLOW_FOR_SESSION: PermissionDecision = { _tag: "AllowForSession" };
const ALWAYS_ALLOW_FOLDER: PermissionDecision = {
  _tag: "AlwaysAllow",
  scope: "folder",
};
const DENY: PermissionDecision = { _tag: "Deny" };

/**
 * Single-prompt toast docked above the chat timeline. Renders the head of
 * the per-session prompt queue; further requests stack invisibly until the
 * head is decided. ⌘+Enter / Esc are handled at the document level so the
 * user can react without focusing the toast.
 */
export function PermissionToast({ sessionId }: { sessionId: SessionId }) {
  // Select the stable map; derive the per-session list in useMemo. Returning
  // a freshly-allocated filtered array directly from a Zustand selector
  // breaks useSyncExternalStore's snapshot-equality check and triggers an
  // infinite re-render loop.
  const requestsById = usePermissionsStore((s) => s.requestsById);
  const decide = usePermissionsStore((s) => s.decide);
  const hydrate = usePermissionsStore((s) => s.hydrate);

  const requests = useMemo<ReadonlyArray<PermissionRequest>>(() => {
    const out: PermissionRequest[] = [];
    for (const req of Object.values(requestsById)) {
      if (req.sessionId === sessionId) out.push(req);
    }
    out.sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
    return out;
  }, [requestsById, sessionId]);

  // Hydrate pending requests when the session changes — covers the boot
  // case where the global stream missed events that landed before this
  // renderer connected.
  useEffect(() => {
    void hydrate(sessionId);
  }, [sessionId, hydrate]);

  const head: PermissionRequest | undefined = requests[0];

  useEffect(() => {
    if (head === undefined) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void decide(head.id, DENY);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void decide(head.id, ALLOW_ONCE);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [head, decide]);

  if (head === undefined) return null;

  const persistentDisabled = head.forcePrompt;
  const persistentTooltip = persistentDisabled
    ? "Sensitive path — must approve each time"
    : undefined;

  return (
    <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-amber-100">
              {kindHeadline(head.kind)}
            </div>
            <div className="mt-1 break-all rounded bg-zinc-950/40 px-2 py-1 font-mono text-xs text-amber-50">
              {kindDetail(head.kind)}
            </div>
            {head.forcePrompt ? (
              <div className="mt-1 text-[11px] text-amber-200/80">
                Sensitive path — &quot;Allow for session&quot; and &quot;Always
                allow&quot; are disabled here.
              </div>
            ) : null}
          </div>
          {requests.length > 1 ? (
            <span className="rounded bg-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-100">
              +{requests.length - 1} more
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void decide(head.id, DENY)}
            className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
            title="Esc"
          >
            <ShieldX className="size-3.5" />
            Deny
          </button>
          <button
            type="button"
            disabled={persistentDisabled}
            onClick={() => void decide(head.id, ALLOW_FOR_SESSION)}
            className="flex items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-900/40 px-2.5 py-1 text-xs text-emerald-100 hover:bg-emerald-900/70 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-900/40"
            title={persistentTooltip}
          >
            <ShieldCheck className="size-3.5" />
            Allow for session
          </button>
          <button
            type="button"
            disabled={persistentDisabled}
            onClick={() => void decide(head.id, ALWAYS_ALLOW_FOLDER)}
            className="flex items-center gap-1.5 rounded-md border border-violet-700 bg-violet-900/40 px-2.5 py-1 text-xs text-violet-100 hover:bg-violet-900/70 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-violet-900/40"
            title={persistentTooltip}
          >
            <Zap className="size-3.5" />
            Always allow in project
          </button>
          <button
            type="button"
            onClick={() => void decide(head.id, ALLOW_ONCE)}
            className="flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1 text-xs font-medium text-emerald-950 hover:bg-emerald-400"
            title="⌘+Enter"
          >
            <ShieldCheck className="size-3.5" />
            Allow once
          </button>
        </div>
      </div>
    </div>
  );
}
