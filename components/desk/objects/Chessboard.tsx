"use client";

import { useMemo } from "react";
import * as THREE from "three";
import {
  feltMaterial,
  lacquerMaterial,
  lacqueredWoodMaterial,
  makeCanvasTexture
} from "@/lib/three/materials";

export type PieceKind =
  | "pawn"
  | "rook"
  | "knight"
  | "bishop"
  | "queen"
  | "king";

export type Piece = {
  kind: PieceKind;
  color: "white" | "black";
  square: string; // "a1".."h8"
};

export const SQUARE_SIZE = 0.034;

const BOARD_THICKNESS = 0.016;
// Playing surface (squares + coordinate border) sits just above the frame
// molding's inner lip; the lip rises 0.7mm proud like a real framed board.
const SURFACE_SIZE = 0.298;
const SURFACE_LIFT = 0.0003;
const FELT_H = 0.0008;
const PIECE_LIFT = 0.00005;

const FILES = "abcdefgh";

// Board-local contract reused by Stage 3 when positions come from the
// database: a1 = white's queenside corner at [-3.5s, +3.5s], so white's
// ranks 1-2 occupy the +z half and face toward -z.
export function squareToLocal(square: string): [number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = square.charCodeAt(1) - 49;
  return [(file - 3.5) * SQUARE_SIZE, (3.5 - rank) * SQUARE_SIZE];
}

const BACK_RANK: PieceKind[] = [
  "rook",
  "knight",
  "bishop",
  "queen",
  "king",
  "bishop",
  "knight",
  "rook"
];

export const START_POSITION: Piece[] = [
  ...BACK_RANK.map((kind, i) => ({
    kind,
    color: "white" as const,
    square: `${FILES.charAt(i)}1`
  })),
  ...BACK_RANK.map((_, i) => ({
    kind: "pawn" as const,
    color: "white" as const,
    square: `${FILES.charAt(i)}2`
  })),
  ...BACK_RANK.map((_, i) => ({
    kind: "pawn" as const,
    color: "black" as const,
    square: `${FILES.charAt(i)}7`
  })),
  ...BACK_RANK.map((kind, i) => ({
    kind,
    color: "black" as const,
    square: `${FILES.charAt(i)}8`
  }))
];

function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Staunton silhouettes are hand-authored control polylines run through a
// centripetal Catmull-Rom so turns stay smooth but beads/collars stay crisp.
function smoothProfile(controls: number[][], samples: number): THREE.Vector2[] {
  const curve = new THREE.CatmullRomCurve3(
    controls.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    false,
    "centripetal"
  );
  return curve
    .getPoints(samples)
    .map((p) => new THREE.Vector2(Math.max(p.x, 0.00004), p.y));
}

function latheFrom(
  controls: number[][],
  samples: number,
  segments: number
): THREE.LatheGeometry {
  return new THREE.LatheGeometry(smoothProfile(controls, samples), segments);
}

// Tiny extruded rounded bar — used wherever a raw box edge would show
// (rook merlons, king's cross).
function roundedBar(
  w: number,
  h: number,
  d: number,
  r: number,
  bevelSegments = 2
): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const x = w / 2 - r;
  const y = h / 2 - r;
  s.absarc(x, y, r, 0, Math.PI / 2, false);
  s.absarc(-x, y, r, Math.PI / 2, Math.PI, false);
  s.absarc(-x, -y, r, Math.PI, Math.PI * 1.5, false);
  s.absarc(x, -y, r, Math.PI * 1.5, Math.PI * 2, false);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: d - r * 2,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r * 0.85,
    bevelSegments,
    curveSegments: 3
  });
  geo.translate(0, 0, -(d - r * 2) / 2);
  return geo;
}

// Sweeps a 2D molding profile (r = half-extent from center, y = height)
// around a square path. Because every ring is a concentric square the four
// 45-degree miters line up exactly — a real picture-frame molding.
function squareFrameGeometry(
  profile: THREE.Vector2[],
  lengthSegs: number
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const cols = lengthSegs + 1;
  for (let side = 0; side < 4; side++) {
    const base = pos.length / 3;
    for (let i = 0; i < profile.length; i++) {
      const r = profile[i].x;
      const py = profile[i].y;
      for (let j = 0; j <= lengthSegs; j++) {
        const a = -r + 2 * r * (j / lengthSegs);
        if (side === 0) pos.push(a, py, -r);
        else if (side === 1) pos.push(r, py, a);
        else if (side === 2) pos.push(-a, py, r);
        else pos.push(-r, py, -a);
        uvs.push(j / lengthSegs, i / (profile.length - 1));
      }
    }
    for (let i = 0; i < profile.length - 1; i++) {
      for (let j = 0; j < lengthSegs; j++) {
        const a0 = base + i * cols + j;
        const b0 = a0 + cols;
        idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

type Part = {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
  material?: THREE.Material;
};

export default function Chessboard() {
  const surfaceTexture = useMemo(
    () =>
      makeCanvasTexture(
        2048,
        2048,
        (ctx, w, h) => {
          const rand = mulberry32(7321);
          const sq = (SQUARE_SIZE / SURFACE_SIZE) * w;
          const grid = sq * 8;
          const m = (w - grid) / 2;

          // Walnut coordinate border
          ctx.fillStyle = "#583922";
          ctx.fillRect(0, 0, w, h);
          for (let i = 0; i < 140; i++) {
            ctx.strokeStyle = rand() < 0.7 ? "#3c2613" : "#6b4a2c";
            ctx.globalAlpha = 0.05 + rand() * 0.08;
            ctx.lineWidth = 0.7 + rand() * 1.8;
            const y = rand() * h;
            const wob = (rand() - 0.5) * 18;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(
              w * 0.33,
              y + wob,
              w * 0.66,
              y - wob,
              w,
              y + (rand() - 0.5) * 12
            );
            ctx.stroke();
          }
          ctx.globalAlpha = 1;

          // Canvas bottom = local +z = rank 1, so a1 lands dark on the
          // bottom-left, matching squareToLocal. Each square is its own
          // veneer patch: jittered tone, directional grain, seam shading.
          for (let f = 0; f < 8; f++) {
            for (let r = 0; r < 8; r++) {
              const x = m + f * sq;
              const y = h - m - (r + 1) * sq;
              const light = (f + r) % 2 === 1;
              const t = (rand() - 0.5) * 16;
              ctx.fillStyle = light
                ? `rgb(${Math.round(233 + t)}, ${Math.round(219 + t)}, ${Math.round(192 + t)})`
                : `rgb(${Math.round(100 + t)}, ${Math.round(63 + t * 0.7)}, ${Math.round(35 + t * 0.5)})`;
              ctx.fillRect(x - 0.5, y - 0.5, sq + 1, sq + 1);

              ctx.save();
              ctx.beginPath();
              ctx.rect(x, y, sq, sq);
              ctx.clip();
              const n = 16 + Math.floor(rand() * 7);
              for (let g = 0; g < n; g++) {
                ctx.strokeStyle = light
                  ? rand() < 0.5
                    ? "#c9b890"
                    : "#f4ead2"
                  : rand() < 0.6
                    ? "#46290f"
                    : "#7d5530";
                ctx.globalAlpha = 0.07 + rand() * 0.1;
                ctx.lineWidth = 0.6 + rand() * 1.4;
                ctx.beginPath();
                if (light) {
                  // maple: grain runs with the files
                  const gx = x + rand() * sq;
                  ctx.moveTo(gx, y - 4);
                  ctx.bezierCurveTo(
                    gx + (rand() - 0.5) * 7,
                    y + sq * 0.33,
                    gx + (rand() - 0.5) * 7,
                    y + sq * 0.66,
                    gx + (rand() - 0.5) * 5,
                    y + sq + 4
                  );
                } else {
                  // walnut: grain runs with the ranks
                  const gy = y + rand() * sq;
                  ctx.moveTo(x - 4, gy);
                  ctx.bezierCurveTo(
                    x + sq * 0.33,
                    gy + (rand() - 0.5) * 7,
                    x + sq * 0.66,
                    gy + (rand() - 0.5) * 7,
                    x + sq + 4,
                    gy + (rand() - 0.5) * 5
                  );
                }
                ctx.stroke();
              }
              if (!light && rand() < 0.4) {
                // occasional cathedral figure in the walnut
                const cx = x + rand() * sq;
                const cy = y + sq * (0.8 + rand() * 0.6);
                for (let k = 1; k <= 3; k++) {
                  ctx.strokeStyle = "#3a2310";
                  ctx.globalAlpha = 0.1 - k * 0.02;
                  ctx.lineWidth = 1.4;
                  ctx.beginPath();
                  ctx.ellipse(
                    cx,
                    cy,
                    k * sq * 0.16,
                    k * sq * 0.3,
                    0,
                    Math.PI,
                    Math.PI * 2
                  );
                  ctx.stroke();
                }
              }
              ctx.restore();
              ctx.globalAlpha = 0.3;
              ctx.strokeStyle = light ? "#9d8a64" : "#241405";
              ctx.lineWidth = 1.2;
              ctx.strokeRect(x + 0.6, y + 0.6, sq - 1.2, sq - 1.2);
              ctx.globalAlpha = 1;
            }
          }

          // 1mm maple inlay line with ebony purfling either side
          const inlay = (0.001 / SURFACE_SIZE) * w;
          const off = inlay * 2.2;
          ctx.strokeStyle = "#241608";
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = inlay * 0.35;
          ctx.strokeRect(
            m - off - inlay * 0.85,
            m - off - inlay * 0.85,
            grid + (off + inlay * 0.85) * 2,
            grid + (off + inlay * 0.85) * 2
          );
          ctx.strokeRect(
            m - off + inlay * 0.85,
            m - off + inlay * 0.85,
            grid + (off - inlay * 0.85) * 2,
            grid + (off - inlay * 0.85) * 2
          );
          ctx.strokeStyle = "#e3cda1";
          ctx.globalAlpha = 0.95;
          ctx.lineWidth = inlay;
          ctx.strokeRect(m - off, m - off, grid + off * 2, grid + off * 2);
          ctx.globalAlpha = 1;

          // Coordinates in the border
          ctx.fillStyle = "#caa771";
          ctx.globalAlpha = 0.55;
          ctx.font = `${Math.round(m * 0.42)}px Georgia, 'Times New Roman', serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (let f = 0; f < 8; f++) {
            ctx.fillText(FILES.charAt(f), m + (f + 0.5) * sq, h - m * 0.4);
          }
          for (let r = 0; r < 8; r++) {
            ctx.fillText(String(r + 1), m * 0.4, h - m - (r + 0.5) * sq);
          }
          ctx.globalAlpha = 1;

          // Varnish vignette toward the frame
          const grad = ctx.createRadialGradient(
            w / 2,
            h / 2,
            w * 0.35,
            w / 2,
            h / 2,
            w * 0.72
          );
          grad.addColorStop(0, "rgba(0,0,0,0)");
          grad.addColorStop(1, "rgba(40,20,5,0.10)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        },
        { anisotropy: 8 }
      ),
    []
  );

  const surfaceBump = useMemo(
    () =>
      makeCanvasTexture(
        1024,
        1024,
        (ctx, w, h) => {
          const rand = mulberry32(4117);
          ctx.fillStyle = "#808080";
          ctx.fillRect(0, 0, w, h);
          const sq = (SQUARE_SIZE / SURFACE_SIZE) * w;
          const grid = sq * 8;
          const m = (w - grid) / 2;
          for (let f = 0; f < 8; f++) {
            for (let r = 0; r < 8; r++) {
              const x = m + f * sq;
              const y = h - m - (r + 1) * sq;
              const light = (f + r) % 2 === 1;
              for (let g = 0; g < 12; g++) {
                const v = Math.round(112 + rand() * 34);
                ctx.strokeStyle = `rgb(${v},${v},${v})`;
                ctx.globalAlpha = 0.5;
                ctx.lineWidth = 0.6 + rand();
                ctx.beginPath();
                if (light) {
                  const gx = x + rand() * sq;
                  ctx.moveTo(gx, y);
                  ctx.lineTo(gx + (rand() - 0.5) * 4, y + sq);
                } else {
                  const gy = y + rand() * sq;
                  ctx.moveTo(x, gy);
                  ctx.lineTo(x + sq, gy + (rand() - 0.5) * 4);
                }
                ctx.stroke();
              }
            }
          }
          // veneer seams read as fine grooves under the varnish
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = "#5e5e5e";
          ctx.lineWidth = 1.5;
          for (let i = 0; i <= 8; i++) {
            ctx.beginPath();
            ctx.moveTo(m + i * sq, m);
            ctx.lineTo(m + i * sq, m + grid);
            ctx.moveTo(m, m + i * sq);
            ctx.lineTo(m + grid, m + i * sq);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
        { srgb: false, anisotropy: 8 }
      ),
    []
  );

  const materials = useMemo(() => {
    const whiteA = lacquerMaterial("#e8dcc2", { roughness: 0.3, clearcoat: 0.9 });
    const whiteB = lacquerMaterial("#e2d3b2", {
      roughness: 0.34,
      clearcoat: 0.85
    });
    const blackA = lacquerMaterial("#1d1813", {
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.1
    });
    const blackB = lacquerMaterial("#241c14", {
      roughness: 0.33,
      clearcoat: 1,
      clearcoatRoughness: 0.12
    });
    blackA.envMapIntensity = 1.1;
    blackB.envMapIntensity = 1.1;
    const frame = lacqueredWoodMaterial({
      base: "#4f3017",
      streak: "#33200f",
      roughness: 0.38,
      clearcoat: 0.85,
      clearcoatRoughness: 0.18,
      bumpScale: 0.0006
    });
    const core = new THREE.MeshStandardMaterial({
      color: "#241708",
      roughness: 0.85
    });
    const surface = new THREE.MeshPhysicalMaterial({
      map: surfaceTexture,
      bumpMap: surfaceBump,
      bumpScale: 0.0006,
      roughness: 0.34,
      metalness: 0.02,
      clearcoat: 0.8,
      clearcoatRoughness: 0.15
    });
    return { whiteA, whiteB, blackA, blackB, frame, core, surface };
  }, [surfaceTexture, surfaceBump]);

  const frameGeo = useMemo(() => {
    // Flat top band, roundover, ogee drop, bead, straight fall, base chamfer.
    const profile = smoothProfile(
      [
        [0.1486, 0.0156],
        [0.149, 0.0166],
        [0.1497, 0.017],
        [0.1554, 0.017],
        [0.1566, 0.0167],
        [0.1578, 0.0158],
        [0.159, 0.0142],
        [0.1586, 0.012],
        [0.16, 0.0102],
        [0.1611, 0.0086],
        [0.1616, 0.0062],
        [0.1616, 0.002],
        [0.1602, 0.0005],
        [0.1594, 0],
        [0.148, 0]
      ],
      30
    );
    return squareFrameGeometry(profile, 6);
  }, []);

  const partsByKind = useMemo<Record<PieceKind, Part[]>>(() => {
    const feltMat = feltMaterial("#1f3527");
    const grooveMat = new THREE.MeshStandardMaterial({
      color: "#171009",
      roughness: 0.65,
      metalness: 0
    });
    const part = (
      geometry: THREE.BufferGeometry,
      position: [number, number, number],
      rotation?: [number, number, number],
      material?: THREE.Material
    ): Part => ({ geometry, position, rotation, material });
    const felt = (r: number): Part =>
      part(
        new THREE.CylinderGeometry(r, r * 0.985, FELT_H, 24),
        [0, FELT_H / 2, 0],
        undefined,
        feltMat
      );
    const body = (
      controls: number[][],
      samples: number,
      segments: number
    ): Part => part(latheFrom(controls, samples, segments), [0, FELT_H, 0]);

    // ---- Pawn: base disc, quarter-round, deep cove, swelling stem,
    // collar bead, cup, ball head. h ~0.030.
    const pawn: Part[] = [
      felt(0.0092),
      body(
        [
          [0.0042, 0],
          [0.009, 0.0002],
          [0.0094, 0.0012],
          [0.0091, 0.0026],
          [0.008, 0.0036],
          [0.0052, 0.0046],
          [0.0038, 0.0062],
          [0.0035, 0.009],
          [0.0037, 0.0115],
          [0.0033, 0.014],
          [0.0046, 0.0152],
          [0.0048, 0.016],
          [0.0036, 0.0168],
          [0.0032, 0.0174],
          [0.004, 0.0198],
          [0.005, 0.0235],
          [0.0042, 0.0266],
          [0.0022, 0.0286],
          [0.0001, 0.0292]
        ],
        32,
        48
      )
    ];

    // ---- Rook: stepped base, tapered drum with a mid bead, flared
    // platform with a dished top; 8 rounded merlons around the parapet.
    const merlonGeo = roundedBar(0.003, 0.0054, 0.0022, 0.0004, 1);
    const rook: Part[] = [
      felt(0.0103),
      body(
        [
          [0.0048, 0],
          [0.01, 0.0002],
          [0.0105, 0.0012],
          [0.0104, 0.003],
          [0.0094, 0.0042],
          [0.007, 0.0052],
          [0.0063, 0.0072],
          [0.0061, 0.01],
          [0.0057, 0.0122],
          [0.0065, 0.0136],
          [0.0057, 0.015],
          [0.0054, 0.0185],
          [0.0056, 0.022],
          [0.0064, 0.0242],
          [0.008, 0.0258],
          [0.0086, 0.0268],
          [0.0086, 0.029],
          [0.0079, 0.0296],
          [0.0052, 0.0296],
          [0.0047, 0.0284],
          [0.0006, 0.0282]
        ],
        42,
        64
      ),
      ...Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4 + Math.PI / 8;
        return part(
          merlonGeo,
          [Math.sin(a) * 0.007, FELT_H + 0.0296 + 0.0021, Math.cos(a) * 0.007],
          [0, a, 0]
        );
      })
    ];

    // ---- Knight: turned base + carved head. The head is an extruded
    // side-profile Shape (chest, muzzle, two ears, crest) with a deep
    // bevel so it reads as carved; a thinner mane ridge sits behind.
    // Built facing +z; placement yaws white knights/bishops by PI.
    const headShape = new THREE.Shape();
    headShape.moveTo(0.0046, 0.0006);
    headShape.bezierCurveTo(0.0042, 0.003, 0.0028, 0.0054, 0.0026, 0.008);
    headShape.bezierCurveTo(0.0044, 0.009, 0.007, 0.0096, 0.0088, 0.0112);
    headShape.bezierCurveTo(0.0097, 0.0122, 0.0098, 0.0136, 0.009, 0.0146);
    headShape.bezierCurveTo(0.0078, 0.0156, 0.0058, 0.0158, 0.0044, 0.0164);
    headShape.bezierCurveTo(0.0034, 0.017, 0.0028, 0.0186, 0.0026, 0.0204);
    headShape.lineTo(0.0032, 0.0212);
    headShape.lineTo(0.0038, 0.025);
    headShape.lineTo(0.0014, 0.0218);
    headShape.lineTo(0.0002, 0.0246);
    headShape.lineTo(-0.0012, 0.021);
    headShape.bezierCurveTo(-0.0028, 0.0188, -0.0044, 0.0152, -0.0052, 0.0112);
    headShape.bezierCurveTo(-0.006, 0.0074, -0.006, 0.0036, -0.0054, 0.0004);
    headShape.quadraticCurveTo(0, -0.0004, 0.0046, 0.0006);
    const headGeo = new THREE.ExtrudeGeometry(headShape, {
      depth: 0.005,
      bevelEnabled: true,
      bevelThickness: 0.0015,
      bevelSize: 0.0011,
      bevelSegments: 3,
      curveSegments: 7
    });
    headGeo.translate(0, 0, -0.0025);
    headGeo.rotateY(-Math.PI / 2);

    const maneShape = new THREE.Shape();
    maneShape.moveTo(-0.003, 0.0196);
    maneShape.bezierCurveTo(-0.0048, 0.0162, -0.0058, 0.012, -0.0062, 0.0078);
    maneShape.bezierCurveTo(-0.0065, 0.0046, -0.0064, 0.002, -0.0058, 0.0002);
    maneShape.lineTo(-0.004, 0);
    maneShape.bezierCurveTo(-0.0044, 0.0034, -0.0042, 0.008, -0.0032, 0.0124);
    maneShape.bezierCurveTo(-0.0026, 0.0152, -0.002, 0.0174, -0.0018, 0.0192);
    maneShape.closePath();
    const maneGeo = new THREE.ExtrudeGeometry(maneShape, {
      depth: 0.0018,
      bevelEnabled: true,
      bevelThickness: 0.0007,
      bevelSize: 0.0006,
      bevelSegments: 2,
      curveSegments: 5
    });
    maneGeo.translate(-0.0006, 0, -0.0009);
    maneGeo.rotateY(-Math.PI / 2);

    const knight: Part[] = [
      felt(0.0104),
      body(
        [
          [0.005, 0],
          [0.01, 0.0002],
          [0.0106, 0.0014],
          [0.0102, 0.0032],
          [0.0088, 0.0044],
          [0.0062, 0.0056],
          [0.0056, 0.0082],
          [0.0066, 0.0108],
          [0.007, 0.012],
          [0.0062, 0.0136],
          [0.0054, 0.0146],
          [0.0006, 0.015]
        ],
        26,
        64
      ),
      part(headGeo, [0, FELT_H + 0.0146, 0]),
      part(maneGeo, [0, FELT_H + 0.0146, 0])
    ];

    // ---- Bishop: ogee body, collar bead, near-spherical mitre so the
    // tilted groove ring hugs the surface, ball finial. h ~0.044.
    const grooveGeo = new THREE.TorusGeometry(0.0053, 0.001, 10, 48);
    grooveGeo.scale(1, 1, 0.55);
    const bishop: Part[] = [
      felt(0.0106),
      body(
        [
          [0.005, 0],
          [0.0102, 0.0002],
          [0.0108, 0.0014],
          [0.0104, 0.0032],
          [0.009, 0.0044],
          [0.0058, 0.0058],
          [0.0046, 0.0078],
          [0.0052, 0.0115],
          [0.0048, 0.0158],
          [0.004, 0.02],
          [0.0051, 0.0228],
          [0.0053, 0.0238],
          [0.004, 0.025],
          [0.0042, 0.0262],
          [0.0054, 0.0285],
          [0.0058, 0.0312],
          [0.0052, 0.034],
          [0.0036, 0.0362],
          [0.0018, 0.0376],
          [0.0011, 0.0386],
          [0.0017, 0.0398],
          [0.0013, 0.0412],
          [0.0001, 0.0421]
        ],
        44,
        64
      ),
      // The mitre cut: a flattened dark ring sunk into the head, tilted.
      part(
        grooveGeo,
        [0, FELT_H + 0.0315, 0],
        [Math.PI / 2 + 0.62, 0, 0],
        grooveMat
      )
    ];

    // ---- Queen: long waisted stem, bead, wide crown cup with 8 pearls
    // around the rim and a center orb. h ~0.052.
    const pearlGeo = new THREE.SphereGeometry(0.0012, 10, 7);
    const orbGeo = new THREE.SphereGeometry(0.003, 18, 13);
    const queen: Part[] = [
      felt(0.0116),
      body(
        [
          [0.0055, 0],
          [0.0112, 0.0002],
          [0.0118, 0.0015],
          [0.0113, 0.0034],
          [0.0098, 0.0047],
          [0.0064, 0.006],
          [0.005, 0.0082],
          [0.0046, 0.012],
          [0.0042, 0.0165],
          [0.0042, 0.021],
          [0.0048, 0.025],
          [0.0057, 0.0276],
          [0.0048, 0.0292],
          [0.0052, 0.032],
          [0.0062, 0.037],
          [0.0072, 0.042],
          [0.0077, 0.0455],
          [0.007, 0.0464],
          [0.0048, 0.0452],
          [0.0012, 0.045]
        ],
        46,
        64
      ),
      ...Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return part(pearlGeo, [
          Math.sin(a) * 0.0066,
          FELT_H + 0.0468,
          Math.cos(a) * 0.0066
        ]);
      }),
      part(orbGeo, [0, FELT_H + 0.0478, 0])
    ];

    // ---- King: broadest base, dome-closed crown, rounded cross finial.
    // h ~0.057.
    const crossV = roundedBar(0.0015, 0.0066, 0.0015, 0.0004);
    const crossH = roundedBar(0.0046, 0.0015, 0.0015, 0.0004);
    const king: Part[] = [
      felt(0.0122),
      body(
        [
          [0.0058, 0],
          [0.0118, 0.0002],
          [0.0124, 0.0016],
          [0.0119, 0.0036],
          [0.0103, 0.0049],
          [0.0068, 0.0063],
          [0.0054, 0.0086],
          [0.005, 0.0125],
          [0.0046, 0.017],
          [0.0046, 0.0215],
          [0.0052, 0.0255],
          [0.0061, 0.0282],
          [0.0052, 0.0298],
          [0.0056, 0.0325],
          [0.0068, 0.0375],
          [0.0078, 0.042],
          [0.008, 0.0445],
          [0.0072, 0.0456],
          [0.0058, 0.047],
          [0.0034, 0.049],
          [0.0001, 0.05]
        ],
        46,
        64
      ),
      part(crossV, [0, FELT_H + 0.053, 0]),
      part(crossH, [0, FELT_H + 0.0538, 0])
    ];

    return { pawn, rook, knight, bishop, queen, king };
  }, []);

  const placements = useMemo(
    () =>
      START_POSITION.map((piece) => {
        const [x, z] = squareToLocal(piece.square);
        const jx = (hash01(`${piece.square}:x`) - 0.5) * 0.0022;
        const jz = (hash01(`${piece.square}:z`) - 0.5) * 0.0022;
        const jitterYaw = (hash01(`${piece.square}:r`) - 0.5) * 0.2;
        // Hand-set pieces never sit perfectly plumb on their felt.
        const tiltX = (hash01(`${piece.square}:tx`) - 0.5) * 0.014;
        const tiltZ = (hash01(`${piece.square}:tz`) - 0.5) * 0.014;
        // Knights' heads and bishops' mitre cuts face the opponent.
        const facing =
          (piece.kind === "knight" || piece.kind === "bishop") &&
          piece.color === "white"
            ? Math.PI
            : 0;
        return {
          piece,
          alt: hash01(`${piece.square}:m`) < 0.5,
          position: [
            x + jx,
            BOARD_THICKNESS + SURFACE_LIFT + PIECE_LIFT,
            z + jz
          ] as [number, number, number],
          rotation: [tiltX, facing + jitterYaw, tiltZ] as [
            number,
            number,
            number
          ]
        };
      }),
    []
  );

  return (
    <group>
      <mesh
        geometry={frameGeo}
        material={materials.frame}
        castShadow
        receiveShadow
      />
      <mesh position={[0, 0.00775, 0]} material={materials.core}>
        <boxGeometry args={[0.296, 0.0155, 0.296]} />
      </mesh>
      <mesh
        position={[0, BOARD_THICKNESS + SURFACE_LIFT, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        material={materials.surface}
      >
        <planeGeometry args={[SURFACE_SIZE, SURFACE_SIZE]} />
      </mesh>
      {placements.map(({ piece, alt, position, rotation }) => {
        const bodyMat =
          piece.color === "white"
            ? alt
              ? materials.whiteB
              : materials.whiteA
            : alt
              ? materials.blackB
              : materials.blackA;
        return (
          <group key={piece.square} position={position} rotation={rotation}>
            {partsByKind[piece.kind].map((p, i) => (
              <mesh
                key={i}
                geometry={p.geometry}
                material={p.material ?? bodyMat}
                position={p.position}
                rotation={p.rotation ?? [0, 0, 0]}
                castShadow
              />
            ))}
          </group>
        );
      })}
    </group>
  );
}
