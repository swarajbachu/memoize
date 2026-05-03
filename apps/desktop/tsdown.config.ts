import { defineConfig } from "tsdown";

const shared = {
  format: "cjs" as const,
  outDir: "dist-electron",
  sourcemap: true,
  outExtensions: () => ({ js: ".cjs" }),
  // Workspace packages ship as raw .ts source — bundle them in instead of
  // letting Node try to require() the .ts file at runtime.
  deps: { alwaysBundle: ["@forkzero/wire", "@forkzero/server"] },
  // node-pty's binding.js uses __dirname to locate the native pty.node file;
  // bundling its JS relocates __dirname and breaks that lookup. Keep it
  // external so it's require()'d from node_modules at runtime.
  external: ["node-pty"],
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
