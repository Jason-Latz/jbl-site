// Verify the pruned bake with the exact Meshopt decoder shipped to browsers.
// Usage: node scripts/bake/verify_static_glb.mjs source.glb optimized.glb
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const [source, optimized] = process.argv.slice(2);
if (!source || !optimized) throw new Error("Provide source and optimized GLB paths.");
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.decoder": MeshoptDecoder
});
const before = await io.read(source);
const after = await io.read(optimized);
const hidden = new Set(["macbook", "chessboard", "turntable", "notepad"]);
const digest = (data) => createHash("sha256").update(data).digest("hex");
const arrayDigest = (array) => digest(Buffer.from(array.buffer, array.byteOffset, array.byteLength));

function triangleDigest(accessor) {
  if (!accessor) return null;
  const indices = accessor.getArray();
  const triangles = [];
  for (let i = 0; i < indices.length; i += 3) {
    const face = [indices[i], indices[i + 1], indices[i + 2]];
    // Meshopt may rotate a triangle's first index or narrow its integer type
    // on re-encoding. Compare oriented triangles, preserving winding.
    const rotations = [face, [face[1], face[2], face[0]], [face[2], face[0], face[1]]];
    rotations.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    triangles.push(rotations[0]);
  }
  triangles.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return digest(JSON.stringify(triangles));
}

function visibleGeometry(doc) {
  return doc.getRoot().listMeshes().filter((mesh) => !hidden.has(mesh.getExtras().object))
    .map((mesh) => ({
      name: mesh.getName(),
      extras: mesh.getExtras(),
      primitives: mesh.listPrimitives().map((primitive) => ({
        mode: primitive.getMode(),
        indices: triangleDigest(primitive.getIndices()),
        attributes: primitive.listSemantics().sort().map((semantic) => {
          const accessor = primitive.getAttribute(semantic);
          return [semantic, accessor.getType(), accessor.getNormalized(), arrayDigest(accessor.getArray())];
        })
      }))
    })).sort((a, b) => a.name.localeCompare(b.name));
}
const expected = visibleGeometry(before);
const actual = visibleGeometry(after);
assert.equal(actual.length, expected.length, "Visible mesh count changed");
for (let i = 0; i < expected.length; i++) {
  assert.equal(digest(JSON.stringify(actual[i])), digest(JSON.stringify(expected[i])),
    `Visible geometry, tags, or lightmap UVs changed: ${expected[i].name}`);
}

function placements(doc) {
  return doc.getRoot().listNodes().filter((node) => node.getMesh() && !hidden.has(node.getMesh().getExtras().object))
    .map((node) => [node.getName(), node.getMesh().getName(), node.getMatrix()])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
assert.equal(digest(JSON.stringify(placements(after))), digest(JSON.stringify(placements(before))),
  "Visible object placements changed");
const sourceTextures = new Set(before.getRoot().listTextures().map((texture) => digest(texture.getImage())));
for (const texture of after.getRoot().listTextures()) {
  assert(sourceTextures.has(digest(texture.getImage())), "Texture image bytes changed");
}
assert(after.getRoot().listMeshes().every((mesh) => !hidden.has(mesh.getExtras().object)));
assert(after.getRoot().listNodes().every((node) => !node.getExtension("KHR_lights_punctual")));
console.log("Verified: production decoder succeeds; all visible geometry, UVs, placements, and texture bytes match; baked duplicates and lights removed.");
