export type DesktopAppInfo = {
  name: string;
  version: string;
  platform: string;
  stateHome: string;
  isDevelopment: boolean;
};

export type DesktopBridge = {
  getAppInfo: () => Promise<DesktopAppInfo>;
  pickFolder: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
};

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = globalThis.window?.desktop;
export const isElectron = Boolean(desktop);
