/**
 * Shape of the preload bridge that the main process exposes onto
 * `window.forkzero`. The renderer's RPC client transport reads/writes raw
 * encoded RPC frames; serialization + framing happen at the Effect RPC layer.
 */
export interface RpcBridge {
  readonly send: (frame: string | Uint8Array) => void;
  readonly onMessage: (
    handler: (frame: string | Uint8Array) => void,
  ) => () => void;
}

export interface WindowBridge {
  readonly onFullScreenChange: (
    handler: (fullscreen: boolean) => void,
  ) => () => void;
}

export interface AppBridge {
  readonly openExternal: (url: string) => void;
}

export interface ForkzeroBridge {
  readonly rpc: RpcBridge;
  readonly window?: WindowBridge;
  readonly app?: AppBridge;
}

declare global {
  interface Window {
    forkzero?: ForkzeroBridge;
  }
}

export function getBridge(): ForkzeroBridge {
  const bridge = globalThis.window?.forkzero;
  if (!bridge) {
    throw new Error(
      "forkzero bridge missing — preload.ts did not load. Are we running outside Electron?",
    );
  }
  return bridge;
}
