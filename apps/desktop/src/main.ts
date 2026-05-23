import { RpcSerialization } from "@effect/rpc";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  shell,
} from "electron";
import { Effect, Fiber, Layer } from "effect";
import fixPath from "fix-path";
import * as fs from "node:fs/promises";
import * as Path from "node:path";
import { pathToFileURL } from "node:url";

import { makeMainLayer } from "@memoize/server";

// macOS GUI apps launched from Finder inherit a minimal PATH
// (`/usr/bin:/bin:/usr/sbin:/sbin`), not the user's shell PATH. The Claude
// driver runs `which claude` to locate the user's Claude Code install — that
// fails under the minimal PATH even when the binary is on Homebrew, nvm, mise,
// or npm-global. Expand PATH from the login shell before any `Command.make`
// in the server runs. Dev (`bun run dev`) inherits the terminal's PATH
// already, so we only do this when packaged. No-op on Windows.
if (process.platform === "darwin" && app.isPackaged) {
  fixPath();
}

import { electronServerProtocolLayer } from "./ipc/electron-server-protocol.ts";
import {
  DEFAULT_MENU_ACCELERATORS,
  installAppMenu,
  type MenuAccelerators,
  type MenuCommand,
} from "./menu.ts";
import {
  getLastStatus,
  onStatusChange,
  registerUpdaterDemo,
  startAutoUpdater,
} from "./updater.ts";

/**
 * Privileged scheme registration. Must run before `app.whenReady()` —
 * Electron freezes the scheme registry once the app is ready, so a late
 * call silently fails and `<img src="memoize://...">` errors out with no
 * obvious cause. `secure: true` puts the scheme in the same trust class as
 * `https`; `supportFetchAPI` lets the renderer use `fetch()` against it;
 * `stream: true` lets us hand back a body that the renderer can stream.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: "memoize",
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

const APP_NAME = isDevelopment ? "memoize Alpha (Dev)" : "memoize Alpha";

app.setName(APP_NAME);

// Lock the app to macOS's dark appearance so the sidebar vibrancy material
// always renders in its dark variant. Without this, vibrancy follows the
// user's system theme — on a light-mode Mac the bright material lets the
// desktop wallpaper bleed through and washes out the (hardcoded-dark)
// renderer UI.
nativeTheme.themeSource = "dark";

let mainWindow: BrowserWindow | null = null;
let runtimeFiber: Fiber.RuntimeFiber<void, never> | null = null;

// Electron's dialog is the only host-shell API the server reaches for. Wrap
// it here so apps/server stays free of any UI-toolkit imports — see ADR 0007.
//
// `showHiddenFiles` is critical on macOS: NSOpenPanel hides dotfile dirs
// (`~/.claude`, `~/.config`, `~/.ssh`, …) by default, so without it the user
// literally cannot navigate into anything under a hidden parent — they
// appear stuck in whatever folder the dialog opens in. `defaultPath: home`
// puts the dialog in a sensible starting place (the user's home dir) instead
// of the Electron process's cwd, which on a packaged build is the app bundle.
const folderPicker = {
  pick: () =>
    Effect.promise(() =>
      dialog.showOpenDialog({
        defaultPath: app.getPath("home"),
        properties: [
          "openDirectory",
          "createDirectory",
          "showHiddenFiles",
        ],
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

  // Hand off http(s) URLs to the OS default browser via `shell.openExternal`
  // — the renderer asked to leave Electron, not to host another Chromium
  // window inside the app. Allowlist scheme so the bridge can't be coaxed
  // into running arbitrary shell URI handlers.
  ipcMain.on("app:openExternal", (_event, rawUrl: unknown) => {
    if (typeof rawUrl !== "string") return;
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
    void shell.openExternal(parsed.toString());
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
          console.error("[memoize] fatal boot error", cause);
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
    // In dev `dist-electron/main.cjs` lives at apps/desktop/dist-electron/
    // and the renderer is two levels up at apps/renderer/dist. In the
    // packaged bundle the renderer is shipped via `extraResources` to
    // <app>/Contents/Resources/app/renderer/dist (see
    // apps/desktop/electron-builder.yml).
    const rendererIndex = app.isPackaged
      ? Path.join(process.resourcesPath, "app", "renderer", "dist", "index.html")
      : Path.resolve(__dirname, "..", "..", "renderer", "dist", "index.html");
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
 * Resolve `memoize://attachments/<id>` to a file under
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

const registerMemoizeProtocol = (): void => {
  const attachmentsDir = Path.join(app.getPath("userData"), "attachments");

  protocol.handle("memoize", async (request) => {
    const url = new URL(request.url);
    if (url.host !== ATTACHMENTS_HOST) {
      return new Response(null, { status: 404 });
    }

    // The path is `/<id>`; sanitise to a single segment so a crafted url
    // like `memoize://attachments/../foo` cannot escape `attachmentsDir`.
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

/**
 * Validate a renderer-supplied accelerator map before handing it to
 * `installAppMenu`. Anything missing or non-string falls through to the
 * default for that command so a bad payload can't blank out the menu.
 */
const sanitizeAccelerators = (raw: unknown): MenuAccelerators => {
  if (raw === null || typeof raw !== "object") {
    return DEFAULT_MENU_ACCELERATORS;
  }
  const obj = raw as Record<string, unknown>;
  const out: Record<MenuCommand, string | null> = {
    ...DEFAULT_MENU_ACCELERATORS,
  };
  for (const cmd of Object.keys(DEFAULT_MENU_ACCELERATORS) as MenuCommand[]) {
    const v = obj[cmd];
    if (v === null) {
      out[cmd] = null;
    } else if (typeof v === "string") {
      out[cmd] = v;
    }
  }
  return out;
};

// Renderer → main: "the user's keybindings just changed, please re-install
// the menu with these accelerators." Renderer owns the defaults + override
// resolution since its keybindings store is the live mirror of the JSON
// config file.
// Latest values for the two independent inputs that drive the menu shape.
// `menu:setAccelerators` and the auto-updater status listener both rebuild
// the menu, but each only knows about its own input — without remembering
// the other, a status flip would blow away custom keybindings (and vice
// versa).
let lastAccelerators: MenuAccelerators = DEFAULT_MENU_ACCELERATORS;

ipcMain.on("menu:setAccelerators", (_event, payload: unknown) => {
  lastAccelerators = sanitizeAccelerators(payload);
  installAppMenu(() => mainWindow, lastAccelerators, getLastStatus());
});

void app.whenReady().then(() => {
  registerMemoizeProtocol();

  // Populate the native About panel so "About memoize" shows the current
  // version + copyright. Without this, Electron's default panel only shows
  // the app name. macOS reads these once at panel-open time, so it's safe
  // to call once on startup.
  app.setAboutPanelOptions({
    applicationName: "memoize Alpha",
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: "© Swaraj Bachu",
    website: "https://github.com/swarajbachu/memoize",
  });

  // Rebuild the menu whenever the updater status changes so the
  // "Check for Updates…" item label/enabled state stays live — this is the
  // user's fallback path when the in-app toast is dismissed or a download
  // stalls mid-way. The subscription is set up once; the listener runs on
  // every status flip.
  onStatusChange((status) => {
    installAppMenu(() => mainWindow, lastAccelerators, status);
  });

  installAppMenu(() => mainWindow, lastAccelerators, getLastStatus());
  createMainWindow();
  if (mainWindow !== null) {
    if (isDevelopment) {
      // Wire the dev console helper (window.__memoizeUpdateDemo) to a real
      // IPC round-trip so the banner can be exercised without a release.
      registerUpdaterDemo(mainWindow);
    } else {
      startAutoUpdater(mainWindow);
    }
  }

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
