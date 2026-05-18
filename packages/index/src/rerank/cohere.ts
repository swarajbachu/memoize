import { type RerankProvider } from "./provider.ts";

/**
 * Cohere rerank-3 over HTTPS. Same BYOK pattern as Voyage — the host
 * resolves the key from keytar and constructs this provider.
 */
export class CohereRerankProvider implements RerankProvider {
  readonly id = "cohere";
  private readonly endpoint = "https://api.cohere.com/v2/rerank";
  constructor(
    private readonly apiKey: string,
    private readonly model: string = "rerank-v3.5",
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
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Cohere rerank ${res.status}: ${await res.text().catch(() => "")}`,
      );
    }
    const json = (await res.json()) as {
      results: Array<{ index: number; relevance_score: number }>;
    };
    const scores = new Array<number>(candidates.length).fill(0);
    for (const r of json.results) {
      if (r.index >= 0 && r.index < scores.length) {
        scores[r.index] = r.relevance_score;
      }
    }
    return scores;
  }
}
