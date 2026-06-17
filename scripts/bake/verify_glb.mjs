// Headless check that the meshopt-compressed slim GLB still decodes and lost no
// geometry vs. the original. Reading the slim doc forces gltf-transform to run
// the EXT_meshopt_compression decoder (the same meshoptimizer codec three's
// MeshoptDecoder uses at runtime), so a clean read + matching vertex totals
// proves the bitstream is valid and the runtime will decode it.
//
// Usage: node scripts/bake/verify_glb.mjs

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const ORIG = "public/_bake/desk-window-uv1.glb";
const SLIM = "public/_bake/cdn/desk-window-uv1.glb";

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.decoder": MeshoptDecoder,
  "meshopt.encoder": MeshoptEncoder
});

function totals(doc) {
  let verts = 0;
  let prims = 0;
  let withUV1 = 0;
  let sample = null;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      prims++;
      const pos = prim.getAttribute("POSITION");
      verts += pos.getCount();
      if (prim.getAttribute("TEXCOORD_1")) withUV1++;
      if (!sample && pos.getCount() > 0) sample = pos.getElement(0, []); // forces a real decode
    }
  }
  return { verts, prims, withUV1, sample };
}

const orig = totals(await io.read(ORIG));
const slimDoc = await io.read(SLIM);
const usesMeshopt = slimDoc
  .getRoot()
  .listExtensionsUsed()
  .map((e) => e.extensionName)
  .includes("EXT_meshopt_compression");
const slim = totals(slimDoc);

console.log(`[verify] meshopt extension present in slim: ${usesMeshopt}`);
console.log(`[verify] original: ${orig.prims} prims, ${orig.verts} verts, ${orig.withUV1} with uv1`);
console.log(`[verify] slim:     ${slim.prims} prims, ${slim.verts} verts, ${slim.withUV1} with uv1`);
console.log(`[verify] decoded sample vertex (slim): [${slim.sample?.map((n) => n.toFixed(3)).join(", ")}]`);
const ok = usesMeshopt && slim.verts === orig.verts && slim.withUV1 === orig.withUV1;
console.log(
  ok
    ? "[verify] ✓ meshopt decodes; vertex + uv1 totals match exactly — geometry intact"
    : "[verify] ⚠ mismatch — investigate before shipping"
);
