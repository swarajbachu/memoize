import { type RerankProvider } from "./provider.ts";

/**
 * Voyage rerank-2.5 over HTTPS. Pay-per-use via the user's own API key.
 * Memoize is **not in the path** — chunks go user → Voyage directly.
 *
 * The key is read once from the constructor; rotation happens by replacing
 * the provider via `setRerankProvider(new VoyageRerankProvider(newKey))`.
 * keytar lookup is the host's job, not this package's.
 */
export class VoyageRerankProvider implements RerankProvider {
  readonly id = "voyage";
  private readonly endpoint = "https://api.voyageai.com/v1/rerank";
  constructor(
    private readonly apiKey: string,
    private readonly model: string = "rerank-2.5",
  ) {}

  async rerank(
    query: string,
    candidates: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<number>> {
    if (candidates.length === 0) return [];
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        query,
        documents: candidates,
        return_documents: false,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Voyage rerank ${res.status}: ${await res.text().catch(() => "")}`,
      );
    }
    const json = (await res.json()) as {
      data: Array<{ index: number; relevance_score: number }>;
    };
    const scores = new Array<number>(candidates.length).fill(0);
    for (const r of json.data) {
      if (r.index >= 0 && r.index < scores.length) {
        scores[r.index] = r.relevance_score;
      }
    }
    return scores;
  }
}
