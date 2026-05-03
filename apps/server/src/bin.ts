/**
 * Standalone server entrypoint. Today this is just a re-export so the package
 * has a stable boot surface; the Electron shim still consumes `runtime.ts`
 * directly. When we ship remote access, this file grows: parse args, build
 * the host-shell deps (file-backed AppPaths, no FolderPicker, WS transport
 * layer), call `makeMainLayer`, run via `NodeRuntime.runMain`.
 *
 * Per ADR 0007, transport modules (e.g. a WS server protocol) will live next
 * to this file under `transports/` — never inside any service domain.
 */
export { makeMainLayer, type MainLayerDeps } from "./runtime.ts";
