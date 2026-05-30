import { PatchDiff } from "@pierre/diffs/react";
import { Effect } from "effect";
import { useEffect, useRef, useState } from "react";

import type { GitDiffResult } from "@memoize/wire";

import { cn } from "~/lib/utils";
import { classifyGit } from "../lib/git-rpc.ts";
import { getRpcClient } from "../lib/rpc-client.ts";
import { GitInitCta } from "./git-init-cta.tsx";
import {
  createEditor,
  languageCompartment,
  reconfigureEditorKeymap,
} from "../lib/codemirror/setup.ts";
import { languageForFile } from "../lib/codemirror/languages.ts";
import { useKeybindingsStore } from "../store/keybindings.ts";
import {
  useUiStore,
  type FileView,
  type OpenFile,
} from "../store/ui.ts";

import type { EditorView } from "@codemirror/view";

type EditorState =
  | { status: "loading" }
  | { status: "text"; size: number }
  | { status: "binary"; size: number }
  | { status: "error"; reason: string };

const formatError = (err: unknown): string => {
  if (typeof err === "object" && err !== null && "_tag" in err) {
    const tag = String((err as { _tag: unknown })._tag);
    if (tag === "FsPathOutsideError") {
      const p =
        "path" in (err as Record<string, unknown>)
          ? String((err as { path: unknown }).path)
          : null;
      return p === null
        ? "This file is outside the current project."
        : `This file is outside the current project (${p}).`;
    }
    if (err instanceof Error) return err.message;
    return tag;
  }
  if (err instanceof Error) return err.message;
  return String(err);
};

const tagOf = (err: unknown): string | null =>
  typeof err === "object" && err !== null && "_tag" in err
    ? String((err as { _tag: unknown })._tag)
    : null;

/**
 * Top-level shell for the file tab in the main pane. Renders a Toolbar with
 * the Diff | Edit segmented control and delegates the body to either a
 * CodeMirror editor or a side-by-side `@pierre/diffs` patch view. Both
 * bodies stay mounted across toggles so unsaved CodeMirror edits survive
 * a quick peek at the diff.
 */
export function FileEditor() {
  const openFile = useUiStore((s) => s.openFile);
  const closeFileTab = useUiStore((s) => s.closeFileTab);

  if (openFile === null) {
    return <Placeholder>No file open.</Placeholder>;
  }

  if (openFile.kind === "image") {
    return <ImageBody src={openFile.src} name={openFile.name} />;
  }

  const view = openFile.view;
  // External files have no git/folder context, so they're edit-only — no diff.
  const isExternal = openFile.kind === "external";
  const path = isExternal ? openFile.absPath : openFile.path;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar path={path} view={view} showViewToggle={!isExternal} />
      <CodeMirrorBody
        openFile={openFile}
        hidden={view !== "edit"}
        onClose={closeFileTab}
      />
      {openFile.kind === "text" && view === "diff" ? (
        <DiffViewBody openFile={openFile} />
      ) : null}
    </div>
  );
}

/**
 * Inline image preview — used for attachment screenshots so clicking the
 * thumbnail keeps the user inside the app rather than punting to the OS
 * handler. No toolbar, no read RPC; the privileged `memoize://` scheme
 * (see `apps/desktop/src/main.ts`) lets the renderer fetch the bytes
 * directly.
 */
function ImageBody({ src, name }: { src: string; name: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/40 p-4">
      <img
        src={src}
        alt={name}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CodeMirror body — loads a file via fs.readFile, mounts the editor once,
// swaps documents on file change. Cmd+S saves via fs.writeFile.
// ---------------------------------------------------------------------------

type EditableFile = Extract<OpenFile, { kind: "text" | "external" }>;

function CodeMirrorBody({
  openFile,
  hidden,
  onClose,
}: {
  openFile: EditableFile;
  hidden: boolean;
  onClose: () => void;
}) {
  const setFileDirty = useUiStore((s) => s.setFileDirty);
  const [state, setState] = useState<EditorState>({ status: "loading" });
  const [conflict, setConflict] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  // Mutable per-file working state. Refs so save/load callbacks stay stable
  // across keystrokes.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const docRef = useRef("");
  const baselineRef = useRef("");
  const mtimeRef = useRef("");
  const savingRef = useRef(false);
  const fileRef = useRef<EditableFile | null>(openFile);
  fileRef.current = openFile;

  const save = async () => {
    const file = fileRef.current;
    if (file === null) return;
    if (savingRef.current) return;
    if (docRef.current === baselineRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const client = await getRpcClient();
      const result =
        file.kind === "external"
          ? await Effect.runPromise(
              client.fs.writeExternalFile({
                path: file.absPath,
                content: docRef.current,
                expectedMtime: mtimeRef.current,
              }),
            )
          : await Effect.runPromise(
              client.fs.writeFile({
                folderId: file.folderId,
                path: file.path,
                content: docRef.current,
                expectedMtime: mtimeRef.current,
                worktreeId: file.worktreeId,
              }),
            );
      mtimeRef.current = result.mtime;
      baselineRef.current = docRef.current;
      setFileDirty(false);
      setConflict(null);
    } catch (err) {
      const tag = tagOf(err);
      if (tag === "FsConflictError" || tag === "FsExternalConflictError") {
        setConflict(
          "File changed on disk. Reload to discard your changes, or keep editing.",
        );
      } else {
        setSaveError(formatError(err));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onSave = () => void saveRef.current();
    const view = createEditor({
      parent: el,
      doc: "",
      language: null,
      onSave,
      onChange: (doc) => {
        docRef.current = doc;
        useUiStore.getState().setFileDirty(doc !== baselineRef.current);
      },
    });
    viewRef.current = view;

    const unsubKeybindings = useKeybindingsStore.subscribe(() => {
      reconfigureEditorKeymap(view, onSave);
    });

    return () => {
      unsubKeybindings();
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setFileDirty(false);
    setConflict(null);
    setSaveError(null);
    void (async () => {
      try {
        const client = await getRpcClient();
        const result =
          openFile.kind === "external"
            ? await Effect.runPromise(
                client.fs.readExternalFile({ path: openFile.absPath }),
              )
            : await Effect.runPromise(
                client.fs.readFile({
                  folderId: openFile.folderId,
                  path: openFile.path,
                  worktreeId: openFile.worktreeId,
                }),
              );
        if (cancelled) return;
        if (result.kind === "binary") {
          setState({ status: "binary", size: result.size });
          return;
        }
        baselineRef.current = result.content;
        docRef.current = result.content;
        mtimeRef.current = result.mtime;
        const view = viewRef.current;
        if (view !== null) {
          view.dispatch({
            changes: {
              from: 0,
              to: view.state.doc.length,
              insert: result.content,
            },
            effects: languageCompartment.reconfigure(
              languageForFile(openFile.name) ?? [],
            ),
            selection: { anchor: 0 },
            scrollIntoView: true,
          });
        }
        setState({ status: "text", size: result.size });
      } catch (err) {
        if (cancelled) return;
        setState({ status: "error", reason: formatError(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openFile, reloadCount, setFileDirty]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      hidden={hidden}
      aria-hidden={hidden}
    >
      {(conflict || saveError) && (
        <Banner
          message={conflict ?? saveError ?? ""}
          actionLabel={conflict ? "Reload" : null}
          onAction={() => setReloadCount((n) => n + 1)}
          onDismiss={() => {
            setConflict(null);
            setSaveError(null);
          }}
        />
      )}
      <SavingIndicator saving={saving} />
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-hidden"
        hidden={state.status !== "text"}
      />
      {state.status === "loading" && <Placeholder>Loading…</Placeholder>}
      {state.status === "binary" && (
        <Placeholder>
          Binary file ({state.size.toLocaleString()} bytes) — preview not
          supported.
        </Placeholder>
      )}
      {state.status === "error" && (
        <Placeholder>
          <span className="text-destructive">{state.reason}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-muted px-2 py-1 text-xs hover:bg-muted/70"
          >
            Close
          </button>
        </Placeholder>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diff body — fetches `git.diff` for the current file and feeds the unified
// patch string to `@pierre/diffs` `PatchDiff`. Handles untracked/deleted/
// binary/unchanged states with placeholders so empty diffs don't surprise.
// ---------------------------------------------------------------------------

type DiffState =
  | { status: "loading" }
  | { status: "ready"; result: GitDiffResult }
  | { status: "error"; reason: string; noRepo: boolean };

function DiffViewBody({
  openFile,
}: {
  openFile: Extract<OpenFile, { kind: "text" }>;
}) {
  const [state, setState] = useState<DiffState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      const client = await getRpcClient();
      const result = await classifyGit(
        client.git.diff({
          folderId: openFile.folderId,
          worktreeId: openFile.worktreeId,
          path: openFile.path,
        }),
      );
      if (cancelled) return;
      if (result.ok) {
        setState({ status: "ready", result: result.value });
      } else {
        setState({
          status: "error",
          reason: result.message,
          noRepo: result.tag === "GitNotARepoError",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openFile.folderId, openFile.worktreeId, openFile.path]);

  if (state.status === "loading") {
    return <Placeholder>Loading diff…</Placeholder>;
  }
  if (state.status === "error") {
    if (state.noRepo) {
      return (
        <Placeholder>
          <GitInitCta
            compact
            folderId={openFile.folderId}
            worktreeId={openFile.worktreeId}
          />
        </Placeholder>
      );
    }
    return (
      <Placeholder>
        <span className="text-destructive">{state.reason}</span>
      </Placeholder>
    );
  }

  const { mode, patch, truncated } = state.result;
  if (mode === "unchanged") {
    return <Placeholder>No changes vs HEAD.</Placeholder>;
  }
  if (mode === "binary") {
    return <Placeholder>Binary file — diff preview not supported.</Placeholder>;
  }
  if (patch.length === 0) {
    return <Placeholder>No diff content.</Placeholder>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {truncated ? (
        <Banner
          message="Diff truncated — file too large to render in full."
          actionLabel={null}
          onAction={() => {}}
          onDismiss={() => {}}
        />
      ) : null}
      <div className="fz-diff min-h-0 flex-1 overflow-auto">
        <PatchDiff patch={patch} disableWorkerPool />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar — path + dirty/saving on the left, Diff/Edit segmented toggle on
// the right. The saving indicator lives inside CodeMirrorBody so it tracks
// the actual save call; the toolbar just shows path + dirty + the toggle.
// ---------------------------------------------------------------------------

function Toolbar({
  path,
  view,
  showViewToggle = true,
}: {
  path: string;
  view: FileView;
  showViewToggle?: boolean;
}) {
  const dirty = useUiStore((s) => s.fileDirty);
  const setOpenFileView = useUiStore((s) => s.setOpenFileView);
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-1 text-[11px] text-muted-foreground">
      <span className="truncate" title={path}>
        {path}
      </span>
      <span className="ml-auto flex items-center gap-2">
        {dirty ? (
          <span className="text-muted-foreground">
            <span className="text-warning">●</span> modified
          </span>
        ) : null}
        {view === "edit" ? (
          <span className="opacity-60">⌘S to save</span>
        ) : null}
        {showViewToggle ? (
          <ViewToggle value={view} onChange={setOpenFileView} />
        ) : null}
      </span>
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: FileView;
  onChange: (v: FileView) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex items-center gap-px rounded-sm border border-border bg-background/60 p-px"
    >
      <ToggleButton
        active={value === "diff"}
        onClick={() => onChange("diff")}
        label="Diff"
      />
      <ToggleButton
        active={value === "edit"}
        onClick={() => onChange("edit")}
        label="Edit"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-[3px] px-1.5 py-[1px] text-[10px] font-medium tracking-wide transition-colors",
        active
          ? "bg-foreground/10 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function SavingIndicator({ saving }: { saving: boolean }) {
  if (!saving) return null;
  return (
    <div className="shrink-0 px-3 py-0.5 text-right text-[10px] text-muted-foreground">
      saving…
    </div>
  );
}

function Banner({
  message,
  actionLabel,
  onAction,
  onDismiss,
}: {
  message: string;
  actionLabel: string | null;
  onAction: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 bg-alert-warning-bg px-3 py-1.5 text-[11px] text-foreground">
      <span className="flex-1 text-muted-foreground">{message}</span>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="rounded bg-accent px-2 py-0.5 text-foreground hover:bg-accent/80"
        >
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded px-1 text-muted-foreground hover:text-foreground"
      >
        ×
      </button>
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}
