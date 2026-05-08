// Render a 1024×1024 macOS-shaped icon to apps/desktop/build/icon.png.
// electron-builder takes that PNG and generates the .icns at package time.
//
// Source preference: if `apps/desktop/build/icon.source.png` exists, that
// raster is used (resized to 1024 and clipped to the macOS squircle).
// Otherwise we fall back to rendering `icon.svg`. macOS uses a ~22.37%
// corner radius on its app icon mask — apps without it look subtly off
// next to native apps in the Dock/Finder.

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SIZE = 1024;
const RADIUS = Math.round(SIZE * 0.2237);

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(here, "..", "build");
const sourcePng = resolve(buildDir, "icon.source.png");
const sourceSvg = resolve(buildDir, "icon.svg");
const outPng = resolve(buildDir, "icon.png");

const base = existsSync(sourcePng)
  ? sharp(await readFile(sourcePng))
  : sharp(await readFile(sourceSvg), { density: 384 });

const mask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`,
);

const png = await base
  .resize(SIZE, SIZE, { fit: "cover" })
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toBuffer();

await writeFile(outPng, png);
console.log(`wrote ${png.length} bytes to ${outPng}`);
