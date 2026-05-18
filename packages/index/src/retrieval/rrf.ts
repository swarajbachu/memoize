export interface Ranked {
  readonly chunkId: number;
}

/**
 * Reciprocal Rank Fusion — the one-line algorithm that almost always
 * beats a single-source ranker on retrieval.
 *
 *   score(chunk) = Σ_methods 1 / (k + rank_method(chunk))
 *
 * `k = 60` is the canonical default from the original paper and the
 * value Pinecone, Elasticsearch, and Qdrant ship as their out-of-the-box
 * constant. We don't tune it — it's the part you don't need to tune.
 *
 * Returns chunk ids ordered by combined score (highest first). Caller
 * can deref through whatever it wants to materialize content.
 */
export const reciprocalRankFusion = <T extends Ranked>(
  rankings: ReadonlyArray<ReadonlyArray<T>>,
  options: { readonly k?: number } = {},
): ReadonlyArray<{ readonly chunkId: number; readonly score: number }> => {
  const k = options.k ?? 60;
  const scores = new Map<number, number>();
  for (const ranking of rankings) {
    ranking.forEach((hit, i) => {
      const rank = i + 1;
      const prev = scores.get(hit.chunkId) ?? 0;
      scores.set(hit.chunkId, prev + 1 / (k + rank));
    });
  }
  return Array.from(scores.entries())
    .map(([chunkId, score]) => ({ chunkId, score }))
    .sort((a, b) => b.score - a.score);
};
