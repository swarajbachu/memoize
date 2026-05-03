import { ChevronDown, ChevronRight, File, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import { Effect } from "effect";

import type { FolderId, FsEntry } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

type DirState =
  | { status: "loading" }
  | { status: "ready"; entries: ReadonlyArray<FsEntry> }
  | { status: "error"; reason: string };

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

/**
 * Lazy-loading directory tree. Each expanded directory fetches its own
 * one-level listing via `fs.tree`; collapsing forgets the children so the
 * server stays in charge of any new files. Hidden directories like `.git`
 * and `node_modules` are filtered server-side.
 */
export function FileTree({ folderId }: { folderId: FolderId }) {
  const [rootState, setRootState] = useState<DirState>({ status: "loading" });
  const [childStates, setChildStates] = useState<Record<string, DirState>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Reset everything when the project changes — the previous tree's paths
  // wouldn't resolve under the new root.
  useEffect(() => {
    let cancelled = false;
    setRootState({ status: "loading" });
    setChildStates({});
    setExpanded({});
    void (async () => {
      try {
        const client = await getRpcClient();
        const entries = await Effect.runPromise(
          client.fs.tree({ folderId, path: "" }),
        );
        if (cancelled) return;
        setRootState({ status: "ready", entries });
      } catch (err) {
        if (cancelled) return;
        setRootState({ status: "error", reason: formatError(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folderId]);

  const loadChild = async (path: string) => {
    setChildStates((prev) => ({ ...prev, [path]: { status: "loading" } }));
    try {
      const client = await getRpcClient();
      const entries = await Effect.runPromise(
        client.fs.tree({ folderId, path }),
      );
      setChildStates((prev) => ({
        ...prev,
        [path]: { status: "ready", entries },
      }));
    } catch (err) {
      setChildStates((prev) => ({
        ...prev,
        [path]: { status: "error", reason: formatError(err) },
      }));
    }
  };

  const onToggle = (entry: FsEntry) => {
    if (entry.kind !== "directory") return;
    const isOpen = expanded[entry.path] === true;
    setExpanded((prev) => ({ ...prev, [entry.path]: !isOpen }));
    if (!isOpen && childStates[entry.path] === undefined) {
      void loadChild(entry.path);
    }
  };

  if (rootState.status === "loading") {
    return <Empty>Loading…</Empty>;
  }
  if (rootState.status === "error") {
    return <Empty>{rootState.reason}</Empty>;
  }
  if (rootState.entries.length === 0) {
    return <Empty>Empty directory.</Empty>;
  }

  return (
    <ul className="flex flex-col py-1 text-sm">
      {rootState.entries.map((entry) => (
        <TreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          expanded={expanded}
          childStates={childStates}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

function TreeNode({
  entry,
  depth,
  expanded,
  childStates,
  onToggle,
}: {
  entry: FsEntry;
  depth: number;
  expanded: Record<string, boolean>;
  childStates: Record<string, DirState>;
  onToggle: (entry: FsEntry) => void;
}) {
  const isDir = entry.kind === "directory";
  const isOpen = isDir && expanded[entry.path] === true;
  const child = isOpen ? childStates[entry.path] : undefined;
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  const Icon = isDir ? Folder : File;

  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(entry)}
        disabled={!isDir}
        title={entry.path}
        style={{ paddingLeft: 8 + depth * 12 }}
        className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left transition-colors ${
          isDir
            ? "hover:bg-sidebar-accent/60"
            : "cursor-default text-muted-foreground"
        }`}
      >
        {isDir ? (
          <Chevron className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="inline-block w-3.5 shrink-0" />
        )}
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs">{entry.name}</span>
      </button>
      {isOpen && child !== undefined && (
        <ChildList state={child} depth={depth + 1} expanded={expanded} childStates={childStates} onToggle={onToggle} />
      )}
    </li>
  );
}

function ChildList({
  state,
  depth,
  expanded,
  childStates,
  onToggle,
}: {
  state: DirState;
  depth: number;
  expanded: Record<string, boolean>;
  childStates: Record<string, DirState>;
  onToggle: (entry: FsEntry) => void;
}) {
  if (state.status === "loading") {
    return (
      <p
        className="px-2 py-0.5 text-[10px] text-muted-foreground"
        style={{ paddingLeft: 8 + depth * 12 + 18 }}
      >
        Loading…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p
        className="px-2 py-0.5 text-[10px] text-red-300"
        style={{ paddingLeft: 8 + depth * 12 + 18 }}
      >
        {state.reason}
      </p>
    );
  }
  if (state.entries.length === 0) {
    return (
      <p
        className="px-2 py-0.5 text-[10px] text-muted-foreground"
        style={{ paddingLeft: 8 + depth * 12 + 18 }}
      >
        Empty
      </p>
    );
  }
  return (
    <ul>
      {state.entries.map((entry) => (
        <TreeNode
          key={entry.path}
          entry={entry}
          depth={depth}
          expanded={expanded}
          childStates={childStates}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}
