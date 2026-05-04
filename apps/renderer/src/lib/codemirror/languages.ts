import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import type { Extension } from "@codemirror/state";

const extensionFor = (ext: string): Extension | null => {
  switch (ext) {
    case "ts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "js":
    case "cjs":
    case "mjs":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "json":
      return json();
    case "md":
    case "mdx":
    case "markdown":
      return markdown();
    case "html":
    case "htm":
      return html();
    case "css":
    case "scss":
    case "sass":
      return css();
    case "py":
      return python();
    case "rs":
      return rust();
    case "go":
      return go();
    default:
      return null;
  }
};

export const languageForFile = (fileName: string): Extension | null => {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return null;
  return extensionFor(fileName.slice(dot + 1).toLowerCase());
};
