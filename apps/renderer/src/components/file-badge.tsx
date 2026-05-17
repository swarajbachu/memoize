import { FileChip } from "./file-chip.tsx";

/**
 * Back-compat wrapper around `FileChip`. Tool rows pass the absolute path
 * the agent saw; the chip uses that as the display string (the tooltip
 * shows the full path) and opens it in the file editor on click.
 */
export function FileBadge({ path }: { path: string }) {
  return <FileChip relPath={path} absPath={path} />;
}
