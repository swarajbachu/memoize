# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | Electron (latest LTS) | Already scaffolded; broadest desktop reach |
| Renderer framework | React 19 + TypeScript | Mainstream, hireable, great tooling |
| Build (renderer) | Vite | Fast HMR; matches React 19 well |
| Build (main + server) | tsdown | Fast esbuild-based bundler for Node |
| Styling | Tailwind v4 + shadcn (zinc, dark) | Already in place; minimal runtime |
| State (renderer, ephemeral) | Zustand | Thin React surface |
| State (renderer, persistent) | Server-owned, RPC-fetched | Single source of truth in `apps/server` |
| RPC | `@effect/rpc` over a swappable transport | Same contracts work for Electron IPC, WS, anything |
| Terminal | xterm.js + node-pty | De facto standard |
| Git | Spawn `git` CLI (no libgit2) | Avoids native binding pain; matches what users have installed |
| Agent SDKs | `@anthropic-ai/claude-agent-sdk`, OpenAI Codex SDK | First-party clients |
| Runtime safety | Effect.ts (Schema, Layer, Stream, Cause) | Typed errors, structured concurrency, resource safety |
| Monorepo | Bun workspaces + Turbo | Fast installs, parallel task running, catalog for shared deps |

## Process model

Today we run as a single Electron main process that imports `apps/server` directly. The architecture is **designed for the day** that changes — see [ADR 0007](decisions/0007-server-as-code-only-app.md). The eventual targets:

| Mode | Process layout | When |
|---|---|---|
| **Electron-bundled** (today) | One Electron process; renderer talks to main via Electron IPC; `apps/server` consumed in-process | v1 |
| **Electron + subprocess server** | Electron main spawns `apps/server` as a Node subprocess; renderer talks to it over WebSocket on a localhost port; SSH + port-forward enables remote access | When we ship remote |
| **Headless server + remote clients** | `apps/server` as standalone binary; multiple renderers (browser, mobile, CLI) connect over WS | When we ship cloud or multi-client |

The renderer code does not change between these modes — only the transport module it picks. Service code never changes.

## Module layout

```
forkzero/
  packages/
    wire/                                   # @forkzero/wire — RPC contracts, branded IDs
      src/
        ping.ts, workspace.ts, pty.ts, git.ts, agent.ts
        ids.ts                              # branded entity IDs (FolderId, PtyId, SessionId, ...)
        rpc.ts                              # ForkzeroRpcs = RpcGroup.make(...)
        index.ts
    typescript-config/
    eslint-config/
    ui/                                     # repo-shared UI primitives (existing scaffold)
  apps/
    server/                                 # main-process service implementations
      src/
        workspace/                          # one folder per domain
          Drivers/                          # per-impl factories (where applicable)
          Layers/                           # live Effect.Service impls
          Services/                         # Context.Service tags (interfaces)
          Errors.ts                         # tagged errors for this domain
          handlers.ts                       # toLayerHandler bindings for this domain's RPCs
        pty/                                # same shape
        git/                                # same shape
        provider/                           # the agent domain (Claude, Codex, ...)
          Drivers/                          # ClaudeDriver, CodexDriver — config + factory
          Layers/                           # ClaudeAdapter, CodexAdapter — live SDK wrappers
          Services/                         # ProviderAdapter, ProviderRegistry, ProviderService
          Errors.ts
          availability.ts                   # PATH probe — `which claude`, `which codex`
          spawn.ts                          # spawn-CLI helper
          credentials.ts                    # keychain wrapper
          handlers.ts
        app-paths.ts                        # Context.Tag — userData, etc.
        runtime.ts                          # makeMainLayer(deps) — pure factory, no transport
        handlers.ts                         # Layer.mergeAll of all per-domain handlers
        bin.ts                              # standalone entrypoint stub (becomes WS server later)
    desktop/                                # thin Electron shim
      src/
        main.ts                             # Electron lifecycle; imports makeMainLayer
        preload.ts                          # contextBridge → renderer
        ipc/
          electron-server-protocol.ts       # in-process transport
        app-branding.ts, vibrancy, etc.     # Electron-only utilities
    renderer/                               # React UI — reused as-is in future browser/mobile clients
      src/
        app.tsx, main.tsx, styles.css
        lib/
          rpc-client.ts                     # the seam — selects transport based on environment
          electron-client-protocol.ts       # in-process transport
          # ws-client-protocol.ts           # added when remote ships
        components/                         # feature components + ui/ shadcn primitives
        store/                              # Zustand stores
```

### Per-domain folder convention

Every domain in `apps/server/src/` follows this split (mirrors the reference repo so transplanted code lines up 1:1):

| Folder | Contents | Example |
|---|---|---|
| `Drivers/` | Per-impl static configs + factory functions | `ClaudeDriver.ts` exports `{ driverKind, displayName, create }` |
| `Layers/` | Live `Effect.Service` impls (`Layer.effect(Tag, factory)`) | `ProviderService.ts` (live), `ClaudeAdapter.ts` |
| `Services/` | `Context.Service` tags — interfaces only, no impls | `ProviderAdapter.ts`, `ProviderService.ts` |
| `Errors.ts` | Tagged errors for the domain | `ProviderServiceError`, `ProviderAdapterError` |
| `handlers.ts` | `RpcGroup.toLayerHandler` bindings | `agent.start`, `agent.events`, ... |
| Top-level `*.ts` | Domain-specific helpers that aren't services | `availability.ts`, `spawn.ts`, `credentials.ts` |

Single-impl domains (Phase 1's `pty`, `git`, `workspace`) still use the same split — `Layers/` has one file, `Services/` has one file, `Drivers/` may be empty. The uniform shape makes onboarding cheap; growth is invisible.

## Transport boundary

The renderer never names a transport directly. Everywhere uses:

```ts
// apps/renderer/src/lib/rpc-client.ts
export async function getRpcClient() { ... }
```

Today this returns an Electron-IPC-backed client. Tomorrow it returns a WS-backed client when running in a browser, or Electron-IPC when running inside the Electron renderer. **No call site changes.**

The same is true on the server side: `apps/server/src/runtime.ts` exports a pure `makeMainLayer(deps)` that knows nothing about how it'll be reached. The transport wrapper lives outside (`apps/desktop/src/ipc/electron-server-protocol.ts` today, `apps/server/src/transports/ws.ts` tomorrow).

This is the rule that makes the eventual extraction a wiring change, not a refactor.

## Effect Layer model

**Server layers** (built once at boot via `makeMainLayer({ userData, ... })`):

```
ServerLayer = Layer.mergeAll(
  NodeContext.layer,                        // FileSystem, Path, CommandExecutor
  AppPathsLayer,                            // userData, etc. — typed Context tag
  WorkspaceLayer,                           // depends on FileSystem, AppPaths
  PtyLayer,                                 // depends on AppPaths
  GitLayer,                                 // depends on Workspace, CommandExecutor
  ProviderLayer,                            // depends on Workspace, Credentials
  CredentialsLayer,                         // depends on AppPaths
  HandlersLayer                             // top-level mergeAll of all per-domain handlers
)
```

**Renderer layers**: minimal. Zustand stores hold UI state; `getRpcClient()` returns a long-lived RPC client with `Scope.extend(rendererScope)` (see [ADR 0007](decisions/0007-server-as-code-only-app.md) and Phase 1 decisions log for the why).

## Streaming

Streaming RPCs (`pty.output`, `git.headChanged`, `agent.events`) follow a uniform pattern in the server: per-subscription `Mailbox<Event, Error>` + `Stream.unwrapScoped(Effect.gen { forkScoped pump; return Mailbox.toStream(mb) })`. The forked fiber dies when the renderer interrupts the subscription — clean teardown, no leaks. See `apps/server/src/pty/Layers/PtyService.ts` and `apps/server/src/git/Layers/GitService.ts` for the canonical shape.

## Persistence

| Data | Location | Format |
|---|---|---|
| Folder list + selection | `userData/workspaces.json` | JSON, atomic write+rename |
| Per-folder agent sessions | `userData/sessions/<folder-hash>.json` (Phase 3) | JSON |
| Agent run transcripts | `userData/agent-runs/<session-id>.jsonl` (Phase 3) | NDJSON |
| Settings | `userData/settings.json` (Phase 3) | JSON |
| Credentials | OS keychain via `keytar` (Phase 2) | Native |

No SQLite in v1. JSON until proven painful.

## Naming

See [ADR 0005](decisions/0005-package-layout.md) for the full rules. Highlights:

- Single contracts package: `@forkzero/wire` with one file per domain
- Internal package namespace: `@forkzero/*`
- Service classes: `<Domain>Service` (no `*Engine`, no `*FileSystem`, no bare verbs)
- RPC method names: dotted-lowercase string literals passed directly to `Rpc.make("...", ...)` — no central enum
- Branded IDs for every entity that crosses the wire
- Per-domain folders use `Drivers/Layers/Services/Errors.ts` split (Phase 2+); single-impl domains land with the same structure for uniformity

## Decision references

- [ADR 0001 — Electron over Tauri](decisions/0001-electron-over-tauri.md)
- [ADR 0002 — Effect from day one](decisions/0002-effect-from-day-one.md)
- [ADR 0003 — Bun monorepo](decisions/0003-bun-monorepo.md)
- [ADR 0004 — Spawn-CLI and SDK](decisions/0004-spawn-cli-and-sdk.md)
- [ADR 0005 — Package layout & naming](decisions/0005-package-layout.md)
- [ADR 0006 — Bun catalog + overrides](decisions/0006-bun-catalog.md)
- [ADR 0007 — `apps/server` as a code-only app](decisions/0007-server-as-code-only-app.md)
