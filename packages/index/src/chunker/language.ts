import { extname } from "node:path";

import { type LanguageId } from "../types.ts";

/**
 * Map a file path to one of the grammars we ship. Anything not in this list
 * falls back to "unknown" and gets indexed as a windowed text chunk (line-N
 * windows, no symbols). The chunker/symbols pipeline doesn't reject unknown
 * — BM25 can still match it.
 */
export const detectLanguage = (path: string): LanguageId => {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".cts":
    case ".mts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".js":
    case ".cjs":
    case ".mjs":
      return "javascript";
    case ".jsx":
      return "jsx";
    case ".json":
    case ".jsonc":
      return "json";
    case ".md":
    case ".mdx":
    case ".markdown":
      return "markdown";
    default:
      return "unknown";
  }
};
