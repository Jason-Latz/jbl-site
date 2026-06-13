// Validate watlas on real scene geometry: unwrap the heaviest few primitives
// and sanity-check the output (atlas size, page count, uv1 range, NaN guard).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { ensureWatlas, unwrap } from "./lib_unwrap.mjs";

const path = process.argv[2] ?? "bake/desk-window-light.glb";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path);
const root = doc.getRoot();

// collect (primitive, vertCount)
const prims = [];
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    prims.push({ prim, vc: pos ? pos.getCount() : 0 });
  }
}
prims.sort((a, b) => b.vc - a.vc);

await ensureWatlas();

const tStart = Date.now();
for (const { prim, vc } of prims.slice(0, 3)) {
  const position = prim.getAttribute("POSITION").getArray();
  const normalAttr = prim.getAttribute("NORMAL");
  const uvAttr = prim.getAttribute("TEXCOORD_0");
  const idxAccessor = prim.getIndices();
  const attrs = {
    position: position instanceof Float32Array ? position : new Float32Array(position),
    normal: normalAttr ? normalAttr.getArray() : null,
    uv: uvAttr ? uvAttr.getArray() : null,
    index: idxAccessor ? idxAccessor.getArray() : null,
    vertexCount: vc
  };
  const t0 = Date.now();
  let out;
  try {
    out = unwrap(attrs, { resolution: 1024, padding: 4 });
  } catch (e) {
    console.log(`  vc=${vc}: UNWRAP THREW: ${e.message}`);
    continue;
  }
  // validate uv1
  let nan = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < out.uv1.length; i++) {
    const x = out.uv1[i];
    if (Number.isNaN(x)) nan++;
    if (x < min) min = x;
    if (x > max) max = x;
  }
  console.log(
    `vc ${vc} -> out ${out.vertexCount}v, charts ${out.charts}, atlas ${out.atlasWidth}x${out.atlasHeight}, pages ${out.atlasPages}, uv1 [${min.toFixed(3)}..${max.toFixed(3)}], NaN ${nan}, ${Date.now() - t0}ms`
  );
}
console.log(`total ${Date.now() - tStart}ms`);
