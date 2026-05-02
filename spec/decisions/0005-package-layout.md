# ADR 0005: Package layout & naming

**Status**: Accepted

**Date**: 2026-05-02

## Context

The monorepo has two apps (`desktop`, `renderer`) and a growing number of cross-cutting concerns: RPC contracts, branded IDs, shared schemas, future agent adapters, future UI primitives. We need a layout that supports the v1 surface area without forcing every new domain to negotiate a new package.

Other terminal-for-agents apps split their server into a dozen domain packages (auth, workspace, project, terminal, git, provider, orchestration, persistence, environment, observability, telemetry, checkpointing) and split their contracts package similarly. That's appropriate at their scale; it's premature partitioning at ours.

## Decision

### One contracts package: `@forkzero/wire`

All RPC contracts, branded IDs, and cross-process schemas live in a single workspace package: `@forkzero/wire`. Inside, **one file per domain** (`ping.ts`, `workspace.ts`, `pty.ts`, `git.ts`). One `RpcGroup` (`ForkzeroRpcs`) collects every `Rpc.make(...)`.

**Why one package, not many:** the wire format is the boundary. Splitting it across packages forces every new RPC to negotiate package membership. One package, one file per domain, lets us add an RPC by editing one file and re-exporting from `index.ts`.

### Internal package naming: `@forkzero/*`

All packages we create live under `@forkzero/*` (e.g. `@forkzero/wire`). Pre-existing repo-shared config packages keep their `@repo/*` namespace (`@repo/typescript-config`, `@repo/eslint-config`, `@repo/ui`) — they're scaffolding that came with the Turborepo template, not domain code.

**Why not mix scoped and unscoped:** a single namespace makes it obvious at a glance whether a dependency is ours or third-party.

### Service classes: `<Domain>Service`

Every Effect.Service class ends in `Service`: `WorkspaceService`, `PtyService`, `GitService`, `AgentService`. No exceptions, no abbreviations, no domain-specific suffixes (no `WorkspaceFileSystem`, `OrchestrationEngine`, bare `Open`).

**Why uniform:** one suffix means readers don't have to learn a vocabulary of suffixes per domain. Searching for `Service` finds every service in one grep.

### RPC method names: dotted lowercase

All RPC method names are dotted-lowercase string literals passed directly to `Rpc.make`:

```ts
Rpc.make("workspace.add", { ... })
Rpc.make("pty.open", { ... })
Rpc.make("git.log", { ... })
```

**No central method-name enum.** The string literal in `Rpc.make("...", ...)` IS the API. Adding an RPC is one edit.

**Why no enum:** an enum doubles the change footprint per RPC (define the constant, reference it) without adding type safety — Effect RPC already infers the method name from the literal.

### Branded entity IDs

Every entity that crosses the wire has a branded ID via `Schema.brand`:

```ts
const makeEntityId = <Brand extends string>(brand: Brand) =>
  Schema.Trim.pipe(Schema.nonEmptyString(), Schema.brand(brand));
export const FolderId = makeEntityId("FolderId");
```

**Why brand:** prevents `PtyId` from being passed where `FolderId` is expected, even though both are strings at runtime. Cost: zero. Caught: a real class of bugs.

### Per-domain folder layout (apps/desktop)

```
apps/desktop/src/services/<domain>/
  <domain>-service.ts    # Effect.Service class + Default Layer
  <domain>-handlers.ts   # RPC handler implementations
```

**Flat. No `Layers/` and `Services/` subdirs per domain.** Split a domain into subfolders only when it grows past ~300 LOC and the split actually clarifies things.

**Why flat:** at v1 sizes, subdirs add navigation cost without clarifying anything. A domain folder with two files is faster to read than a domain folder with two folders that each contain one file.

### File naming

- Files: `kebab-case.ts` (`workspace-service.ts`, `electron-server-protocol.ts`)
- Folders: singular kebab-case (`service/`, `ipc/`, not `services/` for the inner domain folder — but the parent `services/` is plural, since it contains many)

### App layout (current)

```
apps/desktop/src/
  main.ts               # window + lifecycle
  preload.ts            # contextBridge → renderer
  runtime.ts            # composes Effect Layers for the main runtime
  ipc/
    electron-server-protocol.ts
    handlers.ts         # registers all *-handlers in one place
  services/<domain>/
    <domain>-service.ts
    <domain>-handlers.ts

apps/renderer/src/
  app.tsx, main.tsx, styles.css
  lib/
    bridge.ts                       # window.forkzero typing
    electron-client-protocol.ts
    rpc-client.ts                   # uses Scope.extend(longLivedScope)
  store/<domain>.ts                 # Zustand stores
  components/<name>.tsx
```

## Consequences

- Adding a new RPC: edit one file in `packages/wire/src/<domain>.ts`, add a handler file in `apps/desktop/src/services/<domain>/`, register it in `ipc/handlers.ts`. No package boundaries to renegotiate.
- Adding a new domain: one folder with two files. Promote to subfolders only when scale demands it.
- New contributors find services by searching `*Service` and RPCs by searching `Rpc.make("`.

## What we deliberately rejected

- Splitting `wire` into per-domain packages — forces package coordination per RPC.
- Central `WS_METHODS`-style enum of method names — doubles the change footprint.
- Per-domain `Layers/` + `Services/` subdirs — premature partitioning.
- Inconsistent service suffixes (`*Engine`, `*FileSystem`, bare verbs) — readers shouldn't have to learn a per-domain vocabulary.
- A `packages/shared/` junk drawer — when we have a real cross-cutting utility, we'll create a focused package for it.
