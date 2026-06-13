// Core lightmap-UV unwrap: takes raw geometry attribute arrays, runs xatlas
// (via watlas), returns NEW attribute arrays with a packed uv1 channel.
//
// xatlas RE-SPLITS vertices at chart seams: the output has a different vertex
// count and order than the input, plus an `xref` per output vertex pointing
// back at the source vertex. We remap every attribute through xref so the
// returned geometry is self-consistent and carries uv1 in [0,1] atlas space.
import * as watlas from "watlas";

let initialized = false;
export async function ensureWatlas() {
  if (!initialized) {
    await watlas.Initialize();
    initialized = true;
  }
}

// attrs: { position:Float32Array, normal?:Float32Array, uv?:Float32Array,
//          index?:Uint32Array|Uint16Array, vertexCount:number }
// opts:  { resolution?:number, padding?:number, texelsPerUnit?:number,
//          bruteForce?:boolean }
// returns { position, normal, uv, uv1, index, vertexCount, atlasWidth,
//           atlasHeight, charts }
export function unwrap(attrs, opts = {}) {
  const { position, normal, uv, index, vertexCount } = attrs;
  const atlas = new watlas.Atlas();

  const meshDecl = {
    vertexPositionData: position,
    vertexCount,
    vertexPositionStride: 12
  };
  if (normal) {
    meshDecl.vertexNormalData = normal;
    meshDecl.vertexNormalStride = 12;
  }
  if (uv) {
    meshDecl.vertexUvData = uv;
    meshDecl.vertexUvStride = 8;
  }
  if (index) {
    // watlas wants Uint16Array or Uint32Array; coerce Uint16 up to be safe.
    meshDecl.indexData =
      index instanceof Uint32Array ? index : new Uint32Array(index);
    meshDecl.indexCount = index.length;
  }
  atlas.addMesh(meshDecl);

  atlas.generate(
    {
      // give the packer room to make sensible lightmap charts
      maxIterations: 2
    },
    {
      resolution: opts.resolution ?? 0, // 0 = let xatlas choose from texelsPerUnit
      texelsPerUnit: opts.texelsPerUnit ?? 0,
      padding: opts.padding ?? 4,
      bilinear: true,
      blockAlign: true,
      bruteForce: opts.bruteForce ?? false,
      rotateCharts: true
    }
  );

  const width = atlas.width;
  const height = atlas.height;
  const mesh = atlas.getMesh(0);

  const outCount = mesh.vertexCount;
  const newIndex = new Uint32Array(mesh.indexCount);
  mesh.getIndexArray(newIndex);

  const newPos = new Float32Array(outCount * 3);
  const newNrm = normal ? new Float32Array(outCount * 3) : null;
  const newUv = uv ? new Float32Array(outCount * 2) : null;
  const newUv1 = new Float32Array(outCount * 2);
  // xref[j] = source vertex index for output vertex j. The caller uses this to
  // remap ANY attribute (color, tangent, …), not just the three we touch here.
  const xref = new Uint32Array(outCount);

  let atlasPages = 0;
  for (let j = 0; j < outCount; j++) {
    const v = mesh.getVertex(j);
    const xr = v.xref;
    xref[j] = xr;
    newPos[j * 3] = position[xr * 3];
    newPos[j * 3 + 1] = position[xr * 3 + 1];
    newPos[j * 3 + 2] = position[xr * 3 + 2];
    if (newNrm) {
      newNrm[j * 3] = normal[xr * 3];
      newNrm[j * 3 + 1] = normal[xr * 3 + 1];
      newNrm[j * 3 + 2] = normal[xr * 3 + 2];
    }
    if (newUv) {
      newUv[j * 2] = uv[xr * 2];
      newUv[j * 2 + 1] = uv[xr * 2 + 1];
    }
    newUv1[j * 2] = v.uv[0] / width;
    newUv1[j * 2 + 1] = v.uv[1] / height;
    if (v.atlasIndex + 1 > atlasPages) atlasPages = v.atlasIndex + 1;
  }

  const chartCount = mesh.chartCount;
  atlas.delete();

  return {
    position: newPos,
    normal: newNrm,
    uv: newUv,
    uv1: newUv1,
    index: newIndex,
    xref,
    vertexCount: outCount,
    atlasWidth: width,
    atlasHeight: height,
    atlasPages,
    charts: chartCount
  };
}
