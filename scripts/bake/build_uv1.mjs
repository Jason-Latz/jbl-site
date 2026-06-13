// Build the lightmap-ready GLB: flatten world transforms, weld, and give every
// primitive its own second UV set (TEXCOORD_1) packed into an area-sized atlas.
// Each primitive becomes a self-contained "bake unit" (unique node/mesh/material
// name) so the Blender step can bake each to its own lightmap image with no
// UV-space collisions.
//
// Side outputs:
//   bake/desk-window-uv1.glb     geometry + uv1, world space, KHR lights kept
//   bake/rig.json                marker world-positions for the bake light rig
//   bake/bake_manifest.json      [{unit, w, h, area, src}] for the bake loop + runtime
//
// Usage: node scripts/bake/build_uv1.mjs bake/desk-window-light.glb
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, flatten, weld } from "@gltf-transform/functions";
import { writeFileSync } from "node:fs";
import { ensureWatlas, unwrap } from "./lib_unwrap.mjs";

const inPath = process.argv[2] ?? "bake/desk-window-light.glb";
const outGlb = "bake/desk-window-uv1.glb";

// Texels per world-meter of linear extent. A ~1.9 m desktop lands near 2K;
// tiny knobs collapse to a handful of texels. Clamped so nothing blows the
// per-unit atlas past 2048 (keeps each unit single-page for clean baking).
const DENSITY = 900;
const MIN_RES = 64;
const MAX_RES = 2048;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);
const root = doc.getRoot();

// --- 1. capture marker world-positions BEFORE we flatten anything away ---
const rig = {};
function captureMarkers(node, parentMatrix) {
  const name = node.getName() || "";
  // world translation = compose parent * local; gltf-transform gives world
  // matrix via getWorldMatrix-like; simplest: read node.getWorldTranslation?
  if (/^MARKER_/.test(name)) {
    const t = node.getWorldTranslation
      ? node.getWorldTranslation()
      : node.getTranslation();
    rig[name] = [t[0], t[1], t[2]];
  }
  for (const c of node.listChildren()) captureMarkers(c);
}
for (const scene of root.listScenes())
  scene.listChildren().forEach((n) => captureMarkers(n));
writeFileSync("bake/rig.json", JSON.stringify(rig, null, 2));
console.log(`rig.json: ${Object.keys(rig).length} markers`);

// --- 1b. tag each mesh with its TOP-LEVEL named ancestor (the "object":
// turntable, macbook, roomWindowConcept, …) via glTF extras, which survive
// flatten(). The runtime groups baked geometry back into clickable objects. ---
function tagObjects(node, objectName) {
  const name = objectName || node.getName() || "";
  const mesh = node.getMesh();
  if (mesh && name) {
    const ex = mesh.getExtras() || {};
    if (!ex.object) mesh.setExtras({ ...ex, object: name });
  }
  for (const c of node.listChildren()) tagObjects(c, name);
}
for (const scene of root.listScenes())
  scene.listChildren().forEach((n) => tagObjects(n, ""));

// --- 2. flatten transforms into geometry (world space) + weld ---
await doc.transform(
  dedup(),
  flatten(),
  weld({ tolerance: 0.0001, toleranceNormal: 0.05 })
);

// --- 3. per-primitive unwrap ---
await ensureWatlas();

function triArea(p, ax, bx, cx) {
  const a = [p[ax * 3], p[ax * 3 + 1], p[ax * 3 + 2]];
  const b = [p[bx * 3], p[bx * 3 + 1], p[bx * 3 + 2]];
  const c = [p[cx * 3], p[cx * 3 + 1], p[cx * 3 + 2]];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cr = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ];
  return 0.5 * Math.hypot(cr[0], cr[1], cr[2]);
}

const buffer = root.listBuffers()[0];
function vecAccessor(type, array) {
  return doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
}

const manifest = [];
let unitIndex = 0;
let totalCharts = 0;
let multiPage = 0;

const meshes = root.listMeshes();
for (const mesh of meshes) {
  for (const prim of mesh.listPrimitives()) {
    const posAttr = prim.getAttribute("POSITION");
    if (!posAttr) continue;
    const vertexCount = posAttr.getCount();
    const position = Float32Array.from(posAttr.getArray());
    const normalAttr = prim.getAttribute("NORMAL");
    const uvAttr = prim.getAttribute("TEXCOORD_0");
    const idxAcc = prim.getIndices();
    const indexArr = idxAcc ? idxAcc.getArray() : null;

    // snapshot EVERY source attribute so we can remap each through xref after
    // the unwrap re-splits vertices (COLOR_0/TANGENT/etc., not just pos/nrm/uv).
    const srcAttrs = prim.listSemantics().map((sem) => {
      const a = prim.getAttribute(sem);
      return {
        sem,
        type: a.getType(),
        normalized: a.getNormalized(),
        array: a.getArray()
      };
    });

    // surface area (welded, world space) -> atlas resolution
    let area = 0;
    if (indexArr) {
      for (let i = 0; i < indexArr.length; i += 3)
        area += triArea(position, indexArr[i], indexArr[i + 1], indexArr[i + 2]);
    } else {
      for (let i = 0; i < vertexCount; i += 3)
        area += triArea(position, i, i + 1, i + 2);
    }
    const res = Math.max(
      MIN_RES,
      Math.min(MAX_RES, Math.round(Math.sqrt(area) * DENSITY))
    );

    let out;
    try {
      out = unwrap(
        {
          position,
          normal: normalAttr ? Float32Array.from(normalAttr.getArray()) : null,
          uv: uvAttr ? Float32Array.from(uvAttr.getArray()) : null,
          index: indexArr,
          vertexCount
        },
        { resolution: res, padding: 4 }
      );
    } catch (e) {
      console.log(`  unit ${unitIndex} (${vertexCount}v) unwrap FAILED: ${e.message}`);
      continue;
    }
    if (out.atlasPages > 1) multiPage++;
    totalCharts += out.charts;

    // remap ALL source attributes through xref (vertex count changed), then
    // add the lightmap uv and the new index.
    const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
    for (const { sem, type, normalized, array } of srcAttrs) {
      const n = SIZE[type];
      const Ctor = array.constructor;
      const remapped = new Ctor(out.vertexCount * n);
      for (let j = 0; j < out.vertexCount; j++) {
        const xr = out.xref[j];
        for (let k = 0; k < n; k++) remapped[j * n + k] = array[xr * n + k];
      }
      prim.setAttribute(
        sem,
        doc
          .createAccessor()
          .setType(type)
          .setNormalized(normalized)
          .setArray(remapped)
          .setBuffer(buffer)
      );
    }
    prim.setAttribute("TEXCOORD_1", vecAccessor("VEC2", out.uv1));
    prim.setIndices(
      doc.createAccessor().setType("SCALAR").setArray(out.index).setBuffer(buffer)
    );

    const unit = `bakeunit_${String(unitIndex).padStart(3, "0")}`;
    mesh.setName(unit);
    // CLONE the material per unit: dedup() shares identical materials, so a
    // rename-in-place would make several primitives target one image with
    // overlapping uv1. A clone gives each unit its own bake image (textures
    // stay shared by reference, so this is cheap).
    const mat = prim.getMaterial();
    if (mat) {
      const cloned = mat.clone().setName(`${unit}_mat`);
      prim.setMaterial(cloned);
    }

    manifest.push({
      unit,
      object: (mesh.getExtras() && mesh.getExtras().object) || "",
      w: out.atlasWidth,
      h: out.atlasHeight,
      res,
      area: +area.toFixed(5),
      verts: out.vertexCount
    });
    unitIndex++;
  }
}

await io.write(outGlb, doc);
writeFileSync("bake/bake_manifest.json", JSON.stringify(manifest, null, 2));

const areaSorted = [...manifest].sort((a, b) => b.area - a.area);
console.log(`units: ${manifest.length}, total charts: ${totalCharts}, multi-page units: ${multiPage}`);
console.log("largest by area:");
for (const m of areaSorted.slice(0, 12))
  console.log(`  ${m.unit}  ${m.w}x${m.h}  area=${m.area}m²  ${m.verts}v`);
console.log(`wrote ${outGlb}`);
