import { RpcSerialization } from "@effect/rpc";
import { app, BrowserWindow, dialog } from "electron";
import { Effect, Fiber, Layer } from "effect";
import * as Path from "node:path";

import { makeMainLayer } from "@forkzero/server";

import { electronServerProtocolLayer } from "./ipc/electron-server-protocol.ts";

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL?.trim() || "";
const isDevelopment = Boolean(DEV_SERVER_URL);

const APP_NAME = isDevelopment ? "forkzero (Dev)" : "forkzero";

app.setName(APP_NAME);

let mainWindow: BrowserWindow | null = null;
let runtimeFiber: Fiber.RuntimeFiber<void, never> | null = null;

// Electron's dialog is the only host-shell API the server reaches for. Wrap
// it here so apps/server stays free of any UI-toolkit imports — see ADR 0007.
const folderPicker = {
  pick: () =>
    Effect.promise(() =>
      dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
      }),
    ).pipe(
      Effect.map((result) =>
        result.canceled || result.filePaths.length === 0
          ? null
          : (result.filePaths[0] ?? null),
      ),
    ),
};

function createMainWindow() {
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    // macOS vibrancy needs the window itself to be transparent — without
    // `transparent: true` Electron paints an opaque background and the
    // vibrancy never shows through. `backgroundColor: "#00000000"` (alpha 0)
    // pairs with it so there's no flash of solid color before render.
    show: false,
    ...(isMac
      ? {
          vibrancy: "sidebar" as const,
          visualEffectState: "active" as const,
          transparent: true,
          backgroundColor: "#00000000",
        }
      : { backgroundColor: "#0b0b0c" }),
    titleBarStyle: isMac ? "hiddenInset" : "default",
    title: APP_NAME,
    webPreferences: {
      preload: Path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Avoid the white flash that transparent windows show before first paint.
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // Boot the Effect runtime once the window's webContents exists. The RPC
  // server protocol is bound to this webContents, so a window restart means
  // a fresh runtime — the only Effect.runFork in the main process.
  const serverProtocol = electronServerProtocolLayer(mainWindow.webContents).pipe(
    Layer.provide(RpcSerialization.layerJson),
  );

  runtimeFiber = Effect.runFork(
    Layer.launch(
      makeMainLayer({
        userData: app.getPath("userData"),
        folderPicker,
        serverProtocol,
      }),
    ).pipe(
      Effect.catchAllCause((cause) =>
        Effect.sync(() => {
          // Boot-time layer failures (sqlite open, migrator, config) are
          // unrecoverable — surface the cause and bail. Quiet
          // success-after-restart is preferable to a half-running app.
          console.error("[forkzero] fatal boot error", cause);
          app.exit(1);
        }),
      ),
    ),
  );

  if (isDevelopment) {
    // Mirror renderer console output into the dev terminal so we can see
    // RPC smoke-test logs without having to open DevTools.
    mainWindow.webContents.on(
      "console-message",
      (_event, _level, message, _line, _source) => {
        console.log(`[renderer] ${message}`);
      },
    );
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const rendererIndex = Path.resolve(
      __dirname,
      "..",
      "..",
      "renderer",
      "dist",
      "index.html",
    );
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
