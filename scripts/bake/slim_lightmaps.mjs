// Slim the baked lightmaps for CDN delivery.
//
// The bake writes 676 PNGs (338 units × on/off) at 1024² 16-bit RGB — ~106 MB.
// But the runtime loads them through THREE.TextureLoader → an <img>, which
// decodes to 8-bit regardless, so the 16-bit precision is already discarded
// before the GPU ever sees it. That means re-encoding to 8-bit WebP loses
// nothing the runtime rendered, while cutting the bytes by an order of
// magnitude. Lightmaps are low-frequency (soft GI), so they also downsample and
// WebP-compress very cleanly.
//
// Usage: node scripts/bake/slim_lightmaps.mjs [size] [quality]
//        size    edge length in px (default 768; source is 1024)
//        quality WebP quality 0-100 (default 90)

import sharp from "sharp";
import { readdirSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "public/_bake/lightmaps";
const OUT = "public/_bake/cdn/lightmaps";
const size = Number(process.argv[2] || 768);
const quality = Number(process.argv[3] || 90);
const CONCURRENCY = 8;

mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((f) => f.endsWith(".png"));
const mb = (b) => (b / 1024 / 1024).toFixed(2) + " MB";

let srcBytes = 0;
let outBytes = 0;
let done = 0;

async function convert(file) {
  const inPath = join(SRC, file);
  const outPath = join(OUT, file.replace(/\.png$/, ".webp"));
  srcBytes += statSync(inPath).size;
  await sharp(inPath)
    .resize(size, size, { fit: "fill" })
    .webp({ quality, effort: 6, smartSubsample: true })
    .toFile(outPath);
  outBytes += statSync(outPath).size;
  if (++done % 100 === 0) console.log(`[slim-lm] ${done}/${files.length}`);
}

// simple concurrency pool — libvips is already multithreaded per op
const queue = [...files];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) await convert(queue.pop());
  })
);

console.log(
  `[slim-lm] ${files.length} maps  @${size}² q${quality}  ${mb(srcBytes)} -> ${mb(outBytes)}  (${(srcBytes / outBytes).toFixed(1)}x)`
);
