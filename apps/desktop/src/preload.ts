import { contextBridge, ipcRenderer } from "electron";

export type DesktopAppInfo = {
  name: string;
  version: string;
  platform: NodeJS.Platform;
  stateHome: string;
  isDevelopment: boolean;
};

export type DesktopBridge = {
  getAppInfo: () => Promise<DesktopAppInfo>;
  pickFolder: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
};

const bridge: DesktopBridge = {
  getAppInfo: () => ipcRenderer.invoke("desktop:get-app-info"),
  pickFolder: () => ipcRenderer.invoke("desktop:pick-folder"),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
};

contextBridge.exposeInMainWorld("desktop", bridge);
