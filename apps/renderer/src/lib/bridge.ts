import type { UpdateStatus } from "@memoize/wire";

/**
 * Shape of the preload bridge that the main process exposes onto
 * `window.memoize`. The renderer's RPC client transport reads/writes raw
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

export interface UpdatesBridge {
  readonly onStatus: (handler: (status: UpdateStatus) => void) => () => void;
  readonly check: () => Promise<void>;
  readonly download: () => Promise<void>;
  readonly installNow: () => Promise<void>;
}

export interface MemoizeBridge {
  readonly rpc: RpcBridge;
  readonly window?: WindowBridge;
  readonly app?: AppBridge;
  readonly updates?: UpdatesBridge;
}

declare global {
  interface Window {
    memoize?: MemoizeBridge;
  }
}

export function getBridge(): MemoizeBridge {
  const bridge = globalThis.window?.memoize;
  if (!bridge) {
    throw new Error(
      "memoize bridge missing — preload.ts did not load. Are we running outside Electron?",
    );
  }
  return bridge;
}
