// Slim the baked world-space GLB for CDN delivery.
//
// The exported desk GLB is ~66 MB of pure geometry (262 meshes, POSITION /
// NORMAL / TEXCOORD_0 / TEXCOORD_1 — no embedded textures; the lightmaps load
// separately). That's brutal on first paint, so we quantize + Meshopt-compress
// it. `meshopt()` is a thin wrapper that runs reorder → quantize → the
// EXT_meshopt_compression encoder; the runtime decodes it with three-stdlib's
// self-contained MeshoptDecoder (embedded wasm — nothing extra to host).
//
// TEXCOORD_1 (the lightmap UVs) gets quantized too. 12-bit default is sub-texel
// for the 1024² maps, but watch chart edges for faint seams in QA; bump
// quantizeTexcoord here if any appear.
//
// Usage: node scripts/bake/slim_glb.mjs <in.glb> <out.glb>
//        (defaults: public/_bake/desk-window-uv1.glb -> public/_bake/cdn/desk-window-uv1.glb)

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, meshopt } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";

const inPath = process.argv[2] || "public/_bake/desk-window-uv1.glb";
const outPath = process.argv[3] || "public/_bake/cdn/desk-window-uv1.glb";

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2) + " MB";

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

// EXT_meshopt_compression reads its encoder/decoder from the IO's registered
// dependencies — without this the extension's encoder is undefined at write
// time (TypeError: encodeFilterOct of undefined).
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder
  });
const before = statSync(inPath).size;
console.log(`[slim-glb] reading ${inPath} (${mb(before)})`);

const doc = await io.read(inPath);
await doc.transform(
  dedup(),
  // keepAttributes: the lightmap UVs (TEXCOORD_1) are attached at RUNTIME, not
  // referenced by any glTF material, so prune's default would strip them as
  // "unused" and break all baked lighting. Keep every vertex attribute; only
  // prune unused nodes / materials / textures / accessors.
  prune({ keepAttributes: true }),
  meshopt({ encoder: MeshoptEncoder, level: "high" })
);

mkdirSync(dirname(outPath), { recursive: true });
await io.write(outPath, doc);

const after = statSync(outPath).size;
console.log(
  `[slim-glb] wrote ${outPath} (${mb(after)}) — ${(before / after).toFixed(1)}x smaller`
);
