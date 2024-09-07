import { fileURLToPath } from "url";
import { setupDevPlatform } from "@cloudflare/next-on-pages/next-dev";
import createJiti from "jiti";

// Import env files to validate at build time. Use jiti so we can load .ts files in here.
createJiti(fileURLToPath(import.meta.url))("./src/env");

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,

  /** Enables hot reloading for local packages without a build step */
  transpilePackages: [
    "@memoize/api",
    "@memoize/auth",
    "@memoize/db",
    "@memoize/ui",
    "@memoize/validators",
  ],

  /** We already do linting and typechecking as separate tasks in CI */
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

if (process.env.NODE_ENV === "development") {
  await setupDevPlatform();
}

export default config;
