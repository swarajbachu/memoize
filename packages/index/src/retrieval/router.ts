export type Tier = "symbol" | "bm25" | "vector";

const SYMBOLISH = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CODE_TOKENS = /[{}();=]|=>|\bimport\b/;

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "what",
  "where",
  "how",
  "when",
  "who",
  "which",
  "why",
  "is",
  "are",
  "of",
  "to",
  "in",
  "on",
]);

const isNaturalLanguage = (q: string): boolean => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  return words.some((w) => STOPWORDS.has(w));
};

const looksLikeSymbol = (q: string): boolean => {
  if (!SYMBOLISH.test(q.trim())) return false;
  return q.trim().length >= 2;
};

const looksLikeCode = (q: string): boolean => CODE_TOKENS.test(q);

/**
 * Classify a search query into the tiers we should run. Cheaper tiers
 * skip rerank entirely; expensive tiers fuse via RRF.
 *
 *   "IndexService"            → [symbol]                — Tier 1 only
 *   "func({...})"             → [symbol, bm25]          — Tier 1+2
 *   "where does the X live?"  → [bm25, vector]          — Tier 3
 *   "wirePtyResize"           → [symbol]                — exact name
 *   anything else             → [symbol, bm25, vector]  — fan-out
 */
export const route = (query: string, override?: string): ReadonlyArray<Tier> => {
  if (override === "symbol") return ["symbol"];
  if (override === "text") return ["bm25"];
  if (override === "semantic") return ["bm25", "vector"];
  if (looksLikeSymbol(query)) return ["symbol"];
  if (looksLikeCode(query)) return ["symbol", "bm25"];
  if (isNaturalLanguage(query)) return ["bm25", "vector"];
  return ["symbol", "bm25", "vector"];
};
