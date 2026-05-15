import { ipcMain, type BrowserWindow } from "electron";
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";

import {
  UPDATE_CHECK_CHANNEL,
  UPDATE_DOWNLOAD_CHANNEL,
  UPDATE_INSTALL_CHANNEL,
  UPDATE_STATUS_CHANNEL,
  type UpdateStatus,
} from "@memoize/wire";

// electron-updater talks to the GitHub Releases feed configured in
// apps/desktop/electron-builder.yml (`publish.provider: github`). It reads
// `latest-mac.yml` from the latest *published* release (drafts are invisible
// to unauthenticated readers — see release flow note in electron-builder.yml),
// compares versions, and downloads the .dmg. We drive the lifecycle manually
// so the renderer can show download progress + a "Restart now" button instead
// of relying on the system notification center.
//
// Re-poll every six hours so a long-running session picks up a release
// pushed mid-week without requiring a manual restart-to-check.
const UPDATE_POLL_MS = 6 * 60 * 60 * 1000;

let lastStatus: UpdateStatus = { kind: "idle" };
let started = false;

export function startAutoUpdater(window: BrowserWindow): void {
  // Always re-broadcast the most recent status to a (re)attached window so a
  // dev hot-reload or future window-recreate doesn't lose state.
  const send = (status: UpdateStatus) => {
    lastStatus = status;
    if (window.isDestroyed()) return;
    window.webContents.send(UPDATE_STATUS_CHANNEL, status);
  };
  window.webContents.on("did-finish-load", () => send(lastStatus));

  if (started) return;
  started = true;

  autoUpdater.logger = {
    info: (msg: unknown) => console.log("[memoize:updater]", msg),
    warn: (msg: unknown) => console.warn("[memoize:updater]", msg),
    error: (msg: unknown) => console.error("[memoize:updater]", msg),
    debug: () => {},
  } as unknown as typeof autoUpdater.logger;

  // Wait for the user to opt in via the banner before consuming bandwidth,
  // but if they ignore the "Restart" button we still install on next quit so
  // the update isn't stranded forever.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => send({ kind: "checking" }));
  autoUpdater.on("update-available", (info: UpdateInfo) =>
    send({
      kind: "available",
      version: info.version,
      releaseNotes:
        typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
      releaseDate: info.releaseDate,
    }),
  );
  autoUpdater.on("update-not-available", () => send({ kind: "not-available" }));
  autoUpdater.on("download-progress", (p: ProgressInfo) =>
    send({
      kind: "downloading",
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
    }),
  );
  autoUpdater.on("update-downloaded", (info: UpdateInfo) =>
    send({ kind: "ready", version: info.version }),
  );
  autoUpdater.on("error", (err: Error) =>
    send({ kind: "error", message: err.message }),
  );

  ipcMain.handle(UPDATE_CHECK_CHANNEL, async () => {
    await autoUpdater.checkForUpdates().catch((err) => {
      console.error("[memoize:updater] check failed", err);
    });
  });
  ipcMain.handle(UPDATE_DOWNLOAD_CHANNEL, async () => {
    await autoUpdater.downloadUpdate().catch((err) => {
      console.error("[memoize:updater] download failed", err);
    });
  });
  ipcMain.handle(UPDATE_INSTALL_CHANNEL, () => {
    // `quitAndInstall` synchronously kicks off shutdown; the await is just
    // for symmetry with the other handlers.
    autoUpdater.quitAndInstall();
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("[memoize:updater] check failed", err);
    });
  };
  check();
  setInterval(check, UPDATE_POLL_MS);
}
