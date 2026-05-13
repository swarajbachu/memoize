import { defineConfig } from "tsdown";

const shared = {
  format: "cjs" as const,
  outDir: "dist-electron",
  sourcemap: true,
  outExtensions: () => ({ js: ".cjs" }),
  // Workspace packages ship as raw .ts source — bundle them in instead of
  // letting Node try to require() the .ts file at runtime.
  // `fix-path` is ESM-only ("type": "module"). Electron 33 ships Node 20.x
  // where `require()` of an ESM module throws ERR_REQUIRE_ESM. Bundling it
  // inline transpiles it to CJS so the main bundle can call it directly.
  deps: { alwaysBundle: ["@memoize/wire", "@memoize/server", "fix-path"] },
  // Native modules whose loader uses `__dirname` / `module.parent.filename`
  // to locate a `.node` file at runtime — bundling their JS relocates those
  // anchors and the lookup fails. Keep them external so each is require()'d
  // from node_modules at runtime. electron-updater is also kept external —
  // it pulls in a large CommonJS dep graph (lodash, lazy-val, builder-util)
  // that loads cleanly via Node's resolver but trips bundlers.
  external: [
    // `electron` MUST be external. At runtime in the main process,
    // `require("electron")` is intercepted by Electron itself and returns
    // app/BrowserWindow/etc. as native bindings. If the bundler instead
    // inlines the `electron` npm package's index.js, that ships
    // `getElectronPath()` (which reads node_modules/electron/path.txt to
    // locate the binary) — at runtime that throws "Electron failed to
    // install correctly, please delete node_modules/electron…".
    "electron",
    "node-pty",
    "better-sqlite3",
    "bindings",
    "keytar",
    "electron-updater",
  ],
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/main.ts"],
    clean: true,
  },
  {
    ...shared,
    entry: ["src/preload.ts"],
  },
]);
