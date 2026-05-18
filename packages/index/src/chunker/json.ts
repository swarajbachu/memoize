import { type ParseResult } from "../types.ts";

/**
 * One-shot chunker for JSON. We don't break into per-key chunks — most
 * JSON files (package.json, tsconfig.json) are small enough that the whole
 * file is the right retrieval granularity.
 */
export const jsonChunker = (source: string): ParseResult => {
  const trimmed = source.trim();
  if (trimmed.length === 0) return { chunks: [], symbols: [] };
  const lines = source.split(/\r?\n/);
  return {
    chunks: [
      {
        kind: "window",
        startLine: 1,
        endLine: lines.length,
        content: source,
      },
    ],
    symbols: [],
  };
};
