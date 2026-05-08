import { autoUpdater } from "electron-updater";

// electron-updater talks to the GitHub Releases feed configured in
// apps/desktop/electron-builder.yml (`publish.provider: github`). It reads
// `latest-mac.yml` from the latest release, compares versions, downloads the
// .dmg in the background, and prompts the user via the system notification
// center on the next launch (`checkForUpdatesAndNotify`).
//
// Re-poll every six hours so a long-running session picks up a release
// pushed mid-week without requiring a manual restart-to-check.
const UPDATE_POLL_MS = 6 * 60 * 60 * 1000;

export function startAutoUpdater(): void {
  autoUpdater.logger = {
    info: (msg: unknown) => console.log("[memoize:updater]", msg),
    warn: (msg: unknown) => console.warn("[memoize:updater]", msg),
    error: (msg: unknown) => console.error("[memoize:updater]", msg),
    debug: () => {},
  } as unknown as typeof autoUpdater.logger;

  const check = () => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error("[memoize:updater] check failed", err);
    });
  };

  check();
  setInterval(check, UPDATE_POLL_MS);
}
