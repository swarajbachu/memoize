import { defineConfig } from "tsdown";

const shared = {
  format: "cjs" as const,
  outDir: "dist-electron",
  sourcemap: true,
  outExtensions: () => ({ js: ".cjs" }),
  // Workspace packages ship as raw .ts source — bundle them in instead of
  // letting Node try to require() the .ts file at runtime.
  deps: { alwaysBundle: ["@memoize/wire", "@memoize/server"] },
  // Native modules whose loader uses `__dirname` / `module.parent.filename`
  // to locate a `.node` file at runtime — bundling their JS relocates those
  // anchors and the lookup fails. Keep them external so each is require()'d
  // from node_modules at runtime. electron-updater is also kept external —
  // it pulls in a large CommonJS dep graph (lodash, lazy-val, builder-util)
  // that loads cleanly via Node's resolver but trips bundlers.
  external: [
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
