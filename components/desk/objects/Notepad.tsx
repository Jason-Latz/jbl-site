"use client";

import { useMemo } from "react";
import * as THREE from "three";
import {
  PALETTE,
  brushedMetalMaterial,
  chromeMaterial,
  lacquerMaterial,
  makeCanvasTexture,
  paperMaterial
} from "@/lib/three/materials";

const PAD_W = 0.148;
const PAD_D = 0.21;

const BACK_H = 0.0016; // chipboard backing
const STRAY_T = 0.0002; // each loose bottom sheet
const STRAY_COUNT = 3;
const STACK_BASE = BACK_H + STRAY_T * STRAY_COUNT;
const STACK_H = 0.0054; // bound page block
const SHEET_Y = STACK_BASE + STACK_H + 0.00012;

const LOOP_COUNT = 14;
const COIL_R = 0.0045;
const WIRE_R = 0.0009;
const COIL_Y = COIL_R + WIRE_R + 0.0001; // wire rests on the desk (jitter-safe)
const COIL_Z = -PAD_D / 2 + 0.0008;
const LOOP_SPAN = PAD_W - 0.013;
const LOOP_GAP = LOOP_SPAN / (LOOP_COUNT - 1);
const LOOP_XS = Array.from(
  { length: LOOP_COUNT },
  (_, i) => -LOOP_SPAN / 2 + LOOP_GAP * i
);

// Angle at which the wire pierces the page block; punch holes line up with it.
const THETA0 = Math.asin((SHEET_Y - COIL_Y + 0.0002) / COIL_R);
const HOLE_INSET = 0.0008 + COIL_R * Math.cos(THETA0);

const PEN_L = 0.144;
const PEN_HALF = PEN_L / 2;

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundedRectShape(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hd = d / 2;
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hw, hd - r);
  s.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hw + r, hd);
  s.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hd + r);
  s.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// Rounded-corner slab lying flat, base at y=0. Group 0 = caps, group 1 = walls.
// Wall UVs run (perimeter, height) so the page-edge striations read as leaves.
function makeSlabGeometry(
  w: number,
  d: number,
  h: number,
  r: number
): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, d, r), {
    depth: h,
    bevelEnabled: false,
    curveSegments: 4,
    steps: 1
  });
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (Math.abs(nor.getY(i)) > 0.5) {
      uv.setXY(i, (x + w / 2) / w, (d / 2 - z) / d);
    } else {
      uv.setXY(i, (x + z) * 9, y / h);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

function sampleProfile(ctrl: [number, number][], n: number): THREE.Vector2[] {
  const curve = new THREE.CatmullRomCurve3(
    ctrl.map(([x, y]) => new THREE.Vector3(x, y, 0))
  );
  return curve.getPoints(n).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
}

type Draw = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rand: () => number
) => void;

const drawPaperBase: Draw = (ctx, w, h, rand) => {
  ctx.fillStyle = "#f7f1e2";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 46; i++) {
    ctx.fillStyle = rand() > 0.5 ? "#efe6d0" : "#fbf6ea";
    ctx.globalAlpha = 0.06 + rand() * 0.1;
    const r = (0.03 + rand() * 0.1) * w;
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#d9cdb4";
  ctx.lineWidth = 1;
  for (let i = 0; i < 520; i++) {
    ctx.globalAlpha = 0.04 + rand() * 0.06;
    const x = rand() * w;
    const y = rand() * h;
    const a = rand() * Math.PI;
    const l = (0.002 + rand() * 0.007) * w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

function drawRulesAndHoles(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rand: () => number,
  opts: { lineAlpha: number; holeAlpha: number }
): void {
  const top = h * 0.132;
  const step = (0.008 / PAD_D) * h;
  ctx.strokeStyle = "#cfc0a3";
  for (let y = top; y < h - step * 0.4; y += step) {
    ctx.lineWidth = Math.max(1, h * 0.001) + rand() * 0.6;
    ctx.globalAlpha = opts.lineAlpha * (0.8 + rand() * 0.2);
    ctx.beginPath();
    const x0 = w * 0.018;
    ctx.moveTo(x0, y + (rand() - 0.5) * 1.5);
    const segs = 8;
    for (let s2 = 1; s2 <= segs; s2++) {
      ctx.lineTo(
        x0 + (w * 0.964 * s2) / segs,
        y + Math.sin(s2 * 1.3 + y) * h * 0.0005 + (rand() - 0.5) * 1.2
      );
    }
    ctx.stroke();
  }
  // margin line
  ctx.strokeStyle = "#cb8b7a";
  ctx.lineWidth = Math.max(1.4, h * 0.0013);
  ctx.globalAlpha = opts.lineAlpha * 0.95;
  ctx.beginPath();
  ctx.moveTo(w * 0.148, h * 0.1);
  ctx.quadraticCurveTo(w * 0.1495, h * 0.55, w * 0.148, h * 0.995);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // punch holes lined up with where the coil pierces the pages
  const holeY = (HOLE_INSET / PAD_D) * h;
  const holeR = (0.0016 / PAD_W) * w;
  for (const lx of LOOP_XS) {
    const x = ((lx + PAD_W / 2) / PAD_W) * w + (rand() - 0.5) * 2;
    const g = ctx.createRadialGradient(x, holeY, holeR * 0.15, x, holeY, holeR);
    g.addColorStop(0, "#564d40");
    g.addColorStop(0.72, "#6e6354");
    g.addColorStop(1, "#a4977f");
    ctx.fillStyle = g;
    ctx.globalAlpha = opts.holeAlpha;
    ctx.beginPath();
    ctx.arc(x, holeY, holeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fdf8ec";
    ctx.globalAlpha = opts.holeAlpha * 0.35;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(x, holeY, holeR + 1.1, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // shading where the page dives toward the coil
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.07);
  grad.addColorStop(0, "rgba(96, 84, 64, 0.16)");
  grad.addColorStop(1, "rgba(96, 84, 64, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h * 0.07);
}

const INK = "#3a3026";
const HAND_FONT = "'Segoe Script','Bradley Hand','Comic Sans MS',Georgia,cursive";

const drawTopSheet: Draw = (ctx, w, h, rand) => {
  drawPaperBase(ctx, w, h, rand);
  drawRulesAndHoles(ctx, w, h, rand, { lineAlpha: 0.85, holeAlpha: 1 });

  const top = h * 0.132;
  const step = (0.008 / PAD_D) * h;

  // handwriting with an uneven baseline, double-struck for ink bleed
  const writeLine = (
    text: string,
    x: number,
    baseline: number,
    size: number,
    slant: number
  ) => {
    ctx.font = `italic ${Math.round(size)}px ${HAND_FONT}`;
    ctx.save();
    ctx.translate(x, baseline);
    ctx.rotate(slant);
    let cx = 0;
    for (const word of text.split(" ")) {
      const dy = (rand() - 0.5) * size * 0.14;
      const rot = (rand() - 0.5) * 0.05;
      ctx.save();
      ctx.translate(cx, dy);
      ctx.rotate(rot);
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.26;
      ctx.fillText(word, size * 0.018, size * 0.016);
      ctx.globalAlpha = 0.92;
      ctx.fillText(word, 0, 0);
      ctx.restore();
      cx += ctx.measureText(`${word} `).width;
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  writeLine("leave a note", w * 0.2, top + 2 * step - step * 0.18, step * 0.78, -0.014);
  writeLine("soon — this pad goes live", w * 0.17, top + 3 * step - step * 0.18, step * 0.6, 0.009);
  writeLine("for every visitor", w * 0.24, top + 4 * step - step * 0.18, step * 0.6, -0.006);

  // squiggle underline
  ctx.strokeStyle = INK;
  ctx.lineCap = "round";
  ctx.lineWidth = h * 0.0016;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  const uy = top + 2 * step + step * 0.1;
  ctx.moveTo(w * 0.2, uy);
  for (let s2 = 1; s2 <= 14; s2++) {
    const ux = w * 0.2 + (w * 0.34 * s2) / 14;
    ctx.lineTo(ux, uy + Math.sin(s2 * 1.9) * h * 0.0022 + (rand() - 0.5) * 2);
  }
  ctx.stroke();

  // sunburst doodle, slightly lopsided like a real margin doodle
  const cx = w * 0.78;
  const cy = h * 0.83;
  ctx.lineWidth = h * 0.0021;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.013, 0.25, Math.PI * 2 - 0.15);
  ctx.stroke();
  const rays = 11;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + 0.32 + (rand() - 0.5) * 0.14;
    const inner = w * (0.02 + rand() * 0.004);
    const outer = inner + w * (0.018 + rand() * 0.014);
    ctx.globalAlpha = 0.7 + rand() * 0.25;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

// Underside of the curled sheet: blank paper with rule show-through.
const drawSheetBack: Draw = (ctx, w, h, rand) => {
  drawPaperBase(ctx, w, h, rand);
  drawRulesAndHoles(ctx, w, h, rand, { lineAlpha: 0.18, holeAlpha: 0.85 });
};

// Second page, revealed under the lifted corner.
const drawUnderSheet: Draw = (ctx, w, h, rand) => {
  drawPaperBase(ctx, w, h, rand);
  drawRulesAndHoles(ctx, w, h, rand, { lineAlpha: 0.62, holeAlpha: 0.9 });
};

// Leaf striations for the three open page-block sides.
const drawPageEdge: Draw = (ctx, w, h, rand) => {
  ctx.fillStyle = "#ece1c9";
  ctx.fillRect(0, 0, w, h);
  const tones = ["#fdf8ec", "#e6dabd", "#d8cba9", "#f5eedd", "#c9ba96"];
  let y = 1;
  while (y < h) {
    const tone = tones[Math.floor(rand() * tones.length)];
    ctx.strokeStyle = tone;
    ctx.globalAlpha = 0.35 + rand() * 0.5;
    ctx.lineWidth = 0.8 + rand() * 1.3;
    const wob = rand() * 6.3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += w / 24) {
      ctx.lineTo(x, y + Math.sin(x * 0.02 + wob) * 0.7 + (rand() - 0.5) * 0.8);
    }
    ctx.stroke();
    y += 2.5 + rand() * 3;
  }
  // broad tone bands so the block doesn't read flat
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = rand() > 0.5 ? "#dccfae" : "#f8f2e2";
    ctx.globalAlpha = 0.07 + rand() * 0.08;
    const by = rand() * h;
    ctx.fillRect(0, by, w, 8 + rand() * 26);
  }
  ctx.globalAlpha = 1;
};

const drawKraft: Draw = (ctx, w, h, rand) => {
  ctx.fillStyle = "#8b7150";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 380; i++) {
    ctx.strokeStyle = rand() > 0.55 ? "#6f5638" : "#a08259";
    ctx.globalAlpha = 0.08 + rand() * 0.14;
    ctx.lineWidth = 0.6 + rand() * 1.6;
    const x = rand() * w;
    const y = rand() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 40, y + (rand() - 0.5) * 7);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

const drawPaperNoise: Draw = (ctx, w, h, rand) => {
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const v = 96 + Math.floor(rand() * 64);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
  ctx.globalAlpha = 1;
};

// Spiral-bound A5 notepad lying flat, pen resting alongside.
// The future guestbook — top sheet promises notes from visitors.
export default function Notepad() {
  // --- page block + backing -------------------------------------------------
  const backingGeo = useMemo(
    () => makeSlabGeometry(PAD_W + 0.001, PAD_D + 0.001, BACK_H, 0.002),
    []
  );
  const stackGeo = useMemo(
    () => makeSlabGeometry(PAD_W, PAD_D, STACK_H, 0.0015),
    []
  );

  const backingMat = useMemo(() => {
    const rand = seededRand(11);
    const tex = makeCanvasTexture(512, 512, (c, w, h) => drawKraft(c, w, h, rand), {
      anisotropy: 8,
      repeat: [1, 1]
    });
    const m = new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: tex,
      bumpScale: 0.0006,
      roughness: 0.9,
      metalness: 0
    });
    return m;
  }, []);

  const edgeMat = useMemo(() => {
    const rand = seededRand(23);
    const tex = makeCanvasTexture(
      1024,
      256,
      (c, w, h) => drawPageEdge(c, w, h, rand),
      { anisotropy: 8, repeat: [1, 1] }
    );
    return new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: tex,
      bumpScale: 0.0005,
      roughness: 0.96,
      metalness: 0
    });
  }, []);

  const stackTopMat = useMemo(() => {
    const rand = seededRand(37);
    const tex = makeCanvasTexture(
      724,
      1024,
      (c, w, h) => drawUnderSheet(c, w, h, rand),
      { anisotropy: 8 }
    );
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.94,
      metalness: 0
    });
  }, []);

  // loose bottom sheets that stick out a hair unevenly
  const strays = useMemo(() => {
    const rand = seededRand(53);
    const tints = ["#efe5d0", "#f3ead7", "#ebe1ca"];
    return tints.map((tint, i) => ({
      material: paperMaterial(tint),
      x: (rand() - 0.3) * 0.0017,
      z: (rand() - 0.25) * 0.002,
      rot: (rand() - 0.5) * 0.018,
      y: BACK_H + STRAY_T * (i + 0.5)
    }));
  }, []);

  // --- top sheet with the curled corner --------------------------------------
  const sheetGeo = useMemo(() => {
    const rand = seededRand(71);
    const ph1 = rand() * Math.PI * 2;
    const ph2 = rand() * Math.PI * 2;
    const geo = new THREE.PlaneGeometry(PAD_W, PAD_D, 42, 56);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // binding at local +y (world -z); free corner at (+W/2, -D/2)
      const d1 = Math.hypot(x - PAD_W / 2, y + PAD_D / 2);
      const lift = 0.0082 * Math.pow(Math.max(0, 1 - d1 / 0.08), 2.25);
      const d2 = Math.hypot(x + PAD_W / 2, y + PAD_D / 2);
      const lift2 = 0.0013 * Math.pow(Math.max(0, 1 - d2 / 0.042), 2.5);
      const wgt = (PAD_D / 2 - y) / PAD_D;
      const ripple =
        0.00016 * Math.sin(x * 210 + ph1) * Math.sin(y * 150 + ph2) * wgt;
      const bow = 0.00045 * wgt * wgt;
      // paper keeps its length: lifted region pulls in toward the fold axis
      const pull = lift * 0.42 * 0.707;
      pos.setXYZ(i, x - pull, y + pull, lift + lift2 + ripple + bow);
    }
    geo.computeVertexNormals();
    const idx = geo.getIndex();
    if (idx) {
      geo.clearGroups();
      geo.addGroup(0, idx.count, 0); // front face
      geo.addGroup(0, idx.count, 1); // underside, revealed by the curl
    }
    return geo;
  }, []);

  const sheetMats = useMemo(() => {
    const rand = seededRand(89);
    const noise = makeCanvasTexture(
      256,
      256,
      (c, w, h) => drawPaperNoise(c, w, h, rand),
      { srgb: false, repeat: [6, 8], anisotropy: 8 }
    );
    const front = new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(1448, 2048, (c, w, h) => drawTopSheet(c, w, h, rand), {
        anisotropy: 8
      }),
      bumpMap: noise,
      bumpScale: 0.00045,
      roughness: 0.93,
      metalness: 0,
      side: THREE.FrontSide
    });
    const back = new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(724, 1024, (c, w, h) => drawSheetBack(c, w, h, rand), {
        anisotropy: 8
      }),
      bumpMap: noise,
      bumpScale: 0.00045,
      roughness: 0.95,
      metalness: 0,
      side: THREE.BackSide
    });
    return [front, back];
  }, []);

  // --- coil: one continuous wire helix ---------------------------------------
  const gunmetal = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: "#454850",
      metalness: 0.92,
      roughness: 0.35
    });
    m.envMapIntensity = 1.15;
    return m;
  }, []);

  const coil = useMemo(() => {
    const rand = seededRand(101);
    const p1 = rand() * Math.PI * 2;
    const p2 = rand() * Math.PI * 2;
    const p3 = rand() * Math.PI * 2;
    const turns = LOOP_COUNT - 1;
    const start = THETA0 - 1.9;
    const end = THETA0 + Math.PI * 2 * turns + 1.9;
    const n = 440;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const th = start + ((end - start) * i) / n;
      const rr =
        COIL_R *
        (1 + 0.011 * Math.sin(th * 0.41 + p1) + 0.007 * Math.sin(th * 1.27 + p2));
      pts.push(
        new THREE.Vector3(
          LOOP_XS[0] +
            ((th - THETA0) / (Math.PI * 2)) * LOOP_GAP +
            0.00012 * Math.sin(th * 0.9 + p3),
          COIL_Y + rr * Math.sin(th),
          COIL_Z + rr * Math.cos(th)
        )
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return {
      tube: new THREE.TubeGeometry(curve, 420, WIRE_R, 8, false),
      cap: new THREE.SphereGeometry(WIRE_R * 1.02, 10, 8),
      ends: [pts[0], pts[n]] as const
    };
  }, []);

  // --- pen: lathe-turned instrument ------------------------------------------
  const chrome = useMemo(() => chromeMaterial(), []);
  const brushed = useMemo(() => brushedMetalMaterial("#cac5b9"), []);
  const penDark = useMemo(
    () =>
      lacquerMaterial(PALETTE.inkDark, {
        clearcoat: 0.6,
        clearcoatRoughness: 0.16,
        roughness: 0.3
      }),
    []
  );

  const pen = useMemo(() => {
    // grip waist + seat, then a gently bellied barrel (y = distance from tip)
    const bodyPts = [
      ...sampleProfile(
        [
          [0.0035, 0.0106],
          [0.00405, 0.014],
          [0.00385, 0.0205],
          [0.00432, 0.0276],
          [0.0049, 0.031]
        ],
        14
      ),
      new THREE.Vector2(0.00503, 0.0316),
      new THREE.Vector2(0.00505, 0.0322),
      ...sampleProfile(
        [
          [0.0052, 0.0348],
          [0.00547, 0.043],
          [0.00558, 0.0565],
          [0.00547, 0.07],
          [0.00512, 0.0805],
          [0.00495, 0.0875]
        ],
        16
      )
    ];
    const tipPts = [
      new THREE.Vector2(0, 0),
      ...sampleProfile(
        [
          [0.00025, 0.0002],
          [0.0006, 0.0009],
          [0.00115, 0.0024],
          [0.0019, 0.005],
          [0.00285, 0.0082],
          [0.00352, 0.0108]
        ],
        12
      )
    ];
    const bandPts = [
      new THREE.Vector2(0.00498, 0.0314),
      new THREE.Vector2(0.0054, 0.0319),
      new THREE.Vector2(0.0054, 0.0344),
      new THREE.Vector2(0.00498, 0.0349)
    ];
    // cap: flared mouth lip, taper, rounded finial
    const capPts = [
      new THREE.Vector2(0.0049, 0.083),
      new THREE.Vector2(0.0062, 0.083),
      new THREE.Vector2(0.00652, 0.084),
      new THREE.Vector2(0.0065, 0.0852),
      ...sampleProfile(
        [
          [0.00643, 0.088],
          [0.00634, 0.101],
          [0.00625, 0.115],
          [0.00603, 0.128],
          [0.00558, 0.1362],
          [0.00452, 0.141],
          [0.00295, 0.143],
          [0.00125, 0.1438],
          [0, 0.144]
        ],
        20
      )
    ];
    // clip in pen space (axis along +x, tip at -PEN_HALF), arched over the cap
    const clipCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.0651, 0.004, 0),
      new THREE.Vector3(0.0658, 0.0075, 0),
      new THREE.Vector3(0.064, 0.009, 0),
      new THREE.Vector3(0.056, 0.0089, 0),
      new THREE.Vector3(0.043, 0.0079, 0),
      new THREE.Vector3(0.03, 0.0071, 0),
      new THREE.Vector3(0.021, 0.0067, 0)
    ]);
    return {
      body: new THREE.LatheGeometry(bodyPts, 48),
      tip: new THREE.LatheGeometry(tipPts, 40),
      band: new THREE.LatheGeometry(bandPts, 48),
      cap: new THREE.LatheGeometry(capPts, 48),
      clip: new THREE.TubeGeometry(clipCurve, 40, 0.00075, 8, false),
      ball: new THREE.SphereGeometry(0.00115, 14, 10)
    };
  }, []);

  return (
    <group>
      {/* chipboard backing */}
      <mesh geometry={backingGeo} material={backingMat} castShadow receiveShadow />

      {/* loose bottom sheets peeking out unevenly */}
      {strays.map((s, i) => (
        <mesh
          key={i}
          position={[s.x, s.y, s.z]}
          rotation={[0, s.rot, 0]}
          material={s.material}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[PAD_W - 0.001, STRAY_T, PAD_D - 0.001]} />
        </mesh>
      ))}

      {/* bound page block: ruled second page on top, leaf striations on sides */}
      <mesh
        geometry={stackGeo}
        material={[stackTopMat, edgeMat]}
        position={[0, STACK_BASE, 0]}
        castShadow
        receiveShadow
      />

      {/* top sheet, corner curling up off the stack */}
      <mesh
        geometry={sheetGeo}
        material={sheetMats}
        position={[0, SHEET_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0.006]}
        castShadow
        receiveShadow
      />

      {/* one continuous wire coil through the punch holes */}
      <mesh geometry={coil.tube} material={gunmetal} castShadow />
      {coil.ends.map((p, i) => (
        <mesh
          key={i}
          geometry={coil.cap}
          material={gunmetal}
          position={[p.x, p.y, p.z]}
        />
      ))}

      {/* pen resting beside the pad, clip up, tip toward the curled corner */}
      <group position={[0.113, 0.006, 0.028]} rotation={[0, 1.1, 0]}>
        <group rotation={[0, 0, 0.04]}>
          <group position={[-PEN_HALF, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <mesh geometry={pen.tip} material={chrome} castShadow />
            <mesh geometry={pen.body} material={penDark} castShadow />
            <mesh geometry={pen.band} material={chrome} castShadow />
            <mesh geometry={pen.cap} material={penDark} castShadow />
          </group>
          <mesh geometry={pen.clip} material={brushed} castShadow />
          <mesh
            geometry={pen.ball}
            material={brushed}
            position={[0.0208, 0.0066, 0]}
            castShadow
          />
        </group>
      </group>
    </group>
  );
}
