import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const port = Number(process.env.PORT ?? 5733);
const host = process.env.HOST?.trim() || "localhost";

export default defineConfig({
  // Relative base so file:// loads work in the packaged Electron build.
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    host,
    port,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
