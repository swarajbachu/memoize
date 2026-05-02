# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | Electron (latest LTS) | Already scaffolded; broadest desktop reach |
| Renderer framework | React 19 + TypeScript | Mainstream, hireable, great tooling |
| Build (renderer) | Vite | Fast HMR; matches React 19 well |
| Build (main) | tsdown | Fast esbuild-based bundler for Node |
| Styling | Tailwind v4 | Already in place; minimal runtime |
| State (renderer, ephemeral) | Zustand backed by Effect Refs | Effect owns truth; Zustand is a thin React surface |
| State (renderer, persistent) | Effect Layer over JSON file in userData | Inspectable, backupable |
| IPC | Effect-wrapped preload bridge with typed contracts | One source of truth for channel schemas |
| Terminal | xterm.js + node-pty | De facto standard |
| Git | Spawn `git` CLI (no libgit2) | Avoids native binding pain; matches what users have installed |
| Agent SDKs | `@anthropic-ai/claude-agent-sdk`, OpenAI Codex SDK | First-party clients |
| Runtime safety | Effect.ts (Schema, Layer, Stream, Cause) | Typed errors, structured concurrency, resource safety |
| Monorepo | Bun + Turbo | Fast installs, parallel task running |

## Module layout

```
forkzero/
  apps/
    desktop/        # Electron main process — owns OS resources
      src/
        main.ts             # Window + lifecycle
        preload.ts          # contextBridge → renderer
        runtime.ts          # Composes Effect Layers for main
        services/
          pty/              # PTY service (node-pty wrapped in Effect)
          git/              # Git service (spawn git, parse output)
          workspace/        # Folder list persistence
          agent/            # Claude/Codex adapters
        ipc/
          channels.ts       # Effect Schema for every channel
          handlers.ts       # Layer that registers ipcMain handlers
    renderer/       # React UI — pure UI, talks to main via typed bridge
      src/
        runtime.ts          # Renderer-side Effect runtime (lighter)
        components/         # Pane components
        store/              # Zustand stores backed by Effect Refs
        lib/desktop.ts      # Typed IPC client
  packages/
    wire/           # @forkzero/wire — RPC contracts, schemas, branded IDs
      src/
        terminal.ts
        git.ts
        workspace.ts
        agent.ts
    ui/             # Shared component primitives
    typescript-config/
    eslint-config/
```

## IPC topology

The preload bridge exposes a single typed object: `window.forkzero`. Every method:

1. Takes a typed input (Effect Schema-decoded on send)
2. Returns either a `Promise<Output>` (request/response) or a `(handler) => unsubscribe` (subscription)
3. Maps IPC errors to Effect tagged errors on the renderer

Channel naming: `<service>:<verb>`, e.g. `pty:open`, `git:log`, `workspace:add`.

## Effect Layer model

**Main process layers** (built once at boot):

```
AppLayer = Layer.mergeAll(
  NodeServicesLayer,        // FileSystem, Path, Terminal stdin
  WorkspaceServiceLayer,    // depends on FileSystem, Path
  PtyServiceLayer,          // depends on Path
  GitServiceLayer,          // depends on Path
  AgentServiceLayer,        // depends on Workspace, Pty
  IpcHandlersLayer          // depends on all above; side-effectful registration
)
```

**Renderer layers**:

```
RendererLayer = Layer.mergeAll(
  IpcClientLayer,           // typed wrapper around window.forkzero
  WorkspaceStoreLayer,      // Ref<WorkspaceState> + IPC sync
  TerminalRegistryLayer,    // Map<TerminalId, xterm instance>
  AgentSessionRegistryLayer
)
```

A small `useEffectRuntime()` hook gives React components access via Zustand subscriptions.

## Threading & concurrency

- **Main process**: Effect runtime with Fibers; PTY/git/agent operations are interruptible.
- **Renderer**: lightweight Effect runtime, no long-running fibers — mostly request/response.
- **Streams**: PTY output, git status changes, and agent events are Effect Streams in main, serialized to JSON over IPC, re-materialized as RxJS-style subscriptions in the renderer.

## Persistence

| Data | Location | Format |
|---|---|---|
| Folder list | `userData/workspaces.json` | JSON |
| Per-folder sessions | `userData/sessions/<folder-hash>.json` | JSON |
| PTY scrollback (recent) | `userData/scrollback/<session-id>.log` | Plain text, capped at N MB |
| Agent transcripts | `userData/agent-runs/<session-id>.jsonl` | NDJSON |
| Settings | `userData/settings.json` | JSON |
| Credentials | OS keychain via `keytar` | Native |

No SQLite in v1. JSON until proven painful.
