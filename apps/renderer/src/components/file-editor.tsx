import { Effect } from "effect";
import { useEffect, useRef, useState } from "react";

import { getRpcClient } from "../lib/rpc-client.ts";
import {
  createEditor,
  languageCompartment,
} from "../lib/codemirror/setup.ts";
import { languageForFile } from "../lib/codemirror/languages.ts";
import { useUiStore, type OpenFile } from "../store/ui.ts";

import type { EditorView } from "@codemirror/view";

type EditorState =
  | { status: "loading" }
  | { status: "text"; size: number }
  | { status: "binary"; size: number }
  | { status: "error"; reason: string };

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

const tagOf = (err: unknown): string | null =>
  typeof err === "object" && err !== null && "_tag" in err
    ? String((err as { _tag: unknown })._tag)
    : null;

export function FileEditor() {
  const openFile = useUiStore((s) => s.openFile);
  const setFileDirty = useUiStore((s) => s.setFileDirty);
  const closeFileTab = useUiStore((s) => s.closeFileTab);

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
  const fileRef = useRef<OpenFile | null>(null);
  fileRef.current = openFile;

  // ---- save: bound to Cmd+S in the editor keymap -------------------------
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
      const result = await Effect.runPromise(
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
      if (tagOf(err) === "FsConflictError") {
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

  // ---- editor lifecycle: build once, swap doc on file change -------------
  // The CodeMirror view stays mounted across file swaps; opening a different
  // file dispatches a single transaction. No DOM teardown, no re-mount cost.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const view = createEditor({
      parent: el,
      doc: "",
      language: null,
      onSave: () => void saveRef.current(),
      onChange: (doc) => {
        docRef.current = doc;
        useUiStore.getState().setFileDirty(doc !== baselineRef.current);
      },
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // ---- load on file change (or explicit reload) --------------------------
  useEffect(() => {
    if (openFile === null) return;
    let cancelled = false;
    setState({ status: "loading" });
    setFileDirty(false);
    setConflict(null);
    setSaveError(null);
    void (async () => {
      try {
        const client = await getRpcClient();
        const result = await Effect.runPromise(
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

  if (openFile === null) {
    return <Placeholder>No file open.</Placeholder>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
      <Toolbar path={openFile.path} saving={saving} />
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
            onClick={closeFileTab}
            className="rounded bg-muted px-2 py-1 text-xs hover:bg-muted/70"
          >
            Close
          </button>
        </Placeholder>
      )}
    </div>
  );
}

function Toolbar({ path, saving }: { path: string; saving: boolean }) {
  const dirty = useUiStore((s) => s.fileDirty);
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
        {saving ? <span>saving…</span> : null}
        <span className="opacity-60">⌘S to save</span>
      </span>
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
