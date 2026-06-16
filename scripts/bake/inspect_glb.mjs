// Introspect a GLB: list meshes, primitives, vertex counts, attributes.
// Usage: node scripts/bake/inspect_glb.mjs bake/desk-window-light.glb
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const path = process.argv[2];
if (!path) {
  console.error("usage: node inspect_glb.mjs <file.glb>");
  process.exit(1);
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path);
const root = doc.getRoot();

const meshes = root.listMeshes();
console.log(`meshes: ${meshes.length}`);
let totalVerts = 0;
const rows = [];
for (const mesh of meshes) {
  const prims = mesh.listPrimitives();
  for (let pi = 0; pi < prims.length; pi++) {
    const prim = prims[pi];
    const pos = prim.getAttribute("POSITION");
    const idx = prim.getIndices();
    const semantics = prim.listSemantics();
    const vc = pos ? pos.getCount() : 0;
    totalVerts += vc;
    rows.push({
      name: mesh.getName() || "(unnamed)",
      prim: pi,
      verts: vc,
      indexed: !!idx,
      tris: idx ? idx.getCount() / 3 : vc / 3,
      attrs: semantics.join(",")
    });
  }
}
// sort by verts desc to see the heavy hitters
rows.sort((a, b) => b.verts - a.verts);
for (const r of rows) {
  console.log(
    `${String(r.verts).padStart(7)}v ${String(Math.round(r.tris)).padStart(7)}t  ${r.indexed ? "idx" : "non"}  ${r.name}#${r.prim}  [${r.attrs}]`
  );
}
console.log(`--- total primitives: ${rows.length}, total verts: ${totalVerts}`);

// node names too (meshes may be shared/instanced)
const nodes = root.listNodes().filter((n) => n.getMesh());
console.log(`mesh-bearing nodes: ${nodes.length}`);
const markerNodes = root
  .listNodes()
  .filter((n) => /MARKER/i.test(n.getName() || ""));
console.log(`marker nodes: ${markerNodes.map((n) => n.getName()).join(", ")}`);
