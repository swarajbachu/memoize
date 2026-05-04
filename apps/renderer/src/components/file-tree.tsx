import { ChevronDown, ChevronRight } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Effect } from "effect";

import type { FolderId, FsEntry } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";
import { useUiStore } from "../store/ui.ts";
import { FileIcon } from "./file-icon.tsx";

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
 *
 * Performance:
 * - Hover-prefetch: pointing at an unloaded directory kicks off `fs.tree` so
 *   by the time the user clicks, the children are usually already in state
 *   and the expand renders synchronously.
 * - `TreeNode` is memoized with a path-aware comparator so toggling one
 *   directory only re-renders the path from root to that directory; closed
 *   siblings (which can dominate large projects) bail out.
 */
export function FileTree({ folderId }: { folderId: FolderId }) {
  const [rootState, setRootState] = useState<DirState>({ status: "loading" });
  const [childStates, setChildStates] = useState<Record<string, DirState>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Mirror state into refs so callbacks can stay stable (and let memoized
  // children skip re-renders driven only by callback identity).
  const childStatesRef = useRef(childStates);
  childStatesRef.current = childStates;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

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

  const loadChild = useCallback(
    async (path: string) => {
      // Idempotent — bail if a fetch is in flight or done. Hover + click can
      // both call this; we only want one round-trip per directory.
      if (childStatesRef.current[path] !== undefined) return;
      setChildStates((prev) =>
        prev[path] !== undefined
          ? prev
          : { ...prev, [path]: { status: "loading" } },
      );
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
    },
    [folderId],
  );

  const openFileInTab = useUiStore((s) => s.openFileInTab);
  const activePath = useUiStore((s) => s.openFile?.path ?? null);

  const onActivate = useCallback(
    (entry: FsEntry) => {
      if (entry.kind === "directory") {
        const isOpen = expandedRef.current[entry.path] === true;
        setExpanded((prev) => ({ ...prev, [entry.path]: !isOpen }));
        if (!isOpen) void loadChild(entry.path);
        return;
      }
      openFileInTab({ folderId, path: entry.path, name: entry.name });
    },
    [folderId, loadChild, openFileInTab],
  );

  const onPrefetch = useCallback(
    (entry: FsEntry) => {
      if (entry.kind !== "directory") return;
      void loadChild(entry.path);
    },
    [loadChild],
  );

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
          onActivate={onActivate}
          onPrefetch={onPrefetch}
          activePath={activePath}
        />
      ))}
    </ul>
  );
}

type TreeNodeProps = {
  entry: FsEntry;
  depth: number;
  expanded: Record<string, boolean>;
  childStates: Record<string, DirState>;
  onActivate: (entry: FsEntry) => void;
  onPrefetch: (entry: FsEntry) => void;
  activePath: string | null;
};

const TreeNode = memo(
  function TreeNodeImpl({
    entry,
    depth,
    expanded,
    childStates,
    onActivate,
    onPrefetch,
    activePath,
  }: TreeNodeProps) {
    const isDir = entry.kind === "directory";
    const isOpen = isDir && expanded[entry.path] === true;
    const child = isOpen ? childStates[entry.path] : undefined;
    const Chevron = isOpen ? ChevronDown : ChevronRight;
    const isActive = !isDir && activePath === entry.path;

    return (
      <li>
        <button
          type="button"
          onClick={() => onActivate(entry)}
          onMouseEnter={isDir ? () => onPrefetch(entry) : undefined}
          title={entry.path}
          style={{ paddingLeft: 8 + depth * 12 }}
          className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left hover:bg-sidebar-accent/60 ${
            isActive ? "bg-sidebar-accent text-foreground" : ""
          }`}
        >
          {isDir ? (
            <Chevron className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <span className="inline-block w-3.5 shrink-0" />
          )}
          <FileIcon name={entry.name} kind={entry.kind} expanded={isOpen} />
          <span className="min-w-0 flex-1 truncate text-xs">{entry.name}</span>
        </button>
        {isOpen && child !== undefined && (
          <ChildList
            state={child}
            depth={depth + 1}
            expanded={expanded}
            childStates={childStates}
            onActivate={onActivate}
            onPrefetch={onPrefetch}
            activePath={activePath}
          />
        )}
      </li>
    );
  },
  // Bail when this node's render output can't have changed. Closed siblings
  // dominate every interaction in real projects — letting them skip is the
  // single biggest win.
  (prev, next) => {
    if (
      prev.entry !== next.entry ||
      prev.depth !== next.depth ||
      prev.activePath !== next.activePath ||
      prev.onActivate !== next.onActivate ||
      prev.onPrefetch !== next.onPrefetch
    ) {
      return false;
    }
    const prevOpen = prev.expanded[prev.entry.path] === true;
    const nextOpen = next.expanded[next.entry.path] === true;
    if (prevOpen !== nextOpen) return false;
    if (!nextOpen) {
      // Closed: render doesn't depend on the maps at all.
      return true;
    }
    // Open: subtree may have changed. Map identity is the conservative check
    // — we only get a new ref when something actually mutated.
    return (
      prev.expanded === next.expanded &&
      prev.childStates === next.childStates
    );
  },
);

function ChildList({
  state,
  depth,
  expanded,
  childStates,
  onActivate,
  onPrefetch,
  activePath,
}: {
  state: DirState;
  depth: number;
  expanded: Record<string, boolean>;
  childStates: Record<string, DirState>;
  onActivate: (entry: FsEntry) => void;
  onPrefetch: (entry: FsEntry) => void;
  activePath: string | null;
}) {
  if (state.status === "loading") {
    // Render nothing during the prefetch window — a brief gap reads as
    // instant; a "Loading…" pill flashes on every expand and feels laggy.
    return null;
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
          onActivate={onActivate}
          onPrefetch={onPrefetch}
          activePath={activePath}
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
