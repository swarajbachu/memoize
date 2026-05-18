import { type ParseResult, type ParsedChunk } from "../types.ts";

/**
 * Heading-anchored chunker for markdown. Each `#`/`##`/`###` line begins a
 * new section; the section runs until the next same-or-shallower heading.
 * We don't track symbols for markdown — headings are searchable as content
 * via BM25.
 */
export const markdownChunker = (source: string): ParseResult => {
  const lines = source.split(/\r?\n/);
  if (lines.length === 0) return { chunks: [], symbols: [] };

  const boundaries: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && /^#{1,6}\s/.test(line)) boundaries.push(i);
  }
  if (boundaries.length === 0 || boundaries[0] !== 0) boundaries.unshift(0);
  boundaries.push(lines.length);

  const chunks: ParsedChunk[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    const sliced = lines.slice(start, end).join("\n").trim();
    if (sliced.length === 0) continue;
    chunks.push({
      kind: "section",
      startLine: start + 1,
      endLine: end,
      content: lines.slice(start, end).join("\n"),
    });
  }
  return { chunks, symbols: [] };
};
