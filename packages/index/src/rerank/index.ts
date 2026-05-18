export {
  NullRerankProvider,
  getRerankProvider,
  setRerankProvider,
  type RerankProvider,
} from "./provider.ts";
export { VoyageRerankProvider } from "./voyage.ts";
export { CohereRerankProvider } from "./cohere.ts";

import { type SearchHit } from "../types.ts";
import { getRerankProvider } from "./provider.ts";

/**
 * Rerank a fused candidate list with the active provider, returning a
 * sorted slice of `topK`. No-ops when the provider is `null` — the
 * input order is preserved and we just slice.
 */
export const applyRerank = async (
  query: string,
  candidates: ReadonlyArray<SearchHit>,
  topK: number,
): Promise<ReadonlyArray<SearchHit>> => {
  const provider = getRerankProvider();
  if (provider.id === "null" || candidates.length <= 1) {
    return candidates.slice(0, topK);
  }
  const scores = await provider.rerank(
    query,
    candidates.map((c) => c.content),
  );
  const paired = candidates.map((c, i) => ({
    hit: c,
    score: scores[i] ?? 0,
  }));
  paired.sort((a, b) => b.score - a.score);
  return paired
    .slice(0, topK)
    .map(({ hit, score }) => ({ ...hit, score, source: "fused" as const }));
};
