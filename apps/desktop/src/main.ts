import { RpcSerialization } from "@effect/rpc";
import { app, BrowserWindow, dialog, ipcMain, net, protocol } from "electron";
import { Effect, Fiber, Layer } from "effect";
import * as fs from "node:fs/promises";
import * as Path from "node:path";
import { pathToFileURL } from "node:url";

import { makeMainLayer } from "@forkzero/server";

import { electronServerProtocolLayer } from "./ipc/electron-server-protocol.ts";

/**
 * Privileged scheme registration. Must run before `app.whenReady()` —
 * Electron freezes the scheme registry once the app is ready, so a late
 * call silently fails and `<img src="forkzero://...">` errors out with no
 * obvious cause. `secure: true` puts the scheme in the same trust class as
 * `https`; `supportFetchAPI` lets the renderer use `fetch()` against it;
 * `stream: true` lets us hand back a body that the renderer can stream.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: "forkzero",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

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

  // Renderer needs to know fullscreen state to drop the macOS traffic-light
  // gutter (the controls hide in native fullscreen, so the 80px reserve is
  // dead space). We push the current state on first paint plus on every
  // toggle — a fresh boot in fullscreen still gets the initial value.
  const sendFullScreenState = () => {
    if (mainWindow === null) return;
    mainWindow.webContents.send(
      "window:fullscreen",
      mainWindow.isFullScreen(),
    );
  };
  mainWindow.on("enter-full-screen", sendFullScreenState);
  mainWindow.on("leave-full-screen", sendFullScreenState);
  mainWindow.webContents.on("did-finish-load", sendFullScreenState);

  // Inline browser: when the renderer asks to "view PR" we open the URL in
  // a child Chromium window with no node integration rather than handing
  // off to the user's default browser. Same Chromium process, so the user
  // doesn't lose context. We allowlist http/https only — any other scheme
  // is dropped silently to avoid acting as a free `shell.openExternal`.
  ipcMain.on("app:openInlineUrl", (_event, rawUrl: unknown) => {
    if (typeof rawUrl !== "string") return;
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
    const child = new BrowserWindow({
      width: 1100,
      height: 800,
      minWidth: 480,
      minHeight: 360,
      parent: mainWindow ?? undefined,
      title: parsed.host,
      autoHideMenuBar: true,
      backgroundColor: "#0b0b0c",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    void child.loadURL(parsed.toString());
  });

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

/**
 * Resolve `forkzero://attachments/<id>` to a file under
 * `<userDataDir>/attachments/`. The id has no extension on the wire so we
 * scan the directory for a file with the matching stem. Anything outside
 * the host `attachments` is rejected — no path traversal, no other hosts.
 */
const ATTACHMENTS_HOST = "attachments";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

const registerForkzeroProtocol = (): void => {
  const attachmentsDir = Path.join(app.getPath("userData"), "attachments");

  protocol.handle("forkzero", async (request) => {
    const url = new URL(request.url);
    if (url.host !== ATTACHMENTS_HOST) {
      return new Response(null, { status: 404 });
    }

    // The path is `/<id>`; sanitise to a single segment so a crafted url
    // like `forkzero://attachments/../foo` cannot escape `attachmentsDir`.
    const id = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) {
      return new Response(null, { status: 400 });
    }

    let entries: string[];
    try {
      entries = await fs.readdir(attachmentsDir);
    } catch {
      return new Response(null, { status: 404 });
    }
    const filename = entries.find((name) => {
      const dot = name.lastIndexOf(".");
      return dot > 0 && name.slice(0, dot) === id;
    });
    if (!filename) return new Response(null, { status: 404 });

    const absPath = Path.join(attachmentsDir, filename);
    const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";

    const response = await net.fetch(pathToFileURL(absPath).toString());
    const headers = new Headers(response.headers);
    headers.set("content-type", mime);
    headers.set("cache-control", "private, max-age=31536000, immutable");
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  });
};

void app.whenReady().then(() => {
  registerForkzeroProtocol();
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
