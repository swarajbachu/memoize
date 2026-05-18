import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import { type IndexHandle } from "./services/index-registry.ts";

/**
 * Build the five Claude-SDK-side MCP tool definitions for the Tier-1
 * index. The descriptions are deliberately blunt — the agent reads these
 * to decide between `code_search` and `Bash(rg)`, so they have to sell
 * the "this is cheaper than grep" pitch in a single sentence each.
 *
 * Phase B: `code_search` routes to symbol lookup. Phase C extends it to
 * BM25 + vector + RRF without changing the tool's externally-visible
 * input/output schema.
 *
 * Every tool short-circuits with a structured "indexing in progress"
 * payload when the handle isn't ready yet. We don't want the agent to
 * see an empty hits array and conclude the symbol doesn't exist — better
 * to nudge it toward `Bash(rg)` until the background reindex completes.
 */

interface IndexingPayload {
  readonly status: "indexing" | "error";
  readonly progress: { readonly processed: number; readonly total: number } | null;
  readonly message: string;
}

const guard = async <T>(
  handle: IndexHandle,
  ready: () => Promise<T>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
  const state = handle.state();
  if (state === "indexing" || state === "idle") {
    // Fetch the latest progress for an informative message. `status()` is a
    // cheap read of the cached snapshot for an already-open DB.
    const snapshot = await handle.status().catch(() => null);
    const payload: IndexingPayload = {
      status: "indexing",
      progress: snapshot?.progress ?? null,
      message:
        "The code index is being built for this workspace. For now, use Bash(rg ...) or Read to navigate; results will become fast once indexing finishes (~30-60s for a typical repo).",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    };
  }
  if (state === "error") {
    const payload: IndexingPayload = {
      status: "error",
      progress: null,
      message:
        "The code index failed to build for this workspace. Fall back to Bash(rg ...) or Read for now — see the server logs for the underlying error.",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    };
  }
  const value = await ready();
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
};

export const buildIndexTools = (handle: IndexHandle) => [
  tool(
    "code_search",
    "Search the indexed codebase by symbol name, code substring, or natural-language query. Prefer this over Bash(rg) — typed-symbol queries return in <5ms with the enclosing function/class chunk, not just a grep line. Use `kind: \"symbol\"` for exact names, `kind: \"semantic\"` for English-language queries.",
    {
      query: z.string().min(1),
      kind: z.enum(["auto", "symbol", "text", "semantic"]).optional(),
      limit: z.number().int().positive().max(20).optional(),
    },
    async (args) =>
      guard(handle, async () => {
        const hits = await handle.search({
          query: args.query,
          kind: args.kind,
          limit: args.limit,
        });
        return { hits };
      }),
  ),

  tool(
    "symbol_lookup",
    "Look up a symbol (function, class, type, const) by exact or prefix name. Returns file paths + line ranges + signatures. Faster than grep for known identifiers and avoids false positives in comments and strings.",
    {
      name: z.string().min(1),
      kind: z.string().optional(),
      limit: z.number().int().positive().max(50).optional(),
    },
    async (args) =>
      guard(handle, async () => {
        const hits = await handle.symbolLookup({
          name: args.name,
          kind: args.kind,
          limit: args.limit,
        });
        return { hits };
      }),
  ),

  tool(
    "find_references",
    "Find every place a named symbol is referenced in the indexed codebase. Returns file paths + line ranges + a one-line context. Use for impact analysis before renaming or modifying an exported function.",
    {
      symbol: z.string().min(1),
      limit: z.number().int().positive().max(100).optional(),
    },
    async (args) =>
      guard(handle, async () => {
        const refs = await handle.findReferences({
          symbol: args.symbol,
          limit: args.limit,
        });
        return { refs };
      }),
  ),

  tool(
    "read_chunk",
    "Read the full content of an indexed chunk by its id. Use after `code_search` or `symbol_lookup` returned a chunk id and you need the body — cheaper than `Read(file_path)` because it's bounded to the chunk's lines (one function, one class, one heading section).",
    {
      chunkId: z.number().int().nonnegative(),
    },
    async (args) =>
      guard(handle, async () => {
        const chunk = await handle.readChunk({ chunkId: args.chunkId });
        return { chunk };
      }),
  ),

  tool(
    "list_module",
    "List every named symbol declared inside one file. Use to understand a module's surface without reading the body — returns name, kind, signature, and start line per symbol.",
    {
      path: z.string().min(1),
    },
    async (args) =>
      guard(handle, async () => {
        const symbols = await handle.listModule({ path: args.path });
        return { symbols };
      }),
  ),
];
