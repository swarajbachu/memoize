/**
 * Provider abstraction for embedding text into a vector. Three drop-in
 * shapes ship: `NullProvider` (zero vectors, used when no embedding is
 * configured), a local ONNX provider (deferred — added in Phase D when
 * the desktop build pipeline pulls weights), and HTTP providers for
 * Voyage/OpenAI/Jina (BYOK via keytar). The retrieval layer never
 * branches on provider type — it just calls `embed(...)`.
 */
export interface EmbeddingProvider {
  readonly id: string;
  readonly dim: number;
  /** Embed a batch — returns one Float32Array per input string. */
  readonly embed: (
    texts: ReadonlyArray<string>,
  ) => Promise<ReadonlyArray<Float32Array>>;
}

/**
 * Default zero-vector provider. Vector tier is skipped at retrieval time
 * when this is in effect (router falls back to BM25 + symbol). The
 * `chunk_vec` table never gets rows so a real provider can take over
 * later without conflicting with stale embeddings.
 */
export class NullProvider implements EmbeddingProvider {
  readonly id = "null";
  readonly dim = 768;
  async embed(texts: ReadonlyArray<string>): Promise<ReadonlyArray<Float32Array>> {
    return texts.map(() => new Float32Array(this.dim));
  }
}

let active: EmbeddingProvider = new NullProvider();

/**
 * Swap the active provider. The desktop main process calls this once at
 * boot after constructing whichever provider the user configured. We
 * keep it a module-level singleton instead of a Context.Tag so the
 * embedding worker doesn't need to thread an Effect runtime through
 * its per-batch path.
 */
export const setEmbeddingProvider = (p: EmbeddingProvider): void => {
  active = p;
};

export const getEmbeddingProvider = (): EmbeddingProvider => active;
