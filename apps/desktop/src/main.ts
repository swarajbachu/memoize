import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import * as Path from "node:path";
import * as OS from "node:os";

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL?.trim() || "";
const isDevelopment = Boolean(DEV_SERVER_URL);

const APP_NAME = isDevelopment ? "Zurich (Dev)" : "Zurich";
const STATE_HOME = process.env.ZURICH_HOME?.trim() || Path.join(OS.homedir(), ".zurich");

app.setName(APP_NAME);

let mainWindow: BrowserWindow | null = null;

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

  if (isDevelopment) {
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const rendererIndex = Path.resolve(__dirname, "..", "..", "renderer", "dist", "index.html");
    void mainWindow.loadFile(rendererIndex);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
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
