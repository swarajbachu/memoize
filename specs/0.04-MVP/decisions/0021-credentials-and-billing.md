# ADR 0021 — Credentials & billing model

Date: 2026-05-06
Status: Accepted

## Context

ADR 0020 makes embedding and rerank providers pluggable. Some providers
are local (free, private). Some are API-based (Voyage, Cohere, OpenAI,
Jina) — these need credentials, and someone has to pay the bill.

There are three credible billing shapes for paid providers:

| Shape | What user does | Where forkzero is in the path | Forkzero infra needed |
|---|---|---|---|
| **Local** | Nothing | Not in the path | None |
| **BYOK** | Pastes their own key in Settings | Not in the path; chunks go user → provider directly | None |
| **Forkzero-cloud** | Subscribes; we proxy | In the path; chunks traverse our proxy | Auth, billing, rate limit, abuse mitigation, support |

The temptation with "make it a service" is to ship Forkzero-cloud
day-one. The reality of running Forkzero-cloud:

- Backend service (key management, rate limiting, key rotation, observability)
- Stripe + sales tax / VAT in 30+ jurisdictions
- Abuse mitigation (free-trial farming; runaway agents — one bug = $1000
  charged to your name)
- "Your code never leaves your machine" claim breaks (chunks pass through
  our proxy; embeddings are partially invertible to recover content)
- Pricing design (per-query? per-million-tokens? subscription?)
- Customer support: refunds, billing disputes, outages
- Margin reality: Voyage charges ~$0.06/1M tokens. A 30% markup is
  ~$0.02/1M tokens. Sustainable at scale; not at startup.

We can build this later. Building it before adoption is a fixed cost
without a revenue base.

## Decision

**0.04 ships local + BYOK only.** Forkzero-cloud is deferred. The
architecture leaves the door open: the provider abstraction (ADR 0020)
treats `forkzero-cloud` as one more provider. Adding it later is
two new files plus a billing service, not re-architecting.

### Local (default)

`nomic-embed-code` for embeddings, `bge-reranker-v2-m3` for rerank.
Both run in-process via `@huggingface/transformers` ONNX runtime. Zero
network calls. Works out of the box.

### BYOK (opt-in)

User pastes API keys in **Settings → Index** (renderer). Storage uses
the existing `keytar` pattern from agent integration (Phase 2), with new
slots:

```
forkzero:embed:voyage     → VOYAGE_API_KEY
forkzero:embed:openai     → OPENAI_API_KEY
forkzero:embed:jina       → JINA_API_KEY
forkzero:rerank:cohere    → COHERE_API_KEY
forkzero:rerank:voyage    → VOYAGE_API_KEY
```

When the user selects a paid provider, `apps/server` reads the matching
key from keytar at engine startup and injects it into the provider via
env var. Keys never logged. Never written to disk in plaintext. Never
sent to forkzero servers (because there are none in 0.04).

For the standalone MCP server (`apps/mcp-server`), keys come from env
vars directly — the binary doesn't access keytar.

### Forkzero-cloud (deferred)

A `forkzero-cloud` provider stub exists in 0.04 but throws "not yet
available" if selected. This is intentional:

- The UI surface ("Forkzero-cloud — coming soon") signals to users
  that this option exists.
- Pre-allocates a name in the provider registry so future config can
  reference it without breaking change.
- Forces us to keep the provider abstraction honest (if we couldn't
  drop in `forkzero-cloud` later, the abstraction would be wrong).

When we eventually ship Forkzero-cloud (a future MVP, not 0.04):

- Implement the `forkzero-cloud` embed and rerank providers (HTTP
  clients hitting our proxy)
- Build `apps/billing-proxy` (or run as a service)
- Add Stripe integration, key issuance, rate limiting
- Document the privacy trade-off honestly

### Why pre-stub `forkzero-cloud` now

If we leave it out entirely, future ADRs may need to reshape the
provider contract to fit a billing model we hadn't imagined. By
landing the stub today, we're forced to think about:

- Does the contract pass enough metadata for billing (user ID,
  workspace ID, query token counts)?
- Does the rerank result include cost data?
- Is there a notion of "session" that bundles many embed + rerank
  calls?

These questions surface now, cheaply, while changing the contract is
a one-package-touch.

## Consequences

### Positive

- 0.04 ships a useful, complete product without a billing system.
- BYOK costs nothing to support — same pattern as Phase 2 agent keys.
- The cloud option exists conceptually; users see it labeled and know
  it's planned.
- When we do build Forkzero-cloud, the architecture doesn't change.

### Negative

- Forkzero-cloud users have to wait. We won't have recurring revenue
  from this product surface in 0.04.
- BYOK requires users to sign up at Voyage / Cohere / OpenAI etc.,
  which is friction. Some users will abandon and use local-only.
- The "coming soon" label in Settings is debt — it sets an expectation
  we have to deliver on.

## Alternatives considered

### (a) BYOK only, defer forkzero-cloud forever

- Pro: zero billing complexity, ever.
- Con: forecloses recurring revenue and team-shared cloud index.
  Forkzero stays an OSS tool. Possibly fine; possibly limiting.

### (b) Ship pay-per-usage in 0.04 alongside BYOK

- Pro: revenue from day one.
- Con: huge fixed cost (Stripe, tax, abuse, support) on top of the
  index work itself. Doubles 0.04's scope. Likely delays shipping
  by a quarter.

### (c) BYOK in 0.04 + scaffold forkzero-cloud stub now (chosen)

- Pro: ship 0.04 fast; preserve optionality; exercise the abstraction.
- Con: stub debt (must follow through eventually).

## What we deliberately rejected

- Forkzero-cloud as the *default*. Local-first is the principle (matches
  ADR 0007's local-only-v1 stance).
- Storing API keys in plaintext config. Keytar is the standard.
- Per-query keys (passing keys with each request). Provider holds the
  key for its lifetime.
- Forking the engine to support a "managed" version separately. One
  engine, one set of providers — billing rides on top.

## Reference

ADR 0020 defines the provider abstraction this ADR sits on. The keytar
pattern matches `0.01-MVP/features/agent-integration.md`'s credentials
section.
