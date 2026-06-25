import {
  getFileIconUrl,
  getFolderIconUrl,
} from "../lib/icons/material-icons.ts";

type Props = {
  readonly name: string;
  readonly kind: "file" | "directory";
  readonly expanded?: boolean;
  readonly className?: string;
};

// Synchronous render: icon URLs are eager-resolved at module load (see
// lib/icons/material-icons.ts), so the file tree paints icons on first
// render — no useEffect, no dynamic import, no flicker.
export function FileIcon({ name, kind, expanded = false, className }: Props) {
  const url =
    kind === "directory" ? getFolderIconUrl(name, expanded) : getFileIconUrl(name);
  return (
    <span
      className={
        className ?? "inline-flex size-3.5 shrink-0 items-center justify-center"
      }
      aria-hidden="true"
    >
      {url ? (
        <img src={url} alt="" className="size-full" draggable={false} />
      ) : null}
    </span>
  );
}

// dummy change
