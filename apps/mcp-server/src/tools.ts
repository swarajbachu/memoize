import { z } from "zod";

import { type ServerHandle } from "./handle.ts";

/**
 * MCP tool registry. We hand-write JSON-Schema fragments (rather than
 * lean on zod-to-json-schema) because the MCP SDK accepts plain JSON
 * Schema and the dependency cost isn't worth it for six tools.
 *
 * Each tool's `handler` does the side-effect; `inputSchema` is what
 * the MCP client (external agent) sees. Outputs are stringified JSON
 * inside `content[0].text` — MCP's text content type.
 */

export interface McpToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly validator: z.ZodTypeAny;
  readonly handler: (input: unknown) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

const asTool = (text: unknown): { content: Array<{ type: "text"; text: string }> } => ({
  content: [{ type: "text", text: JSON.stringify(text, null, 2) }],
});

export const buildTools = (handle: ServerHandle): ReadonlyArray<McpToolDef> => [
  {
    name: "code_search",
    description:
      "Multi-tier search across the indexed codebase. Best for conceptual / multi-file queries. For a known identifier, prefer `symbol_lookup`. For a literal string, prefer Bash(rg) with a path filter. `kind: \"semantic\"` currently degrades to BM25.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        kind: { type: "string", enum: ["auto", "symbol", "text", "semantic"] },
        limit: { type: "integer", minimum: 1, maximum: 20 },
        pathGlob: {
          type: "string",
          description: "SQLite GLOB to scope results, e.g. apps/**.",
        },
      },
      required: ["query"],
    },
    validator: z.object({
      query: z.string(),
      kind: z.enum(["auto", "symbol", "text", "semantic"]).optional(),
      limit: z.number().int().positive().max(20).optional(),
      pathGlob: z.string().optional(),
    }),
    handler: async (raw) => {
      const args = (raw ?? {}) as {
        query: string;
        kind?: string;
        limit?: number;
        pathGlob?: string;
      };
      // Symbol-first: matches the in-process default in apps/server.
      const hits = await handle.symbolLookup({
        name: args.query,
        limit: args.limit ?? 5,
        pathGlob: args.pathGlob,
      });
      return asTool({ hits });
    },
  },
  {
    name: "symbol_lookup",
    description:
      "Look up a known identifier by exact or prefix name. Returns symbolId, chunkId, file, range, and signature. Feed `chunkId` to `read_chunk` to get the body — *not* the `symbolId` (separate namespace).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
        pathGlob: { type: "string" },
      },
      required: ["name"],
    },
    validator: z.object({
      name: z.string(),
      kind: z.string().optional(),
      limit: z.number().int().positive().max(50).optional(),
      pathGlob: z.string().optional(),
    }),
    handler: async (raw) => {
      const args = raw as {
        name: string;
        kind?: string;
        limit?: number;
        pathGlob?: string;
      };
      const hits = await handle.symbolLookup(args);
      return asTool({ hits });
    },
  },
  {
    name: "find_references",
    description:
      "Find every place a named symbol is referenced. Returns paths + line ranges + a one-line context. (Refs extraction is currently phase-gated and may return []; fall back to Bash(rg).)",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        pathGlob: { type: "string" },
      },
      required: ["symbol"],
    },
    validator: z.object({
      symbol: z.string(),
      limit: z.number().int().positive().max(100).optional(),
      pathGlob: z.string().optional(),
    }),
    handler: async (raw) => {
      const args = raw as {
        symbol: string;
        limit?: number;
        pathGlob?: string;
      };
      const refs = await handle.findReferences(args);
      return asTool({ refs });
    },
  },
  {
    name: "read_chunk",
    description:
      "Read the full content of an indexed chunk by id. Cheaper than reading the whole file.",
    inputSchema: {
      type: "object",
      properties: {
        chunkId: { type: "integer", minimum: 0 },
      },
      required: ["chunkId"],
    },
    validator: z.object({ chunkId: z.number().int().nonnegative() }),
    handler: async (raw) => {
      const args = raw as { chunkId: number };
      const chunk = await handle.readChunk(args);
      return asTool({ chunk });
    },
  },
  {
    name: "list_module",
    description: "List every named symbol declared inside one file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
    validator: z.object({ path: z.string() }),
    handler: async (raw) => {
      const args = raw as { path: string };
      const symbols = await handle.listModule(args);
      return asTool({ symbols });
    },
  },
  {
    name: "index_status",
    description:
      "Return the workspace + branch + db path the server is serving. Use to verify the right index is mounted.",
    inputSchema: { type: "object", properties: {} },
    validator: z.object({}),
    handler: async () => asTool(await handle.status()),
  },
];
