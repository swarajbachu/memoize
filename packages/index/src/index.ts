/**
 * Public surface of @memoize/index. Two consumers: apps/server (in-process)
 * and apps/mcp-server (over MCP). Both build a Layer with their workspace
 * paths injected via {@link IndexConfigTag} and consume {@link IndexService}.
 */
export { IndexService, type IndexServiceShape } from "./api.ts";
export {
  IndexConfigTag,
  IndexServiceLive,
  type IndexConfig,
} from "./service.ts";
export {
  IndexDbError,
  IndexIoError,
  IndexParseError,
  IndexUnsupportedLanguageError,
  type IndexError,
} from "./errors.ts";
export type {
  BlobRecord,
  ChunkContent,
  ChunkKind,
  ChunkRecord,
  IndexStatus,
  LanguageId,
  ManifestEntry,
  ParsedChunk,
  ParsedSymbol,
  ParseResult,
  RefHit,
  RefRecord,
  SearchHit,
  SearchInput,
  SymbolHit,
  SymbolKind,
  SymbolRecord,
  SymbolSummary,
} from "./types.ts";

// Internal helpers exposed for the test harness and the upcoming
// apps/mcp-server scaffold (Phase F builds its own Layer using these
// without going through Effect Service composition).
export { blakeOf, hexOf } from "./blob/hash.ts";
export { detectLanguage } from "./chunker/language.ts";
export { chunkSource } from "./chunker/index.ts";
export { openIndexDb, closeIndexDb } from "./db/sqlite.ts";
export { runMigrations } from "./schema/migrations.ts";
export { indexRepo } from "./indexer.ts";
export { walkRepo } from "./walker.ts";
export {
  lookupSymbol,
  listFileSymbols,
  fetchChunk,
  findReferencesByName,
} from "./retrieval/symbol-lookup.ts";
export {
  setManifestEntry,
  setManifestBulk,
  removeManifestEntry,
  listManifest,
  branchExists,
} from "./manifest/manifest.ts";
