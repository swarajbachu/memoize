/**
 * Cross-encoder rerank provider. The "single highest-leverage component"
 * per the spec — it lifts top-5 NDCG 2-3× over cosine-only retrieval
 * because it scores (query, candidate) jointly instead of independently.
 *
 * Three shipping shapes:
 *   - **NullProvider** (default): no-op, returns the input order. The
 *     fused list is what the agent sees.
 *   - **bge-reranker-v2-m3 ONNX** (local): deferred — ~120MB weights,
 *     wired when the desktop installer pulls them. Same interface, no
 *     callsite change.
 *   - **Voyage / Cohere** (HTTP, BYOK): keytar-stored key, chunks go
 *     user → provider directly. No memoize-cloud in the path.
 */
export interface RerankProvider {
  readonly id: string;
  /**
   * Score every (query, candidate) pair. Returns a score per candidate
   * in the same order; higher = better. The caller does the sort.
   */
  readonly rerank: (
    query: string,
    candidates: ReadonlyArray<string>,
  ) => Promise<ReadonlyArray<number>>;
}

/**
 * The "identity" reranker — preserves the fused order. Used when no
 * paid backend is configured and the local ONNX model isn't loaded.
 * Returns descending scores so callers that sort still get the right
 * ordering.
 */
export class NullRerankProvider implements RerankProvider {
  readonly id = "null";
  async rerank(
    _query: string,
    candidates: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<number>> {
    return candidates.map((_, i) => candidates.length - i);
  }
}

let active: RerankProvider = new NullRerankProvider();

export const setRerankProvider = (p: RerankProvider): void => {
  active = p;
};

export const getRerankProvider = (): RerankProvider => active;
