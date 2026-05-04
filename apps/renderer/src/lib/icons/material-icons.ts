// Material Icon Theme integration. We walk the same lookup the VS Code
// extension uses (filename → extension → composite-extension → default) and
// resolve straight to a precomputed URL. Everything is eager-loaded at
// module init so callers get a synchronous URL on the first render — no
// flicker, no dynamic import per row.

import manifestRaw from "material-icon-theme/dist/material-icons.json";

type Manifest = {
  iconDefinitions: Record<string, { iconPath: string }>;
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
  file: string;
  folder: string;
  folderExpanded: string;
};

const manifest = manifestRaw as unknown as Manifest;

// Material Icon Theme delegates many extensions (e.g. `.ts` — also MPEG-TS)
// to VS Code's language service via `languageIds`. We don't have a language
// service, so map common ambiguous extensions explicitly. The manifest's
// `fileExtensions` map handles everything else.
const EXTRA_EXTENSIONS: Record<string, string> = {
  ts: "typescript",
  tsx: "react_ts",
  js: "javascript",
  jsx: "react",
  cjs: "javascript",
  mjs: "javascript",
  html: "html",
  htm: "html",
  yaml: "yaml",
  yml: "yaml",
};

// Eager glob: every icon's URL (data URI for small SVGs, hashed asset URL
// for large ones) is bundled at build time and read synchronously here.
const SVG_URLS = import.meta.glob<string>(
  "/node_modules/material-icon-theme/icons/*.svg",
  { query: "?url", import: "default", eager: true },
);

// Build a single name → URL map keyed by manifest icon name (`typescript`,
// `folder-open`, …) so file/folder lookups are one hop instead of two.
const URL_BY_NAME: Record<string, string> = (() => {
  const byBase: Record<string, string> = {};
  for (const path of Object.keys(SVG_URLS)) {
    const base = path.slice(path.lastIndexOf("/") + 1).replace(/\.svg$/, "");
    byBase[base] = SVG_URLS[path]!;
  }
  const out: Record<string, string> = {};
  for (const [iconName, def] of Object.entries(manifest.iconDefinitions)) {
    const m = /icons\/([^/]+)\.svg/.exec(def.iconPath);
    const url = m ? byBase[m[1]!] : undefined;
    if (url !== undefined) out[iconName] = url;
  }
  return out;
})();

const FILE_FALLBACK = URL_BY_NAME[manifest.file] ?? null;
const FOLDER_FALLBACK = URL_BY_NAME[manifest.folder] ?? null;
const FOLDER_OPEN_FALLBACK = URL_BY_NAME[manifest.folderExpanded] ?? null;

const resolveFileIconName = (fileName: string): string => {
  const lower = fileName.toLowerCase();

  const named = manifest.fileNames[lower] ?? manifest.fileNames[fileName];
  if (named) return named;

  const dot = lower.indexOf(".");
  if (dot === -1) return manifest.file;

  // Walk from the longest composite extension to the shortest so e.g.
  // `foo.test.ts` prefers `test.ts` over `ts` if the manifest has it.
  const parts = lower.slice(dot + 1).split(".");
  for (let i = 0; i < parts.length; i++) {
    const composite = parts.slice(i).join(".");
    const fromExtra = EXTRA_EXTENSIONS[composite];
    if (fromExtra) return fromExtra;
    const fromManifest = manifest.fileExtensions[composite];
    if (fromManifest) return fromManifest;
  }
  return manifest.file;
};

const resolveFolderIconName = (
  folderName: string,
  expanded: boolean,
): string => {
  const map = expanded ? manifest.folderNamesExpanded : manifest.folderNames;
  const lower = folderName.toLowerCase();
  return (
    map[lower] ??
    map[folderName] ??
    (expanded ? manifest.folderExpanded : manifest.folder)
  );
};

export const getFileIconUrl = (fileName: string): string | null =>
  URL_BY_NAME[resolveFileIconName(fileName)] ?? FILE_FALLBACK;

export const getFolderIconUrl = (
  folderName: string,
  expanded: boolean,
): string | null =>
  URL_BY_NAME[resolveFolderIconName(folderName, expanded)] ??
  (expanded ? FOLDER_OPEN_FALLBACK : FOLDER_FALLBACK);
