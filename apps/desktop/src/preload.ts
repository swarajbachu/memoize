import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import {
  IPC_CHANNEL,
  UPDATE_CHECK_CHANNEL,
  UPDATE_DOWNLOAD_CHANNEL,
  UPDATE_INSTALL_CHANNEL,
  UPDATE_STATUS_CHANNEL,
  type UpdateStatus,
} from "@memoize/wire";

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
  window: {
    onFullScreenChange: (handler: (fullscreen: boolean) => void) => {
      const wrapped = (_event: IpcRendererEvent, value: boolean) =>
        handler(value);
      ipcRenderer.on("window:fullscreen", wrapped);
      return () => {
        ipcRenderer.off("window:fullscreen", wrapped);
      };
    },
  },
  app: {
    openExternal: (url: string) => {
      ipcRenderer.send("app:openExternal", url);
    },
  },
  updates: {
    onStatus: (handler: (status: UpdateStatus) => void) => {
      const wrapped = (_event: IpcRendererEvent, status: UpdateStatus) =>
        handler(status);
      ipcRenderer.on(UPDATE_STATUS_CHANNEL, wrapped);
      return () => {
        ipcRenderer.off(UPDATE_STATUS_CHANNEL, wrapped);
      };
    },
    check: () => ipcRenderer.invoke(UPDATE_CHECK_CHANNEL) as Promise<void>,
    download: () =>
      ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL) as Promise<void>,
    installNow: () =>
      ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL) as Promise<void>,
    // Dev-only escape hatch: only handled in dev (see updater.ts
    // `registerUpdaterDemo`). Calling in a packaged build rejects harmlessly.
    __demoSet: (status: UpdateStatus) =>
      ipcRenderer.invoke("memoize:update-demo-set", status) as Promise<void>,
  },
};

contextBridge.exposeInMainWorld("memoize", bridge);
