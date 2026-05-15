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
  /** Dev-only: round-trips a synthetic status through the real IPC channel. */
  readonly __demoSet?: (status: UpdateStatus) => Promise<void>;
}

/**
 * Action ids the main process emits when the user picks an item in the
 * native Application Menu. The renderer subscribes via `menu.onAction` and
 * dispatches to the appropriate store — see `use-menu-shortcuts.ts`.
 */
export type MenuAction =
  | "new-chat"
  | "open-project"
  | "settings"
  | "toggle-left-sidebar"
  | "toggle-right-sidebar"
  | "toggle-terminal"
  | "focus-composer";

export interface MenuBridge {
  readonly onAction: (handler: (action: MenuAction) => void) => () => void;
}

export interface MemoizeBridge {
  readonly rpc: RpcBridge;
  readonly window?: WindowBridge;
  readonly app?: AppBridge;
  readonly updates?: UpdatesBridge;
  readonly menu?: MenuBridge;
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
