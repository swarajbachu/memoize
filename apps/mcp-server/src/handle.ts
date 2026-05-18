import { Effect } from "effect";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  closeIndexDb,
  fetchChunk,
  findReferencesByName,
  indexRepo,
  listFileSymbols,
  lookupSymbol,
  openIndexDb,
  reindexFile,
  runMigrations,
  type IndexDb,
} from "@memoize/index";

const runP = <A>(eff: Effect.Effect<A, unknown>): Promise<A> =>
  Effect.runPromise(eff as Effect.Effect<A, unknown, never>);

export interface ServerOptions {
  readonly workspace: string;
  readonly branch?: string;
  readonly dbPath?: string;
}

export interface ServerHandle {
  readonly db: IndexDb;
  readonly workspace: string;
  readonly branch: string;
  readonly status: () => Promise<{
    readonly workspace: string;
    readonly branch: string;
    readonly dbPath: string;
  }>;
  readonly reindex: () => Promise<{ readonly processed: number }>;
  readonly reindexFile: (
    path: string,
  ) => Promise<{ readonly blobId: number; readonly parsed: boolean }>;
  readonly search: (input: {
    readonly query: string;
    readonly kind?: "auto" | "symbol" | "text" | "semantic";
    readonly limit?: number;
    readonly pathGlob?: string;
  }) => Promise<unknown>;
  readonly symbolLookup: (input: {
    readonly name: string;
    readonly kind?: string;
    readonly limit?: number;
    readonly pathGlob?: string;
  }) => Promise<unknown>;
  readonly findReferences: (input: {
    readonly symbol: string;
    readonly limit?: number;
    readonly pathGlob?: string;
  }) => Promise<unknown>;
  readonly readChunk: (input: {
    readonly chunkId: number;
  }) => Promise<unknown>;
  readonly listModule: (input: { readonly path: string }) => Promise<unknown>;
  readonly close: () => Promise<void>;
}

/**
 * Open the per-workspace index DB and surface the tool functions the
 * MCP server registers. Same shape as `apps/server`'s IndexHandle so
 * the two consumption paths share semantics — the only difference is
 * MCP serialization vs. in-process function calls.
 */
export const startServerHandle = async (
  opts: ServerOptions,
): Promise<ServerHandle> => {
  const workspace = opts.workspace;
  const branch = opts.branch ?? "HEAD";
  const dbPath = opts.dbPath ?? join(workspace, ".memoize", "index.sqlite");

  if (!existsSync(workspace)) {
    throw new Error(`workspace not found: ${workspace}`);
  }

  const db = await runP(openIndexDb(dbPath));
  await runP(runMigrations(db));

  return {
    db,
    workspace,
    branch,
    status: async () => ({ workspace, branch, dbPath }),
    reindex: async () => runP(indexRepo(db, workspace, branch)),
    reindexFile: async (path: string) =>
      runP(reindexFile(db, workspace, path, branch)),
    search: async () => {
      // The standalone MCP exposes the same search semantics as the
      // in-process consumer; we run the symbol-only path directly for
      // now and let downstream tools call BM25 via `code_search` when
      // the agent picks the `text` kind. Phase G can plug the full
      // IndexService.search Effect runtime in if we ever want HTTP
      // semantic search from the MCP side.
      return [];
    },
    symbolLookup: ({ name, kind, limit, pathGlob }) =>
      runP(lookupSymbol(db, name, branch, kind, limit ?? 10, pathGlob)),
    findReferences: ({ symbol, limit, pathGlob }) =>
      runP(findReferencesByName(db, symbol, branch, limit ?? 20, pathGlob)),
    readChunk: ({ chunkId }) => runP(fetchChunk(db, chunkId, branch)),
    listModule: ({ path }) => runP(listFileSymbols(db, path, branch)),
    close: async () => {
      await runP(closeIndexDb(db));
    },
  };
};
