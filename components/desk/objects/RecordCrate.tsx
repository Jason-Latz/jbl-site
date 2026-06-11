"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { PALETTE, makeCanvasTexture } from "@/lib/three/materials";
import { loadProxiedTexture } from "@/lib/three/proxied-texture";

const INTERIOR = 0.34;
const CRATE_H = 0.31;
const POST = 0.028;
const SLAT_T = 0.012;
const SLAT_W = 0.075;
const SLAT_LEN = INTERIOR + POST * 2; // side slats butt into the face slats
const FACE_SLAT_LEN = SLAT_LEN + SLAT_T * 2; // front/back overlap side end grain
const SLAT_ROWS = [0.055, 0.155, 0.26];
const SLAT_FACE = INTERIOR / 2 + POST + SLAT_T / 2;
const EDGE = INTERIOR / 2 + POST + SLAT_T; // outer face plane
const POST_C = INTERIOR / 2 + POST / 2;

const SLEEVE = 0.315;
const SLEEVE_T = 0.005;
const SLEEVE_REST_Y = 0.0246; // top of the bottom slats
const LP_COUNT = 10;

const OUT_LEAN = 0.25;
const OUT_BASE_Z =
  INTERIOR / 2 + POST + SLAT_T + SLEEVE * Math.sin(OUT_LEAN) + 0.004;

const BRACKET_T = 0.0012;
const BRACKET_LEG = 0.026;
const BRACKET_H = 0.055;
const BRACKET_YS = [0.055, 0.26];

type Xform = {
  position: [number, number, number];
  rotation: [number, number, number];
};

type Slat = Xform & { len: number };

type CoverDesign = {
  base: string;
  dark: string;
  accent: string;
  motif: "circle" | "band" | "square";
};

// Placeholder covers — Stage 2 swaps these maps for real album art.
const DESIGNS: CoverDesign[] = [
  { base: "#2f5b57", dark: "#23443f", accent: "#e7dbc1", motif: "circle" },
  { base: "#5e2c28", dark: "#46201d", accent: "#d3a87e", motif: "band" },
  { base: "#c49d3f", dark: "#97772c", accent: "#3c3526", motif: "square" },
  { base: "#36465f", dark: "#283447", accent: "#c8b894", motif: "circle" },
  { base: "#e7ddc4", dark: "#c6b896", accent: "#b05a35", motif: "band" },
  { base: "#36332f", dark: "#262420", accent: "#c75833", motif: "square" },
  { base: "#ab5a2e", dark: "#824322", accent: "#ecdfc6", motif: "circle" },
  { base: "#7a8161", dark: "#5c6248", accent: "#efe7d2", motif: "band" },
  { base: "#a4756b", dark: "#7d564e", accent: "#3a2f2b", motif: "square" },
  { base: "#5a6a74", dark: "#434f58", accent: "#ddd3ba", motif: "circle" }
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Knotty pine plank, grain along the long axis (rotated for posts).
function pineTexture(seed: number, vertical: boolean): THREE.CanvasTexture {
  const rng = mulberry32(seed);
  const w = vertical ? 256 : 1024;
  const h = vertical ? 1024 : 256;
  return makeCanvasTexture(
    w,
    h,
    (ctx) => {
      const gw = Math.max(w, h);
      const gh = Math.min(w, h);
      if (vertical) {
        ctx.translate(w, 0);
        ctx.rotate(Math.PI / 2);
      }
      const hue = 30 + rng() * 5;
      const sat = 34 + rng() * 10;
      const lit = 50 + rng() * 7;
      ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lit}%)`;
      ctx.fillRect(0, 0, gw, gh);

      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = `hsl(${hue - 2 + rng() * 4}, ${sat}%, ${
          lit + (rng() - 0.5) * 9
        }%)`;
        ctx.globalAlpha = 0.16 + rng() * 0.12;
        ctx.fillRect(0, rng() * gh, gw, gh * (0.1 + rng() * 0.25));
      }
      ctx.globalAlpha = 1;

      for (let i = 0; i < 130; i++) {
        const y = rng() * gh;
        const light = rng() > 0.62;
        ctx.strokeStyle = light
          ? `hsl(${hue + 4}, ${sat + 6}%, ${lit + 14}%)`
          : `hsl(${hue - 3}, ${sat + 6}%, ${lit - 16}%)`;
        ctx.globalAlpha = 0.05 + rng() * 0.1;
        ctx.lineWidth = 0.5 + rng() * 1.7;
        const amp = 0.8 + rng() * 2.4;
        const phase = rng() * 10;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let s = 1; s <= 14; s++) {
          ctx.lineTo((gw * s) / 14, y + Math.sin(s * 0.9 + phase) * amp);
        }
        ctx.stroke();
      }

      const knots = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < knots; k++) {
        const cx = gw * (0.12 + rng() * 0.76);
        const cy = gh * (0.2 + rng() * 0.6);
        ctx.fillStyle = `hsl(${hue - 6}, ${sat + 8}%, ${lit - 28}%)`;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.ellipse(
          cx,
          cy,
          5 + rng() * 5,
          3.4 + rng() * 3.4,
          rng() * 0.6,
          0,
          Math.PI * 2
        );
        ctx.fill();
        for (let ring = 1; ring <= 6; ring++) {
          ctx.strokeStyle = `hsl(${hue - 4}, ${sat + 4}%, ${lit - 20}%)`;
          ctx.globalAlpha = Math.max(0.05, 0.3 - ring * 0.04);
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.ellipse(
            cx,
            cy,
            5 + rng() * 4 + ring * 4.4,
            3.5 + rng() * 3 + ring * 2.5,
            0.2,
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }
      }

      for (let i = 0; i < 320; i++) {
        ctx.fillStyle = rng() > 0.5 ? "#000000" : "#ffffff";
        ctx.globalAlpha = 0.02 + rng() * 0.03;
        ctx.fillRect(rng() * gw, rng() * gh, 1 + rng() * 2, 1 + rng() * 1.4);
      }
      ctx.globalAlpha = 1;
    },
    { anisotropy: 8 }
  );
}

// Shared cloth-paper weave bump for all sleeve surfaces.
function paperBumpTexture(): THREE.CanvasTexture {
  const rng = mulberry32(0xb0b0);
  return makeCanvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) {
        ctx.strokeStyle = rng() > 0.5 ? "#8a8a8a" : "#767676";
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + rng());
        ctx.lineTo(w, y + rng());
        ctx.stroke();
      }
      for (let x = 0; x < w; x += 4) {
        ctx.strokeStyle = rng() > 0.5 ? "#888888" : "#787878";
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.moveTo(x + rng(), 0);
        ctx.lineTo(x + rng(), h);
        ctx.stroke();
      }
      for (let i = 0; i < 2600; i++) {
        ctx.fillStyle = rng() > 0.5 ? "#959595" : "#6c6c6c";
        ctx.globalAlpha = 0.12 + rng() * 0.18;
        ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 1.6, 1 + rng() * 1.2);
      }
      ctx.globalAlpha = 1;
    },
    { srgb: false, anisotropy: 8 }
  );
}

// Brushed steel with handling scuffs for the corner brackets.
function steelTexture(): THREE.CanvasTexture {
  const rng = mulberry32(0x57ee1);
  return makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#b4b1aa";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 150; i++) {
        const x = rng() * w;
        ctx.strokeStyle = rng() > 0.5 ? "#c6c3bb" : "#9b988f";
        ctx.globalAlpha = 0.05 + rng() * 0.09;
        ctx.lineWidth = 0.6 + rng() * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (rng() - 0.5) * 6, h);
        ctx.stroke();
      }
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = "#7e7a70";
        ctx.globalAlpha = 0.05 + rng() * 0.07;
        ctx.beginPath();
        ctx.ellipse(
          rng() * w,
          rng() * h,
          8 + rng() * 26,
          5 + rng() * 14,
          rng() * Math.PI,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = "#e3e0d8";
        ctx.globalAlpha = 0.12 + rng() * 0.16;
        ctx.lineWidth = 0.7;
        const x = rng() * w;
        const y = rng() * h;
        const a = rng() * Math.PI;
        const len = 6 + rng() * 24;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    { anisotropy: 8 }
  );
}

// Faded stencil "33 1/3" with bridge cuts and chipped paint (alpha canvas).
function stencilTexture(): THREE.CanvasTexture {
  const rng = mulberry32(0x33133);
  return makeCanvasTexture(
    1024,
    384,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#171411";
      ctx.globalAlpha = 0.78;
      ctx.font = `900 ${h * 0.58}px "Arial Black", "Helvetica Neue", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("33 1/3", w / 2, h * 0.54);

      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
      ctx.fillRect(0, h * 0.38, w, h * 0.045);
      ctx.fillRect(0, h * 0.66, w, h * 0.04);
      for (let i = 0; i < 900; i++) {
        ctx.globalAlpha = 0.25 + rng() * 0.55;
        const s = 1 + rng() * 5;
        ctx.fillRect(rng() * w, rng() * h, s, s * (0.5 + rng()));
      }
      for (let i = 0; i < 40; i++) {
        ctx.globalAlpha = 0.12 + rng() * 0.2;
        ctx.beginPath();
        ctx.arc(w * (0.6 + rng() * 0.35), h * rng(), 8 + rng() * 22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    },
    { anisotropy: 8 }
  );
}

function coverDraw(design: CoverDesign, rng: () => number) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = design.base;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#000000" : "#ffffff";
      ctx.globalAlpha = 0.015 + rng() * 0.02;
      ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 2.5, 1 + rng() * 2.5);
    }
    ctx.globalAlpha = 1;

    if (design.motif === "circle") {
      ctx.strokeStyle = design.accent;
      ctx.lineWidth = 6 + rng() * 3;
      ctx.beginPath();
      ctx.arc(
        w * (0.44 + rng() * 0.12),
        h * (0.48 + rng() * 0.14),
        w * (0.25 + rng() * 0.06),
        0,
        Math.PI * 2
      );
      ctx.stroke();
    } else if (design.motif === "band") {
      ctx.fillStyle = design.accent;
      ctx.fillRect(0, h * (0.56 + rng() * 0.16), w, h * (0.09 + rng() * 0.05));
    } else {
      ctx.fillStyle = design.accent;
      const s = w * (0.15 + rng() * 0.06);
      ctx.fillRect(w * (0.56 + rng() * 0.14), h * (0.14 + rng() * 0.12), s, s);
    }

    // Ring wear pressed through from the disc inside.
    const cx = w * 0.5 + (rng() - 0.5) * 14;
    const cy = h * 0.52 + (rng() - 0.5) * 14;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = 0.028 + rng() * 0.035;
      ctx.lineWidth = 7 + rng() * 9;
      ctx.beginPath();
      ctx.arc(cx, cy, w * (0.35 + i * 0.013 + rng() * 0.01), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Whitened edges and scuffed, chipped corners.
    ctx.globalAlpha = 0.11;
    ctx.strokeStyle = "#f7f1e2";
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    const corners: [number, number][] = [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h]
    ];
    for (const [px, py] of corners) {
      const n = 4 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = 0.07 + rng() * 0.14;
        ctx.strokeStyle = "#f4eee0";
        ctx.lineWidth = 0.8 + rng() * 1.6;
        const a = Math.atan2(h / 2 - py, w / 2 - px) + (rng() - 0.5) * 0.9;
        const len = 8 + rng() * 26;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.14 + rng() * 0.12;
      ctx.fillStyle = "#efe8d6";
      const s = 5 + rng() * 9;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + (px === 0 ? s : -s), py);
      ctx.lineTo(px, py + (py === 0 ? s : -s));
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalAlpha = 0.45;
    ctx.fillStyle = design.dark;
    ctx.fillRect(0, 0, w, h * 0.03);
    ctx.globalAlpha = 1;
  };
}

// Spine: illegible title dashes and worn fold lines, no readable words.
function spineDraw(design: CoverDesign, rng: () => number) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = design.dark;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = rng() > 0.5 ? "#000000" : "#ffffff";
      ctx.globalAlpha = 0.02 + rng() * 0.03;
      ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 2);
    }
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = "#f4ecd9";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(w, 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, h - 2);
    ctx.lineTo(w, h - 2);
    ctx.stroke();
    for (let i = 0; i < 26; i++) {
      ctx.globalAlpha = 0.08 + rng() * 0.15;
      ctx.fillStyle = "#efe6d0";
      ctx.fillRect(
        rng() * w,
        rng() > 0.5 ? 0 : h - 2 - rng() * 2,
        2 + rng() * 9,
        1.4 + rng() * 2.2
      );
    }
    ctx.fillStyle = design.accent;
    let x = w * (0.08 + rng() * 0.06);
    const n = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const dw = w * (0.025 + rng() * 0.07);
      const dh = h * (0.2 + rng() * 0.16);
      ctx.globalAlpha = 0.4 + rng() * 0.32;
      ctx.fillRect(x, (h - dh) / 2 + (rng() - 0.5) * 3, dw, dh);
      x += dw + w * (0.012 + rng() * 0.02);
    }
    ctx.globalAlpha = 0.5;
    ctx.fillRect(w * 0.9, h * 0.32, w * 0.05, h * 0.36);
    ctx.globalAlpha = 1;
  };
}

// Stage 2 swaps `front.map` per sleeve for real album art; keep this shape.
function coverMaterials(
  design: CoverDesign,
  seed: number,
  paperBump: THREE.CanvasTexture
) {
  const front = new THREE.MeshStandardMaterial({
    map: makeCanvasTexture(512, 512, coverDraw(design, mulberry32(seed)), {
      anisotropy: 8
    }),
    roughness: 0.86,
    metalness: 0,
    bumpMap: paperBump,
    bumpScale: 0.0008
  });
  const edge = new THREE.MeshStandardMaterial({
    color: design.dark,
    roughness: 0.94,
    metalness: 0,
    bumpMap: paperBump,
    bumpScale: 0.0006
  });
  const spine = new THREE.MeshStandardMaterial({
    map: makeCanvasTexture(
      1024,
      64,
      spineDraw(design, mulberry32(seed ^ 0x5f5f)),
      { anisotropy: 8 }
    ),
    roughness: 0.92,
    metalness: 0,
    bumpMap: paperBump,
    bumpScale: 0.0006
  });
  return { front, edge, spine };
}

// Gentle cylindrical warp, strongest at the free top edge — keeps the
// BoxGeometry material groups so the cover/edge/spine maps still apply.
function bowedSleeveGeometry(bow: number): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(SLEEVE, SLEEVE, SLEEVE_T, 12, 12, 1);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const across = 1 - Math.pow((2 * x) / SLEEVE, 2);
    const up = 0.35 + 0.65 * (y / SLEEVE + 0.5);
    pos.setZ(i, pos.getZ(i) + bow * across * up);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function vinylTextures() {
  const rng = mulberry32(0x101010);
  const map = makeCanvasTexture(
    1024,
    1024,
    (ctx, w) => {
      const c = w / 2;
      ctx.fillStyle = "#0c0b09";
      ctx.fillRect(0, 0, w, w);
      for (let r = w * 0.178; r < w * 0.482; r += 1.5 + rng() * 0.9) {
        ctx.strokeStyle = rng() > 0.85 ? "#2c2925" : "#1c1a17";
        ctx.globalAlpha = 0.16 + rng() * 0.22;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const f of [0.24, 0.3, 0.37, 0.43]) {
        ctx.strokeStyle = "#393631";
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(c, c, w * (f + (rng() - 0.5) * 0.008), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#33302b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c, c, w * 0.492, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      const lr = w * 0.165;
      ctx.fillStyle = "#e3d6b8";
      ctx.beginPath();
      ctx.arc(c, c, lr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.accentCoral;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(c, c, lr * 0.86, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c, c, lr * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#5d4a33";
      ctx.lineWidth = 4;
      let a0 = Math.PI * 1.15;
      for (let i = 0; i < 7; i++) {
        const span = 0.08 + rng() * 0.14;
        ctx.globalAlpha = 0.55 + rng() * 0.3;
        ctx.beginPath();
        ctx.arc(c, c, lr * 0.68, a0, a0 + span);
        ctx.stroke();
        a0 += span + 0.06 + rng() * 0.05;
      }
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#4c3d2c";
      ctx.fillRect(c - lr * 0.3, c + lr * 0.16, lr * 0.6, 3);
      ctx.fillRect(c - lr * 0.22, c + lr * 0.28, lr * 0.44, 3);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#0a0908";
      ctx.beginPath();
      ctx.arc(c, c, w * 0.0075, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b8ab8d";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c, c, w * 0.0095, 0, Math.PI * 2);
      ctx.stroke();
    },
    { anisotropy: 8 }
  );

  const bump = makeCanvasTexture(
    512,
    512,
    (ctx, w) => {
      const c = w / 2;
      ctx.fillStyle = "#7f7f7f";
      ctx.fillRect(0, 0, w, w);
      for (let r = w * 0.178; r < w * 0.482; r += 1.6) {
        ctx.strokeStyle = "#ffffff";
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    { srgb: false, anisotropy: 8 }
  );

  return { map, bump };
}

// Slatted pine record crate on the floor: ten LPs leaning inside,
// one sleeve propped against the front with its vinyl peeking out.
type RecordCrateProps = {
  // Real album-art URLs (heavy rotation) pressed onto sleeve fronts on load.
  coverArtUrls?: string[];
};

export default function RecordCrate({ coverArtUrls }: RecordCrateProps) {
  // Per-part pine: four horizontal plank variants + two vertical post
  // variants, each material clone gets its own warm tone jitter.
  const pine = useMemo(() => {
    const rng = mulberry32(0x9e3a);
    const planks = [0, 1, 2, 3].map((i) => pineTexture(0x51a7 + i * 131, false));
    const verticals = [0, 1].map((i) => pineTexture(0x77f1 + i * 97, true));
    const make = (tex: THREE.CanvasTexture) => {
      const m = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.62 + rng() * 0.16,
        metalness: 0.02
      });
      m.bumpMap = tex;
      m.bumpScale = 0.0011;
      const t = 0.92 + rng() * 0.13;
      m.color.setRGB(t, t * (0.96 + rng() * 0.05), t * (0.92 + rng() * 0.06));
      return m;
    };
    return {
      slats: Array.from({ length: 12 }, (_, i) => make(planks[i % 4])),
      bottoms: Array.from({ length: 5 }, (_, i) => make(planks[(i + 2) % 4])),
      posts: Array.from({ length: 4 }, (_, i) => make(verticals[i % 2]))
    };
  }, []);

  const hardwareMats = useMemo(() => {
    const steel = new THREE.MeshStandardMaterial({
      map: steelTexture(),
      metalness: 0.85,
      roughness: 0.38
    });
    steel.envMapIntensity = 1.1;
    const screw = new THREE.MeshStandardMaterial({
      color: "#3a352c",
      metalness: 0.7,
      roughness: 0.45
    });
    const stencil = new THREE.MeshStandardMaterial({
      map: stencilTexture(),
      transparent: true,
      roughness: 0.85,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      depthWrite: false
    });
    return { steel, screw, stencil };
  }, []);

  const smallGeoms = useMemo(
    () => ({
      screw: new THREE.CylinderGeometry(0.0017, 0.0019, 0.0012, 10),
      rivet: new THREE.CylinderGeometry(0.0019, 0.0021, 0.0009, 10)
    }),
    []
  );

  const frame = useMemo(() => {
    const rng = mulberry32(0xc7a7e);
    const slats: Slat[] = [];
    // Front/back slats span the full width and cover the side end grain.
    for (const side of [1, -1]) {
      for (const row of SLAT_ROWS) {
        slats.push({
          len: FACE_SLAT_LEN,
          position: [
            (rng() - 0.5) * 0.002,
            row + (rng() - 0.5) * 0.004,
            side * (SLAT_FACE + (rng() - 0.5) * 0.0014)
          ],
          rotation: [
            (rng() - 0.5) * 0.016,
            (rng() - 0.5) * 0.006,
            (rng() - 0.5) * 0.016
          ]
        });
      }
    }
    // Side slats butt into the back of the face slats (pinwheel joints).
    for (const side of [1, -1]) {
      for (const row of SLAT_ROWS) {
        slats.push({
          len: SLAT_LEN,
          position: [
            side * (SLAT_FACE + (rng() - 0.5) * 0.0014),
            row + (rng() - 0.5) * 0.004,
            (rng() - 0.5) * 0.002
          ],
          rotation: [
            (rng() - 0.5) * 0.016,
            Math.PI / 2 + (rng() - 0.5) * 0.006,
            (rng() - 0.5) * 0.016
          ]
        });
      }
    }

    const corners: [number, number][] = [
      [-POST_C, -POST_C],
      [POST_C, -POST_C],
      [-POST_C, POST_C],
      [POST_C, POST_C]
    ];
    const posts: Xform[] = corners.map(([x, z]) => ({
      position: [x, CRATE_H / 2, z],
      rotation: [0, (rng() - 0.5) * 0.02, 0]
    }));

    const bottoms: Xform[] = [-0.14, -0.07, 0, 0.07, 0.14].map((z) => ({
      position: [(rng() - 0.5) * 0.002, 0.018, z + (rng() - 0.5) * 0.003],
      rotation: [0, (rng() - 0.5) * 0.012, 0]
    }));

    return { slats, posts, bottoms };
  }, []);

  // Screws pinning slat ends to the posts, plus steel corner brackets.
  const hardware = useMemo(() => {
    const rng = mulberry32(0xdea1);
    const j = () => (rng() - 0.5) * 0.0024;
    const screws: Xform[] = [];
    for (const sz of [1, -1]) {
      for (const row of SLAT_ROWS) {
        for (const ex of [1, -1]) {
          for (const dy of [1, -1]) {
            screws.push({
              position: [
                ex * POST_C + j(),
                row + dy * 0.019 + j(),
                sz * (EDGE + 0.0002)
              ],
              rotation: [Math.PI / 2, 0, 0]
            });
          }
        }
      }
    }
    for (const sx of [1, -1]) {
      for (const row of SLAT_ROWS) {
        for (const ez of [1, -1]) {
          for (const dy of [1, -1]) {
            screws.push({
              position: [
                sx * (EDGE + 0.0002),
                row + dy * 0.019 + j(),
                ez * POST_C + j()
              ],
              rotation: [0, 0, Math.PI / 2]
            });
          }
        }
      }
    }

    const plates: Xform[] = [];
    const rivets: Xform[] = [];
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        for (const y of BRACKET_YS) {
          const yy = y + (rng() - 0.5) * 0.003;
          // Leg flat on the front/back face, folded edge past the corner.
          plates.push({
            position: [
              sx * (EDGE + BRACKET_T - BRACKET_LEG / 2),
              yy,
              sz * (EDGE + BRACKET_T / 2)
            ],
            rotation: [0, 0, (rng() - 0.5) * 0.02]
          });
          rivets.push({
            position: [
              sx * (EDGE + BRACKET_T - BRACKET_LEG + 0.009),
              yy + (rng() - 0.5) * 0.01,
              sz * (EDGE + BRACKET_T + 0.0002)
            ],
            rotation: [Math.PI / 2, 0, 0]
          });
          // Leg flat on the side face.
          plates.push({
            position: [
              sx * (EDGE + BRACKET_T / 2),
              yy,
              sz * (EDGE + BRACKET_T - BRACKET_LEG / 2)
            ],
            rotation: [0, Math.PI / 2, (rng() - 0.5) * 0.02]
          });
          rivets.push({
            position: [
              sx * (EDGE + BRACKET_T + 0.0002),
              yy + (rng() - 0.5) * 0.01,
              sz * (EDGE + BRACKET_T - BRACKET_LEG + 0.009)
            ],
            rotation: [0, 0, Math.PI / 2]
          });
        }
      }
    }
    return { screws, plates, rivets };
  }, []);

  // Sleeves pack against the back; neighbor lean angles random-walk so
  // adjacent covers never cross through each other. Each gets its own bow.
  const sleeves = useMemo(() => {
    const rng = mulberry32(314159);
    const items: {
      x: number;
      z: number;
      lean: number;
      lift: number;
      yaw: number;
      roll: number;
      geometry: THREE.BoxGeometry;
    }[] = [];
    let z = -0.096;
    let lean = 0.14 + rng() * 0.05;
    for (let i = 0; i < LP_COUNT; i++) {
      lean = THREE.MathUtils.clamp(lean + (rng() - 0.5) * 0.05, 0.12, 0.22);
      let lift = rng() * 0.004;
      if (i === 2) lift = 0.024 + rng() * 0.008;
      if (i === 6) lift = 0.042 + rng() * 0.008;
      items.push({
        x: (rng() - 0.5) * 0.008,
        z,
        lean,
        lift,
        yaw: (rng() - 0.5) * 0.04,
        roll: (rng() - 0.5) * 0.03,
        geometry: bowedSleeveGeometry((rng() - 0.5) * 0.006)
      });
      z += 0.0165 + rng() * 0.002;
    }
    return items;
  }, []);

  const paperBump = useMemo(() => paperBumpTexture(), []);

  const covers = useMemo(
    () =>
      DESIGNS.map((design, i) =>
        coverMaterials(design, 9100 + i * 137, paperBump)
      ),
    [paperBump]
  );

  // Stage 2: press Jason's real heavy-rotation album art onto the sleeve
  // fronts as it loads; procedural covers remain as instant placeholders.
  useEffect(() => {
    if (!coverArtUrls?.length) {
      return;
    }
    const cancels = coverArtUrls
      .slice(0, covers.length)
      .map((url, i) =>
        loadProxiedTexture(url, (texture) => {
          covers[i].front.map = texture;
          covers[i].front.color.set("#ffffff");
          covers[i].front.needsUpdate = true;
        })
      );
    return () => cancels.forEach((cancel) => cancel());
  }, [coverArtUrls, covers]);

  const outside = useMemo(() => {
    const materials = coverMaterials(
      {
        base: "#efe6d2",
        dark: "#cdc0a2",
        accent: PALETTE.accentCoral,
        motif: "circle"
      },
      777001,
      paperBump
    );
    const slot = new THREE.MeshStandardMaterial({
      color: "#15120e",
      roughness: 1,
      metalness: 0
    });
    const { map, bump } = vinylTextures();
    const vinylFace = new THREE.MeshPhysicalMaterial({
      map,
      bumpMap: bump,
      bumpScale: 0.0003,
      roughness: 0.34,
      metalness: 0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.28
    });
    vinylFace.envMapIntensity = 1.15;
    const vinylEdge = new THREE.MeshStandardMaterial({
      color: "#0d0c0a",
      roughness: 0.5,
      metalness: 0
    });
    const paper = new THREE.MeshStandardMaterial({
      color: "#f0ead9",
      roughness: 0.96,
      metalness: 0
    });
    const geometry = bowedSleeveGeometry(0.0022);
    return { ...materials, slot, vinylFace, vinylEdge, paper, geometry };
  }, [paperBump]);

  return (
    <group>
      {frame.posts.map((t, i) => (
        <RoundedBox
          key={`post${i}`}
          args={[POST, CRATE_H, POST]}
          radius={0.0035}
          smoothness={4}
          material={pine.posts[i]}
          position={t.position}
          rotation={t.rotation}
          castShadow
          receiveShadow
        />
      ))}
      {frame.slats.map((t, i) => (
        <RoundedBox
          key={`slat${i}`}
          args={[t.len, SLAT_W, SLAT_T]}
          radius={0.0024}
          smoothness={4}
          material={pine.slats[i]}
          position={t.position}
          rotation={t.rotation}
          castShadow
          receiveShadow
        />
      ))}
      {frame.bottoms.map((t, i) => (
        <RoundedBox
          key={`bottom${i}`}
          args={[INTERIOR - 0.004, SLAT_T, 0.062]}
          radius={0.0016}
          smoothness={2}
          material={pine.bottoms[i]}
          position={t.position}
          rotation={t.rotation}
          castShadow
          receiveShadow
        />
      ))}

      {hardware.screws.map((t, i) => (
        <mesh
          key={`screw${i}`}
          geometry={smallGeoms.screw}
          material={hardwareMats.screw}
          position={t.position}
          rotation={t.rotation}
          castShadow
        />
      ))}
      {hardware.plates.map((t, i) => (
        <RoundedBox
          key={`plate${i}`}
          args={[BRACKET_LEG, BRACKET_H, BRACKET_T]}
          radius={0.0004}
          smoothness={2}
          material={hardwareMats.steel}
          position={t.position}
          rotation={t.rotation}
          castShadow
        />
      ))}
      {hardware.rivets.map((t, i) => (
        <mesh
          key={`rivet${i}`}
          geometry={smallGeoms.rivet}
          material={hardwareMats.screw}
          position={t.position}
          rotation={t.rotation}
          castShadow
        />
      ))}

      <mesh
        material={hardwareMats.stencil}
        position={[0, SLAT_ROWS[1], EDGE + 0.0012]}
        rotation={[0, 0, 0.012]}
      >
        <planeGeometry args={[0.18, 0.0675]} />
      </mesh>

      {sleeves.map((s, i) => (
        <group
          key={`lp${i}`}
          position={[s.x, SLEEVE_REST_Y, s.z]}
          rotation={[-s.lean, s.yaw, s.roll]}
        >
          <mesh
            geometry={s.geometry}
            material={[
              covers[i].edge,
              covers[i].edge,
              covers[i].spine,
              covers[i].edge,
              covers[i].front,
              covers[i].edge
            ]}
            position={[0, SLEEVE / 2 + s.lift, 0]}
            castShadow
            receiveShadow
          />
        </group>
      ))}

      <group
        position={[0.035, 0.001, OUT_BASE_Z]}
        rotation={[-OUT_LEAN, 0.05, 0.012]}
      >
        <mesh
          geometry={outside.geometry}
          material={[
            outside.edge,
            outside.edge,
            outside.slot,
            outside.edge,
            outside.front,
            outside.edge
          ]}
          position={[0, SLEEVE / 2, 0]}
          castShadow
          receiveShadow
        />
        {/* Inner paper sleeve rim peeking behind the disc. */}
        <mesh
          position={[0.002, SLEEVE - 0.118, -0.0021]}
          rotation={[Math.PI / 2, 0, 0]}
          material={outside.paper}
          castShadow
        >
          <cylinderGeometry args={[0.158, 0.158, 0.0016, 96]} />
        </mesh>
        <mesh
          position={[0.005, SLEEVE - 0.106, 0.0002]}
          rotation={[Math.PI / 2, 0, 0]}
          material={[outside.vinylEdge, outside.vinylFace, outside.vinylFace]}
          castShadow
        >
          <cylinderGeometry args={[0.151, 0.151, 0.0021, 128]} />
        </mesh>
      </group>
    </group>
  );
}
