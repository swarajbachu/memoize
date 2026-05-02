// Root dev orchestrator for the desktop app: starts the Vite renderer on a
// fixed port, then starts the desktop package (which runs tsdown in watch mode
// and spawns Electron once the dev server + main/preload bundles are ready).

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const RENDERER_PORT = Number(process.env.PORT ?? 5733);
const RENDERER_HOST = process.env.HOST?.trim() || "localhost";
const DEV_SERVER_URL = `http://${RENDERER_HOST}:${RENDERER_PORT}`;

const children = [];
let shuttingDown = false;

function run(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv, FORCE_COLOR: "1" },
  });
  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[${name}] exited (code=${code ?? "null"} signal=${signal ?? "null"})`);
    void shutdown(code ?? 1);
  });
  children.push({ name, child });
  return child;
}

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 500).unref();
}

run("renderer", "bun", ["run", "--filter", "renderer", "dev"], {
  PORT: String(RENDERER_PORT),
  HOST: RENDERER_HOST,
});
run("desktop", "bun", ["run", "--filter", "desktop", "dev"], {
  VITE_DEV_SERVER_URL: DEV_SERVER_URL,
});

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));
process.once("SIGHUP", () => void shutdown(129));
