import { Context, type Effect } from "effect";

import { type IndexStatus } from "@memoize/index";

/**
 * Per-process registry of `IndexService` instances, keyed by absolute
 * workspace root. Sessions resolve a `(cwd, branch)` to a fully-constructed
 * IndexService here so the same SQLite handle and migrations are reused
 * across every session pointed at the same checkout.
 *
 * Construction is lazy — opening a workspace doesn't index it; the first
 * call to `getHandle(...)` opens the DB and runs migrations, and
 * `reindex(...)` is the explicit trigger that walks the tree.
 */
export interface IndexRegistryShape {
  /**
   * Resolve a session's `(cwd, branch)` to an active handle. Returns a
   * thin object with the four read methods + a `reindex` trigger; the
   * underlying service is cached so subsequent calls reuse the same DB.
   */
  readonly getHandle: (
    root: string,
    branch: string,
  ) => Effect.Effect<IndexHandle>;
}

export interface IndexHandle {
  readonly status: () => Promise<IndexStatus>;
  readonly reindex: () => Promise<IndexStatus>;
  readonly symbolLookup: (input: {
    name: string;
    kind?: string;
    limit?: number;
  }) => Promise<unknown>;
  readonly findReferences: (input: {
    symbol: string;
    limit?: number;
  }) => Promise<unknown>;
  readonly readChunk: (input: { chunkId: number }) => Promise<unknown>;
  readonly listModule: (input: { path: string }) => Promise<unknown>;
  readonly search: (input: {
    query: string;
    kind?: "auto" | "symbol" | "text" | "semantic";
    limit?: number;
  }) => Promise<unknown>;
}

export class IndexRegistry extends Context.Tag("memoize/IndexRegistry")<
  IndexRegistry,
  IndexRegistryShape
>() {}
