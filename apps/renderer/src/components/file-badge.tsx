import { FileIcon } from "./file-icon.tsx";

const basename = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
};

/**
 * Pill that pairs a Material file-type icon with a filename. Used by tool
 * rows (Read, Edit, Write, …) to make a path scannable at a glance and to
 * keep the visual treatment consistent across tools.
 */
export function FileBadge({ path }: { path: string }) {
  const name = basename(path);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-1.5 py-0.5 text-[11px] text-foreground/90"
      title={path}
    >
      <FileIcon
        name={name}
        kind="file"
        className="inline-flex size-3.5 shrink-0 items-center justify-center"
      />
      <span className="truncate font-mono">{name}</span>
    </span>
  );
}
