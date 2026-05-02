import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import { IPC_CHANNEL } from "@forkzero/contracts";

/**
 * Preload bridge — the only seam between the renderer and the main process.
 * Everything the renderer can do flows through Effect RPC over `IPC_CHANNEL`.
 *
 * `send` pushes encoded request frames toward main. `onMessage` registers a
 * listener for response frames from main and returns an unsubscribe handle.
 */
const bridge = {
  rpc: {
    send: (frame: string | Uint8Array) => {
      ipcRenderer.send(IPC_CHANNEL, frame);
    },
    onMessage: (handler: (frame: string | Uint8Array) => void) => {
      const wrapped = (_event: IpcRendererEvent, frame: string | Uint8Array) =>
        handler(frame);
      ipcRenderer.on(IPC_CHANNEL, wrapped);
      return () => {
        ipcRenderer.off(IPC_CHANNEL, wrapped);
      };
    },
  },
};

contextBridge.exposeInMainWorld("forkzero", bridge);
