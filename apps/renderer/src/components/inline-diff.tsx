import { structuredPatch } from "diff";
import { useMemo } from "react";

export interface FileEdit {
  readonly path: string;
  readonly oldText: string;
  readonly newText: string;
  readonly mode: "edit" | "create";
}

/**
 * Best-effort extraction of a `(path, old, new)` triple from a Claude
 * `Edit` / `Write` / `MultiEdit` tool input. Tools we can't parse fall back
 * to the JSON view at the call site — never throws.
 */
export const extractEdits = (
  tool: string,
  input: unknown,
): ReadonlyArray<FileEdit> => {
  if (input === null || typeof input !== "object") return [];
  const obj = input as Record<string, unknown>;
  const path = typeof obj.file_path === "string" ? obj.file_path : null;

  if (tool === "Edit") {
    if (path === null) return [];
    const oldText = typeof obj.old_string === "string" ? obj.old_string : "";
    const newText = typeof obj.new_string === "string" ? obj.new_string : "";
    return [{ path, oldText, newText, mode: "edit" }];
  }

  if (tool === "Write") {
    if (path === null) return [];
    const newText = typeof obj.content === "string" ? obj.content : "";
    return [{ path, oldText: "", newText, mode: "create" }];
  }

  if (tool === "MultiEdit") {
    if (path === null) return [];
    const edits = Array.isArray(obj.edits) ? obj.edits : [];
    const out: FileEdit[] = [];
    for (const e of edits) {
      if (e === null || typeof e !== "object") continue;
      const r = e as Record<string, unknown>;
      out.push({
        path,
        oldText: typeof r.old_string === "string" ? r.old_string : "",
        newText: typeof r.new_string === "string" ? r.new_string : "",
        mode: "edit",
      });
    }
    return out;
  }

  return [];
};

interface DiffLine {
  readonly kind: "context" | "add" | "del" | "hunk";
  readonly text: string;
  readonly oldLine: number | null;
  readonly newLine: number | null;
}

/**
 * Total +/- line counts across a set of edits, without rendering the diff.
 * For a `Write` (mode === "create") we count every line in newText as an
 * addition and skip subtraction.
 */
export const diffStats = (
  edits: ReadonlyArray<FileEdit>,
): { added: number; removed: number } => {
  let added = 0;
  let removed = 0;
  for (const edit of edits) {
    if (edit.mode === "create") {
      added += edit.newText === "" ? 0 : edit.newText.split("\n").length;
      continue;
    }
    const patch = structuredPatch(
      edit.path,
      edit.path,
      edit.oldText,
      edit.newText,
      "",
      "",
      { context: 0 },
    );
    for (const hunk of patch.hunks) {
      for (const raw of hunk.lines) {
        const m = raw.charAt(0);
        if (m === "+") added += 1;
        else if (m === "-") removed += 1;
      }
    }
  }
  return { added, removed };
};

const buildDiff = (edit: FileEdit): ReadonlyArray<DiffLine> => {
  const patch = structuredPatch(
    edit.path,
    edit.path,
    edit.oldText,
    edit.newText,
    "",
    "",
    { context: 3 },
  );
  const lines: DiffLine[] = [];
  for (const hunk of patch.hunks) {
    lines.push({
      kind: "hunk",
      text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      oldLine: null,
      newLine: null,
    });
    let oldLn = hunk.oldStart;
    let newLn = hunk.newStart;
    for (const raw of hunk.lines) {
      const marker = raw.charAt(0);
      const text = raw.slice(1);
      if (marker === "+") {
        lines.push({ kind: "add", text, oldLine: null, newLine: newLn });
        newLn += 1;
      } else if (marker === "-") {
        lines.push({ kind: "del", text, oldLine: oldLn, newLine: null });
        oldLn += 1;
      } else {
        lines.push({ kind: "context", text, oldLine: oldLn, newLine: newLn });
        oldLn += 1;
        newLn += 1;
      }
    }
  }
  return lines;
};

export function DiffBody({
  edit,
  showHeader,
}: {
  edit: FileEdit;
  showHeader: boolean;
}) {
  const lines = useMemo(() => buildDiff(edit), [edit]);
  if (lines.length === 0) {
    return (
      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
        (no textual change)
      </div>
    );
  }
  return (
    <div className="overflow-x-auto font-mono text-[11px]">
      {showHeader ? (
        <div className="bg-zinc-900/40 px-2 py-1 text-muted-foreground">
          {edit.mode === "create" ? "create" : "edit"} · {edit.path}
        </div>
      ) : null}
      {lines.map((line, idx) => (
        <DiffRow key={idx} line={line} />
      ))}
    </div>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  if (line.kind === "hunk") {
    return (
      <div className="bg-sky-500/10 px-2 py-0.5 text-sky-200">{line.text}</div>
    );
  }
  const bg =
    line.kind === "add"
      ? "bg-emerald-500/10"
      : line.kind === "del"
        ? "bg-red-500/10"
        : "";
  const marker =
    line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
  const markerColor =
    line.kind === "add"
      ? "text-emerald-400"
      : line.kind === "del"
        ? "text-red-400"
        : "text-muted-foreground";
  return (
    <div className={`flex gap-2 px-2 ${bg}`}>
      <span className="w-8 shrink-0 select-none text-right text-muted-foreground">
        {line.oldLine ?? ""}
      </span>
      <span className="w-8 shrink-0 select-none text-right text-muted-foreground">
        {line.newLine ?? ""}
      </span>
      <span className={`w-3 shrink-0 select-none ${markerColor}`}>
        {marker}
      </span>
      <span className="whitespace-pre-wrap break-words">
        {line.text === "" ? " " : line.text}
      </span>
    </div>
  );
}
