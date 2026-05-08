// Render apps/desktop/build/icon.svg → apps/desktop/build/icon.png at 1024x1024.
// electron-builder takes the PNG and generates the macOS .icns at package time.
// Run via `bun run icon` whenever the SVG changes.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(here, "..", "build");
const svg = await readFile(resolve(buildDir, "icon.svg"));

const png = await sharp(svg, { density: 384 })
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await writeFile(resolve(buildDir, "icon.png"), png);
console.log(`wrote ${png.length} bytes to ${resolve(buildDir, "icon.png")}`);
