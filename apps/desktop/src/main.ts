import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { Effect, Fiber, Layer } from "effect";
import * as Path from "node:path";
import * as OS from "node:os";

import { makeMainLayer } from "./runtime.ts";

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL?.trim() || "";
const isDevelopment = Boolean(DEV_SERVER_URL);

const APP_NAME = isDevelopment ? "Zurich (Dev)" : "Zurich";
const STATE_HOME = process.env.ZURICH_HOME?.trim() || Path.join(OS.homedir(), ".zurich");

app.setName(APP_NAME);

let mainWindow: BrowserWindow | null = null;
let runtimeFiber: Fiber.RuntimeFiber<void, never> | null = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: "#0b0b0c",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    title: APP_NAME,
    webPreferences: {
      preload: Path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Boot the Effect runtime once the window's webContents exists. The RPC
  // server protocol is bound to this webContents, so a window restart means
  // a fresh runtime — the only Effect.runFork in the main process.
  runtimeFiber = Effect.runFork(Layer.launch(makeMainLayer(mainWindow.webContents)));

  if (isDevelopment) {
    // Mirror renderer console output into the dev terminal so we can see
    // RPC smoke-test logs without having to open DevTools.
    mainWindow.webContents.on("console-message", (_event, _level, message, _line, _source) => {
      console.log(`[renderer] ${message}`);
    });
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const rendererIndex = Path.resolve(__dirname, "..", "..", "renderer", "dist", "index.html");
    void mainWindow.loadFile(rendererIndex);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (runtimeFiber !== null) {
      void Effect.runPromise(Fiber.interrupt(runtimeFiber));
      runtimeFiber = null;
    }
  });
}

ipcMain.handle("desktop:get-app-info", () => ({
  name: APP_NAME,
  version: app.getVersion(),
  platform: process.platform,
  stateHome: STATE_HOME,
  isDevelopment,
}));

ipcMain.handle("desktop:pick-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("desktop:open-external", async (_event, url: string) => {
  if (typeof url !== "string") return;
  await shell.openExternal(url);
});

void app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
