// Remove baked duplicates of objects supplied by live React components.
// No texture recompression or geometry simplification: preserve visual quality,
// object tags, world transforms, and TEXCOORD_1 lightmap coordinates.
// Usage: node scripts/bake/prune_live_overlays.mjs source.glb public/desk-static-v1.glb
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { createRequire } from "node:module";
import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
if (require("meshoptimizer/package.json").version !== "0.18.1") {
  throw new Error("Use meshoptimizer@0.18.1: newer encoders can hang the production decoder.");
}
const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error("Provide source.glb and output.glb paths.");
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.decoder": MeshoptDecoder,
  "meshopt.encoder": MeshoptEncoder
});
const doc = await io.read(source);
const root = doc.getRoot();
const hidden = new Set(["macbook", "chessboard", "turntable", "notepad"]);
const removed = [];
for (const node of root.listNodes()) {
  const tag = node.getExtras().object || node.getMesh()?.getExtras().object;
  if (hidden.has(tag) || node.getExtension("KHR_lights_punctual")) {
    removed.push({ name: node.getName(), tag: tag || "light" });
    node.dispose();
  }
}
if (!removed.some((node) => hidden.has(node.tag))) {
  throw new Error("No live-overlay duplicates found; inspect the source before publishing.");
}
await doc.transform(prune({ keepAttributes: true }));
mkdirSync(dirname(output), { recursive: true });
await io.write(output, doc);
console.log(JSON.stringify({
  sourceBytes: statSync(source).size,
  outputBytes: statSync(output).size,
  removedNodes: removed.length,
  removedObjects: [...new Set(removed.map((node) => node.tag))],
  meshes: root.listMeshes().length,
  materials: root.listMaterials().length,
  textures: root.listTextures().length
}, null, 2));
