# ADR 0016 — Hybrid retrieval over pure vector

Date: 2026-05-06
Status: Accepted

## Context

The popular framing of "code search via vector DB" assumes embeddings
alone are the right retrieval method. They aren't, on code. Published
benchmarks (BEIR, CodeSearchNet, custom evaluations from Sourcegraph and
Cursor) consistently show:

- **BM25 alone** beats embeddings alone on identifier-heavy queries
  (function names, type names, file paths) — a huge slice of what agents
  actually search for.
- **Embeddings alone** beat BM25 on conceptual / paraphrased queries
  ("code that handles retries on a 503").
- **Symbol lookup** (exact-name SQL match against a symbols table) beats
  both for the ~60% of agent queries that already know the name.
- **Reciprocal Rank Fusion + cross-encoder rerank** of BM25 + vector
  candidates outperforms either retrieval method alone by 15–25% on
  NDCG@10, and outperforms vector + rerank by 8–12%.

The rerank step is the highest-leverage component: a cross-encoder scores
each (query, chunk) pair properly, which is 5–10× more accurate than
embedding cosine similarity but too slow to run at retrieval time. Run on
top-50 fused candidates, it lifts top-5 quality 2–3×.

Pure-vector pitches "we have a vector DB" — but what wins is
*architectural fit*: route to the right method per query, fuse, rerank.

## Decision

Build a **3-tier hybrid retrieval pipeline**:

```
Tier 1 — Symbol lookup (SQL on symbols table)
Tier 2 — BM25 (SQLite FTS5, trigram tokenizer)
Tier 3 — Vector (sqlite-vec) + RRF fusion + cross-encoder rerank
```

A query router classifies the query and picks tiers:

```
looksLikeSymbol(q)    → Tier 1 only             (~60% of agent queries)
looksLikeCode(q)      → Tier 1 + Tier 2         (~20%)
isNaturalLanguage(q)  → Tier 3                  (~20%)
ambiguous             → all three, fused
```

### Reciprocal Rank Fusion

```
fused_score(chunk) = Σ_methods 1 / (k + rank_method(chunk))
```

`k = 60` per the original RRF paper. One-line algorithm, hard to beat.
Combines BM25 and vector candidates without needing them to share a
score scale.

### Cross-encoder rerank

After fusion returns top-20, rerank with a cross-encoder
(bge-reranker-v2-m3 by default; pluggable to Voyage / Cohere). The
reranker scores each (query, chunk_text) pair; output is reordered by
relevance score.

Rerank is **always on for Tier 3**. For Tier 1 and Tier 1+2 paths,
results are already exact-match shaped — rerank skipped to save latency.

### Why not pure vector?

- 60–70% of agent queries are exact-name lookups. Embeddings approximate
  this with cosine similarity; SQL exact-match nails it in <1ms with no
  embedding model needed.
- BM25 is free (FTS5 is built into SQLite), fast (5ms), and excellent at
  identifier-heavy queries.
- Vector adds the conceptual recall that BM25 misses. Combined with
  rerank, this is where the lift comes from — but vector alone leaves
  the ~80% Tier 1 + Tier 2 wins on the table.

### Why not skip rerank?

- The reranker is the single highest-leverage component. Top-5 quality
  goes from "okay" to "consistently right." Tokens-per-task budget
  depends on this — a wrong top-5 means the agent issues another query
  and we're back to grep-tax cost.

## Consequences

### Positive

- Each tier handles what it's best at. No method is asked to do
  everything.
- Tier 1 latency (<1ms) handles the bulk of queries — no embedding
  inference needed for most agent calls.
- Search works **before embeddings exist**: chunks not yet embedded fall
  back to BM25. The system is graceful under partial-index conditions.
- Adding a new method (graph-based, e.g.) is dropping in a new tier
  without rewriting.

### Negative

- More moving parts than pure vector. Three retrieval methods, a router,
  a fuser, a reranker.
- Router heuristics need maintenance — we'll discover query shapes that
  misclassify and need to add cases.
- Local rerank model adds ~120MB of weights. Acceptable for desktop;
  documented in ADR 0020.

## Alternatives considered

### Pure vector (Cosine on embeddings only)

- Pro: simplest mental model.
- Con: leaves 60–70% of queries on the table (Tier 1 wins). And without
  rerank, top-5 quality is 20% worse on NDCG.

### BM25 only

- Pro: zero infra cost, comes free with SQLite.
- Con: misses conceptual queries entirely. Agents asking "how is auth
  retried" get nothing useful.

### Vector + rerank, no symbol lookup

- Pro: simpler than three tiers.
- Con: every agent query pays embedding-inference + rerank cost, even
  when a SQL `WHERE name = ?` would have answered in 1ms. Wastes
  latency and burns embedding API credits unnecessarily for BYOK users.

### Let the agent pick the tier

- Pro: agent has more context about what it wants.
- Con: agents are bad at picking — they default to "search everything"
  or guess the wrong tier. Better to expose four named tools
  (`code_search`, `symbol_lookup`, `find_references`, `read_chunk`) so
  the choice happens at tool-selection time, not via a `kind` parameter.

## What we deliberately rejected

- Pure vector marketing. The product is "your agent gets the right
  context in one shot." The implementation is hybrid; we don't pitch
  the implementation.
- Reranker-on-everything. Tier 1's exact match doesn't need it.
- A single mega-search tool. Separate named tools route better.

## Reference

RRF paper: Cormack, Clarke, Buettcher 2009. Cross-encoder rerank: see
the cross-encoder family (`bge-reranker-v2-m3`, Voyage rerank-2, Cohere
rerank-3). Sourcegraph and Cursor have published numbers showing hybrid
+ rerank dominates pure vector on code retrieval.
