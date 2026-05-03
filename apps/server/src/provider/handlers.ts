import { Layer } from "effect";

/**
 * Provider-domain RPC handlers. Empty in PR 2 — each subsequent PR wires its
 * RPC into `ForkzeroRpcs` (in `@forkzero/wire`) and adds the matching
 * `toLayerHandler` here:
 *
 *   PR 3 — `agent.availability`
 *   PR 4 — `agent.setCredential`
 *   PR 5/6 — `agent.start` / `send` / `interrupt` / `close` / `events`
 *
 * Keeping the merge wired now means later PRs are pure additions inside this
 * file — no plumbing churn.
 */
export const ProviderHandlersLayer = Layer.empty;
