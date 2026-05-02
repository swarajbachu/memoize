import { defineConfig } from "tsdown";

const shared = {
  format: "cjs" as const,
  outDir: "dist-electron",
  sourcemap: true,
  outExtensions: () => ({ js: ".cjs" }),
  // Workspace packages ship as raw .ts source — bundle them in instead of
  // letting Node try to require() the .ts file at runtime.
  deps: { alwaysBundle: ["@forkzero/wire"] },
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
