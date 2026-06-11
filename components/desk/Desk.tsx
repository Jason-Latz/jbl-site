"use client";

import { useMemo, useRef, type ElementRef } from "react";
import * as THREE from "three";
import { MeshReflectorMaterial, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { makeCanvasTexture } from "@/lib/three/materials";
import { useDeskTheme } from "./DeskThemeContext";
import { DESK } from "./layout";

const W = DESK.width;
const D = DESK.depth;
const T = DESK.thickness;
const H = DESK.height;

// Slab edge profile: top board, chamfer band, undercut reveal (stacked).
const TOP_H = 0.026;
const BAND_H = 0.008;
const REVEAL_H = T - TOP_H - BAND_H + 0.002;
const CAP_W = 0.09; // breadboard end caps
const SEAM_GAP = 0.0012;

const LEG_INSET = 0.105;
const BLOCK = 0.062;
const BLOCK_H = 0.115;
const APRON_H = 0.1;
const APRON_T = 0.022;

// ── Lacquer reflection knobs ──────────────────────────────────────────────
// The top surface carries the scene's ONE MeshReflectorMaterial plane (each
// reflector re-renders the whole scene, so never add a second). Tuned wood
// first, mirror second: the grain stays in charge and the reflection deepens
// it like a french-polished film.
// Plane floats 0.4 mm over the slab; the baked AccumulativeShadows plane at
// +0.8 mm MUST stay above it so contact shadows keep landing on the lacquer.
export const REFLECTOR_LIFT = 0.0004;
export const REFLECTOR_RESOLUTION = 1024; // FBO size — keep <= 1024
export const REFLECTOR_BLUR: [number, number] = [320, 120]; // soft-pass kernel
export const REFLECTOR_MIRROR = 0.42; // how much base wood yields to reflection
export const REFLECTOR_MIX_BLUR = 1.0; // scales roughness-map-driven blur mix
export const REFLECTOR_MIX_CONTRAST = 1.0;
// Reflections merge into diffuse BEFORE lighting, so they scale with
// irradiance: the dim night room needs a stronger mix for the MacBook's
// screen-leak streak, lamplight needs less so the mahogany stays primary.
// mixStrength crossfades between these with the theme.
export const REFLECTOR_MIX_STRENGTH_LIGHT = 0.7;
export const REFLECTOR_MIX_STRENGTH_DARK = 1.35;
// Depth fade: the oblique-clipped depth buffer reads ~1 right at the lacquer
// and falls with height, so reflections stay anchored at each object's feet
// and melt away toward lamp heads and tonearm tips.
export const REFLECTOR_DEPTH_SCALE = 1.1;
export const REFLECTOR_MIN_DEPTH_THRESHOLD = 0.35;
export const REFLECTOR_MAX_DEPTH_THRESHOLD = 1.3;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Band = {
  y: number;
  h: number;
  light: boolean;
  phase: number;
  amp: number;
  slope: number;
  alpha: number;
  flips: number;
};

function bandPath(ctx: CanvasRenderingContext2D, b: Band, w: number) {
  const top = (x: number) =>
    b.y + Math.sin(x * 0.0045 + b.phase) * b.amp + (x / w) * b.slope;
  const bot = (x: number) =>
    b.y + b.h + Math.sin(x * 0.0045 + b.phase + 1.7) * b.amp + (x / w) * b.slope;
  ctx.beginPath();
  ctx.moveTo(0, top(0));
  for (let x = 64; x <= w; x += 64) ctx.lineTo(x, top(x));
  ctx.lineTo(w, bot(w));
  for (let x = w - 64; x >= 0; x -= 64) ctx.lineTo(x, bot(x));
  ctx.closePath();
}

// Turned leg silhouette, bottom-up: ball foot, long taper, twin ring
// beads, vase swell, collar meeting the square top block. Heights sum
// to 0.595 and get rescaled to the actual leg length.
const LEG_PROFILE: [number, number][] = [
  [0.001, 0.0],
  [0.017, 0.0],
  [0.0205, 0.005],
  [0.0275, 0.013],
  [0.032, 0.027],
  [0.029, 0.041],
  [0.0205, 0.05],
  [0.018, 0.057],
  [0.0185, 0.09],
  [0.02, 0.16],
  [0.0215, 0.26],
  [0.023, 0.36],
  [0.0245, 0.44],
  [0.0252, 0.462],
  [0.026, 0.47],
  [0.032, 0.4775],
  [0.0262, 0.4855],
  [0.0312, 0.4925],
  [0.0258, 0.5],
  [0.029, 0.5095],
  [0.037, 0.527],
  [0.0425, 0.5505],
  [0.0408, 0.5685],
  [0.033, 0.5825],
  [0.029, 0.5865],
  [0.0288, 0.5905],
  [0.0288, 0.595]
];

export default function Desk() {
  const built = useMemo(() => {
    // --- seeded imperfection data, shared by color + bump passes ---
    const rb = mulberry32(0x5eed01);
    const bands: Band[] = [];
    let by = -30;
    let light = rb() > 0.5;
    while (by < 1024 + 60) {
      const bh = 30 + rb() * 72;
      bands.push({
        y: by,
        h: bh,
        light,
        phase: rb() * Math.PI * 2,
        amp: 3 + rb() * 8,
        slope: (rb() - 0.5) * 36,
        alpha: 0.1 + rb() * 0.16,
        flips: 2 + Math.floor(rb() * 3)
      });
      by += bh * (0.8 + rb() * 0.45);
      light = !light;
    }

    const rs = mulberry32(0x5eed02);
    const streaks = Array.from({ length: 480 }, () => ({
      y: rs() * 1024,
      x0: rs() * 1200 - 100,
      len: 500 + rs() * 1400,
      lw: 0.5 + rs() * 1.5,
      alpha: 0.04 + rs() * 0.1,
      lightTone: rs() > 0.62,
      wobble: 1 + rs() * 3,
      phase: rs() * Math.PI * 2
    }));

    const rp = mulberry32(0x5eed03);
    const pores = Array.from({ length: 1700 }, () => ({
      x: rp() * 2048,
      y: rp() * 1024,
      len: 5 + rp() * 22,
      lw: 0.6 + rp() * 0.9,
      alpha: 0.05 + rp() * 0.08
    }));

    const rf = mulberry32(0x5eed04);
    const figures = Array.from({ length: 3 }, () => ({
      cx: 200 + rf() * 1648,
      cy: 150 + rf() * 724,
      rx: 60 + rf() * 90,
      ry: 26 + rf() * 30,
      rot: (rf() - 0.5) * 0.5
    }));
    const patches = Array.from({ length: 5 }, () => ({
      x: rf() * 2048,
      y: rf() * 1024,
      r: 250 + rf() * 450,
      dark: rf() > 0.5
    }));

    const rg = mulberry32(0x5eed05);
    const blots = Array.from({ length: 26 }, () => ({
      x: rg() * 1024,
      y: rg() * 512,
      r: 90 + rg() * 230,
      v: 76 + rg() * 56
    }));
    // Sheen lanes follow the grain: french polish levels differently over
    // hard/soft ribbon, so gloss varies in long streaks, not blobs.
    const lanes = Array.from({ length: 110 }, () => ({
      y: rg() * 512,
      x0: rg() * 1200 - 90,
      len: 260 + rg() * 760,
      lw: 5 + rg() * 16,
      up: rg() > 0.5,
      dv: 6 + rg() * 9,
      alpha: 0.1 + rg() * 0.14,
      phase: rg() * Math.PI * 2
    }));

    const rw = mulberry32(0x5eed07);
    // Polish pools: where the french polish is freshest the reflection goes
    // near-sharp. Biased left/center and mid-depth — the lamp pool's runway.
    const pools = Array.from({ length: 7 }, () => ({
      x: 80 + rw() * 700,
      y: 40 + rw() * 300,
      r: 55 + rw() * 95,
      v: 62 + rw() * 18,
      stretch: 1.8 + rw() * 1.4
    }));
    // Worn matte tracks along the front edge where forearms lived (canvas
    // bottom = world front): keyboard zone, a drag track, the mouse side.
    const wearTracks = [
      { x: 652, y: 448, rx: 170, ry: 26, v: 152 },
      { x: 540, y: 472, rx: 230, ry: 20, v: 146 },
      { x: 806, y: 438, rx: 110, ry: 22, v: 156 }
    ] as const;
    const scuffs = Array.from({ length: 70 }, () => ({
      x: rw() * 1024,
      y: 416 + rw() * 86,
      len: 18 + rw() * 42,
      v: 158 + rw() * 12,
      alpha: 0.12 + rw() * 0.14
    }));

    // --- ribbon-stripe mahogany color map (2048x1024) ---
    const colorTex = makeCanvasTexture(
      2048,
      1024,
      (ctx, w, h) => {
        ctx.fillStyle = "#4a2417";
        ctx.fillRect(0, 0, w, h);

        for (const b of bands) {
          bandPath(ctx, b, w);
          // Under the reflector film (mirror 0.42) half the diffuse read is
          // gone, so the stripes carry more of the load: stronger band
          // separation keeps the mahogany from flattening to one tone.
          ctx.globalAlpha = Math.min(1, b.alpha * 1.45);
          ctx.fillStyle = b.light ? "#653523" : "#2c1209";
          ctx.fill();

          // interlocked chatoyance: lightness flips along the band — this is
          // the ribbon shimmer the lamp sweep plays across, so it gets the
          // biggest contrast lift of the pass.
          bandPath(ctx, b, w);
          const g = ctx.createLinearGradient(0, 0, w, 0);
          for (let s = 0; s <= b.flips; s++) {
            const bright = (s % 2 === 0) === b.light;
            g.addColorStop(
              s / b.flips,
              bright ? "rgba(216,146,88,0.75)" : "rgba(16,6,3,0.78)"
            );
          }
          ctx.globalAlpha = 0.1 + (b.amp / 11) * 0.09;
          ctx.fillStyle = g;
          ctx.fill();
        }

        // Cathedral figure: dark late-wood line with a warm early-wood
        // shoulder just inside it, the way a crown-cut arch actually prints.
        for (const f of figures) {
          for (let ring = 1; ring <= 7; ring++) {
            ctx.strokeStyle = "#2a1106";
            ctx.globalAlpha = Math.max(0.12 - ring * 0.013, 0);
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.ellipse(f.cx, f.cy, f.rx * ring * 0.55, f.ry * ring * 0.5, f.rot, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = "#9a5a32";
            ctx.globalAlpha = Math.max(0.07 - ring * 0.008, 0);
            ctx.lineWidth = 3.2;
            ctx.beginPath();
            ctx.ellipse(
              f.cx,
              f.cy,
              f.rx * (ring * 0.55 - 0.12),
              f.ry * (ring * 0.5 - 0.1),
              f.rot,
              0,
              Math.PI * 2
            );
            ctx.stroke();
          }
        }

        for (const s of streaks) {
          ctx.strokeStyle = s.lightTone ? "#7a4226" : "#2a1108";
          ctx.globalAlpha = s.alpha;
          ctx.lineWidth = s.lw;
          ctx.beginPath();
          ctx.moveTo(s.x0, s.y);
          for (let i = 1; i <= 9; i++) {
            ctx.lineTo(
              s.x0 + (s.len * i) / 9,
              s.y + Math.sin(i * 1.3 + s.phase) * s.wobble
            );
          }
          ctx.stroke();
        }

        for (const p of pores) {
          ctx.strokeStyle = "#1f0c05";
          ctx.globalAlpha = p.alpha;
          ctx.lineWidth = p.lw;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.len, p.y + p.len * 0.04);
          ctx.stroke();
        }

        for (const t of patches) {
          const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
          g.addColorStop(0, t.dark ? "rgba(20,8,4,0.5)" : "rgba(190,120,72,0.4)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalAlpha = 0.15;
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }
        ctx.globalAlpha = 1;
      },
      { anisotropy: 8 }
    );

    // --- linear bump map: band relief, cathedral figure, open pores (all
    // registered with the color pass so highlights land on the right grain) ---
    const bumpTex = makeCanvasTexture(
      2048,
      1024,
      (ctx, w, h) => {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, w, h);
        for (const b of bands) {
          bandPath(ctx, b, w);
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = b.light ? "#8e8e8e" : "#6e6e6e";
          ctx.fill();
        }
        // Cathedral arches get real relief: the late-wood line sits proud of
        // the early wood, so a raking lamp draws the figure even where the
        // albedo contrast is subtle.
        for (const f of figures) {
          for (let ring = 1; ring <= 6; ring++) {
            ctx.strokeStyle = ring % 2 ? "#6a6a6a" : "#929292";
            ctx.globalAlpha = Math.max(0.4 - ring * 0.05, 0);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(f.cx, f.cy, f.rx * ring * 0.55, f.ry * ring * 0.5, f.rot, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        for (const s of streaks) {
          ctx.strokeStyle = s.lightTone ? "#929292" : "#6a6a6a";
          ctx.globalAlpha = s.alpha * 0.8;
          ctx.lineWidth = s.lw;
          ctx.beginPath();
          ctx.moveTo(s.x0, s.y);
          for (let i = 1; i <= 9; i++) {
            ctx.lineTo(
              s.x0 + (s.len * i) / 9,
              s.y + Math.sin(i * 1.3 + s.phase) * s.wobble
            );
          }
          ctx.stroke();
        }
        // Open pores: a dark trench with a 1px bright shoulder under it —
        // the shoulder is what actually catches light when the lamp rakes
        // the slab, turning each pore into a tiny specular tick.
        for (const p of pores) {
          ctx.strokeStyle = "#969696";
          ctx.globalAlpha = 0.3;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y + 1.2);
          ctx.lineTo(p.x + p.len, p.y + p.len * 0.04 + 1.2);
          ctx.stroke();
          ctx.strokeStyle = "#484848";
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = p.lw;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.len, p.y + p.len * 0.04);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
      { anisotropy: 8, srgb: false }
    );

    // --- french-polish sheen map. This is the desk's highest-leverage
    // texture: it is the roughnessMap on the slab AND (recomposed) the
    // per-texel blur driver on the reflector film, so every value here is
    // literally how sharp the room reflects at that spot. Three registers:
    // grain-following lanes (subtle), polish pools where light skates
    // (gloss, ~0.25), and matte forearm tracks along the front edge that
    // drink the reflection (~0.6). ---
    const sheenTex = makeCanvasTexture(
      1024,
      512,
      (ctx, w, h) => {
        ctx.fillStyle = "rgb(112,112,112)";
        ctx.fillRect(0, 0, w, h);

        for (const l of lanes) {
          const v = Math.round(l.up ? 112 + l.dv : 112 - l.dv);
          ctx.strokeStyle = `rgb(${v},${v},${v})`;
          ctx.globalAlpha = l.alpha;
          ctx.lineWidth = l.lw;
          ctx.beginPath();
          ctx.moveTo(l.x0, l.y);
          for (let i = 1; i <= 6; i++) {
            ctx.lineTo(l.x0 + (l.len * i) / 6, l.y + Math.sin(i * 1.1 + l.phase) * 3);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        for (const blot of blots) {
          const v = Math.round(blot.v);
          const g = ctx.createRadialGradient(blot.x, blot.y, 0, blot.x, blot.y, blot.r);
          g.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
          g.addColorStop(1, `rgba(${v},${v},${v},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }

        // Polish pools, stretched along the grain — under the lamp these
        // read as the lacquer "skating" highlights; in the reflector they
        // open near-sharp windows onto the room.
        for (const p of pools) {
          const v = Math.round(p.v);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(p.stretch, 1);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r);
          g.addColorStop(0, `rgba(${v},${v},${v},0.6)`);
          g.addColorStop(1, `rgba(${v},${v},${v},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
          ctx.restore();
        }

        // Matte wear where forearms lived: soft-edged horizontal smudges
        // that blur and dull whatever reflects there.
        for (const t of wearTracks) {
          ctx.save();
          ctx.translate(t.x, t.y);
          ctx.scale(t.rx / t.ry, 1);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, t.ry);
          g.addColorStop(0, `rgba(${t.v},${t.v},${t.v},0.55)`);
          g.addColorStop(0.7, `rgba(${t.v},${t.v},${t.v},0.32)`);
          g.addColorStop(1, `rgba(${t.v},${t.v},${t.v},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(-t.ry, -t.ry, t.ry * 2, t.ry * 2);
          ctx.restore();
        }
        // Micro-scuffs inside the wear zone: fine matte hairlines that keep
        // the worn band from reading as one smooth gradient up close.
        for (const s of scuffs) {
          const v = Math.round(s.v);
          ctx.strokeStyle = `rgb(${v},${v},${v})`;
          ctx.globalAlpha = s.alpha;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x + s.len, s.y + s.len * 0.03);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Two dull cup rings, front-right: dried residue kills the polish
        // in a thin circle — a close-focus detail that costs nothing.
        for (const [cx, cy, cr] of [
          [846, 408, 27],
          [818, 424, 23]
        ] as const) {
          ctx.strokeStyle = "rgb(150,150,150)";
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(cx, cy, cr, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
      { anisotropy: 8, srgb: false }
    );

    // --- reflector composites: the lacquer plane covers the WHOLE top
    // (field, breadboard caps, hairline seams), so its maps are recomposed
    // from the canvases above — field copied 1:1, cap strips rotated 90° so
    // breadboard grain runs front-to-back, seams drawn in. No new grain is
    // invented; the plane must read as the same board, only deepened.
    const seamFrac = (W / 2 - CAP_W - SEAM_GAP / 2) / W;
    const capSrcY: [number, number] = [140, 610];
    const composeTop = (
      src: HTMLCanvasElement,
      opts: { seam: string; seamShoulder?: string; tint?: string; srgb: boolean }
    ) =>
      makeCanvasTexture(
        2048,
        1024,
        (ctx, w, h) => {
          ctx.drawImage(src, 0, 0, w, h);
          const capPx = Math.round((CAP_W / W) * w);
          ([0, 1] as const).forEach((i) => {
            const x0 = i === 0 ? 0 : w - capPx;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x0, 0, capPx, h);
            ctx.clip();
            ctx.translate(x0 + capPx / 2, h / 2);
            ctx.rotate(Math.PI / 2);
            // ~1:1-scale strip per cap (color and bump share source rects
            // so pores stay registered across maps)
            ctx.drawImage(
              src,
              200,
              capSrcY[i],
              1024,
              112,
              -h / 2,
              -capPx / 2,
              h,
              capPx
            );
            if (opts.tint) {
              ctx.globalCompositeOperation = "multiply";
              ctx.fillStyle = opts.tint;
              ctx.fillRect(-h / 2, -capPx / 2, h, capPx);
            }
            ctx.restore();
          });
          // Real seams read as a dark wax line flanked by the rounded
          // lacquer shoulders on each board edge — shoulders first, then
          // the core drawn over the middle.
          for (const s of [-1, 1]) {
            const x = (0.5 + s * seamFrac) * w;
            if (opts.seamShoulder) {
              ctx.globalAlpha = 0.55;
              ctx.fillStyle = opts.seamShoulder;
              ctx.fillRect(x - 2.5, 0, 5, h);
              ctx.globalAlpha = 1;
            }
            ctx.fillStyle = opts.seam;
            ctx.fillRect(x - 1.5, 0, 3, h);
          }
        },
        { anisotropy: 8, srgb: opts.srgb }
      );

    const reflectorColor = composeTop(colorTex.image as HTMLCanvasElement, {
      seam: "#140803", // old wax, darker than any grain line
      seamShoulder: "#8a4d2c", // lacquer rounds pale where it meets the gap
      tint: "#f4e9e1", // breadboard cap tint, matching the cap material color
      srgb: true
    });
    const reflectorBump = composeTop(bumpTex.image as HTMLCanvasElement, {
      seam: "#2c2c2c", // the groove drops…
      seamShoulder: "#a6a6a6", // …and its beads sit proud, catching light
      srgb: false
    });
    // Caps share the un-rotated sheen exactly like the cap material does.
    // Seams in the roughness map: a dull waxed core (reflection dies in the
    // groove) between polished bead shoulders — the thin bright lines that
    // make the seams read in the records/notes focus views.
    const reflectorRough = makeCanvasTexture(
      1024,
      512,
      (ctx, w, h) => {
        ctx.drawImage(sheenTex.image as HTMLCanvasElement, 0, 0, w, h);
        for (const s of [-1, 1]) {
          const x = (0.5 + s * seamFrac) * w;
          ctx.fillStyle = "rgb(92,92,92)";
          ctx.fillRect(x - 2, 0, 4, h);
          ctx.fillStyle = "rgb(168,168,168)";
          ctx.fillRect(x - 1, 0, 2, h);
        }
      },
      { anisotropy: 8, srgb: false }
    );

    const orient = (
      tex: THREE.Texture,
      rot: number,
      rx = 1,
      ry = 1,
      ox = 0,
      oy = 0
    ) => {
      const t = tex.clone();
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.center.set(0.5, 0.5);
      t.rotation = rot;
      t.repeat.set(rx, ry);
      t.offset.set(ox, oy);
      t.needsUpdate = true;
      return t;
    };

    const physical = (
      map: THREE.Texture,
      bump: THREE.Texture,
      opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}
    ) => {
      const m = new THREE.MeshPhysicalMaterial({
        map,
        roughness: 0.4,
        metalness: 0.02,
        clearcoat: 0.65,
        clearcoatRoughness: 0.22,
        ...opts
      });
      m.bumpMap = bump;
      m.bumpScale = 0.0009;
      return m;
    };

    const top = physical(colorTex, bumpTex, {
      roughness: 1, // roughnessMap carries the ~0.25-0.6 sheen variation
      roughnessMap: sheenTex,
      clearcoat: 0.85,
      clearcoatRoughness: 0.13
    });
    top.envMapIntensity = 1.3;

    const cap = physical(
      orient(colorTex, Math.PI / 2),
      orient(bumpTex, Math.PI / 2),
      {
        roughness: 1,
        roughnessMap: sheenTex,
        clearcoat: 0.85,
        clearcoatRoughness: 0.14,
        color: "#f4e9e1"
      }
    );
    cap.envMapIntensity = 1.3;

    // Profile faces (edge band, aprons, legs) live outside the lamp pool, so
    // the environment map is most of the light they ever see: env intensity
    // up and clearcoat tightened so their curves draw thin specular lines in
    // both themes instead of dissolving into shadow.
    const edge = physical(
      orient(colorTex, 0, 1, 0.05, 0, 0.35),
      orient(bumpTex, 0, 1, 0.05, 0, 0.35),
      { clearcoat: 0.75, clearcoatRoughness: 0.18, color: "#e9d9d0" }
    );
    edge.envMapIntensity = 1.25;

    const apron = physical(
      orient(colorTex, 0, 1.4, 0.32, 0.1, 0.2),
      orient(bumpTex, 0, 1.4, 0.32, 0.1, 0.2),
      { clearcoat: 0.75, clearcoatRoughness: 0.18, color: "#f2e4dc" }
    );
    apron.envMapIntensity = 1.2;

    // Legs get the tightest coat of the base: the lathe bead and cove each
    // catch their own hairline of env light, which is what keeps the turned
    // profile legible at night. Clones (blocks, per-leg tints) inherit this.
    const legBase = physical(
      orient(colorTex, Math.PI / 2),
      orient(bumpTex, Math.PI / 2),
      { clearcoat: 0.85, clearcoatRoughness: 0.13 }
    );
    legBase.envMapIntensity = 1.35;

    const block = legBase.clone();
    block.color = new THREE.Color("#f0e3db");

    // Seam gap material: old wax — near-black but satin, so the line glints
    // faintly at grazing angles in the close focus views instead of reading
    // as a flat painted stripe.
    const seam = new THREE.MeshPhysicalMaterial({
      color: "#140803",
      roughness: 0.38,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3
    });
    const dark = new THREE.MeshStandardMaterial({
      color: "#2b1610",
      roughness: 0.85,
      metalness: 0
    });

    // --- breadboard end grain: crosscut faces drink finish and light, so
    // they sit darker and matter than every long-grain face around them ---
    const re = mulberry32(0x5eed08);
    const endGrainTex = makeCanvasTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#371a0d";
      ctx.fillRect(0, 0, w, h);
      // growth-ring arcs sweeping up through the crosscut
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = i % 2 ? "#2a1207" : "#482412";
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2 + re() * 3;
        ctx.beginPath();
        ctx.arc(
          w * 0.5 + (re() - 0.5) * 60,
          h + 140,
          150 + i * 9 + re() * 5,
          Math.PI * 1.15,
          Math.PI * 1.85
        );
        ctx.stroke();
      }
      // open pores read as dots on end grain, not lines
      for (let i = 0; i < 500; i++) {
        const g = 14 + Math.floor(re() * 26);
        ctx.fillStyle = `rgb(${g + 18},${g},${Math.max(g - 8, 4)})`;
        ctx.globalAlpha = 0.35 + re() * 0.4;
        ctx.beginPath();
        ctx.arc(re() * w, re() * h, 0.6 + re() * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
    const endGrain = new THREE.MeshPhysicalMaterial({
      map: endGrainTex,
      roughness: 0.74,
      metalness: 0,
      clearcoat: 0.12,
      clearcoatRoughness: 0.5
    });
    endGrain.bumpMap = endGrainTex;
    endGrain.bumpScale = 0.0005;
    endGrain.envMapIntensity = 0.55;

    // --- turned leg lathe ---
    const legLen = H - T - BLOCK_H + 0.005;
    const sy = legLen / 0.595;
    const curve = new THREE.CatmullRomCurve3(
      LEG_PROFILE.map(([r, y]) => new THREE.Vector3(r, y * sy, 0)),
      false,
      "catmullrom",
      0.5
    );
    const legGeo = new THREE.LatheGeometry(
      curve.getPoints(140).map((p) => new THREE.Vector2(Math.max(p.x, 0.0012), p.y)),
      48
    );

    const rl = mulberry32(0x5eed06);
    const tints = ["#ffffff", "#f5ece7", "#fff3ea", "#f1e6df"];
    const legs = ([
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1]
    ] as const).map(([sx, sz], i) => {
      const mat = legBase.clone();
      mat.color = new THREE.Color(tints[i]);
      return {
        sx,
        sz,
        mat,
        yaw: rl() * Math.PI,
        tiltX: (rl() - 0.5) * 0.006,
        tiltZ: (rl() - 0.5) * 0.006
      };
    });

    return {
      top,
      cap,
      edge,
      apron,
      block,
      seam,
      dark,
      endGrain,
      legGeo,
      legs,
      reflectorColor,
      reflectorBump,
      reflectorRough
    };
  }, []);

  // The lacquer leans into the room's mood: lamplight keeps the wood
  // primary, the dim room lets reflections (the MacBook's screen-leak
  // streak) carry more of the surface. mixStrength is uniform-backed, so
  // writing it per-frame costs nothing and never recompiles the shader.
  const { mixRef } = useDeskTheme();
  const reflectorMat = useRef<ElementRef<typeof MeshReflectorMaterial>>(null);
  useFrame(() => {
    const mat = reflectorMat.current;
    if (!mat) return;
    mat.mixStrength = THREE.MathUtils.lerp(
      REFLECTOR_MIX_STRENGTH_DARK,
      REFLECTOR_MIX_STRENGTH_LIGHT,
      mixRef.current
    );
  });

  // The film must cover the slab's entire flat top: when it was inset, a
  // ~4 mm rim of the brighter base lacquer showed all the way around and
  // read as a translucent border (Jason flagged it). Rounded-rect matched
  // to the RoundedBox's flat region (radius 0.0035), with UVs renormalized
  // to 0..1 because ShapeGeometry emits shape-space coordinates.
  const reflectorGeometry = useMemo(() => {
    const w = W - 0.0072;
    const d = D - 0.0072;
    const r = 0.0032;
    const x = w / 2;
    const y = d / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-x + r, -y);
    shape.lineTo(x - r, -y);
    shape.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(x, y - r);
    shape.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-x + r, y);
    shape.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-x, -y + r);
    shape.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
    const geometry = new THREE.ShapeGeometry(shape, 6);
    const uv = geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / d + 0.5);
    }
    uv.needsUpdate = true;
    return geometry;
  }, []);

  const LX = W / 2 - LEG_INSET;
  const LZ = D / 2 - LEG_INSET;
  const APR_Z = LZ + BLOCK / 2 - 0.006 - APRON_T / 2;
  const APR_X = LX + BLOCK / 2 - 0.006 - APRON_T / 2;
  const apronY = -T - APRON_H / 2 + 0.001;
  const beadY = -T - APRON_H + 0.0045;
  const fieldW = W - 2 * CAP_W - 2 * SEAM_GAP;
  const seamX = W / 2 - CAP_W - SEAM_GAP / 2;

  return (
    <group>
      {/* lacquer reflection film: a thin plane over the full slab wearing
          recomposed copies of the same wood maps, so the top reads as the
          identical board with a true reflecting finish. Inset 4 mm so it
          never overhangs the slab's rounded corners; raycast is disabled so
          it can't shadow object picking. mixStrength animates in useFrame
          above (not passed as a prop, so re-renders never stomp it). */}
      <mesh
        position={[0, REFLECTOR_LIFT, 0]}
        rotation-x={-Math.PI / 2}
        geometry={reflectorGeometry}
        receiveShadow
        raycast={() => null}
      >
        <MeshReflectorMaterial
          ref={reflectorMat}
          map={built.reflectorColor}
          bumpMap={built.reflectorBump}
          bumpScale={0.0009}
          roughnessMap={built.reflectorRough}
          roughness={1}
          metalness={0.02}
          envMapIntensity={1.2}
          mirror={REFLECTOR_MIRROR}
          mixBlur={REFLECTOR_MIX_BLUR}
          mixContrast={REFLECTOR_MIX_CONTRAST}
          blur={REFLECTOR_BLUR}
          resolution={REFLECTOR_RESOLUTION}
          depthScale={REFLECTOR_DEPTH_SCALE}
          minDepthThreshold={REFLECTOR_MIN_DEPTH_THRESHOLD}
          maxDepthThreshold={REFLECTOR_MAX_DEPTH_THRESHOLD}
        />
      </mesh>

      {/* slab field with breadboard end caps + hairline seams */}
      <RoundedBox
        args={[fieldW, TOP_H, D]}
        radius={0.0035}
        smoothness={4}
        position={[0, -TOP_H / 2, 0]}
        castShadow
        receiveShadow
        material={built.top}
      />
      {[-1, 1].map((s) => (
        <RoundedBox
          key={`cap${s}`}
          args={[CAP_W, TOP_H, D]}
          radius={0.0035}
          smoothness={4}
          position={[s * (W / 2 - CAP_W / 2), -TOP_H / 2, 0]}
          castShadow
          receiveShadow
          material={built.cap}
        />
      ))}
      {[-1, 1].map((s) => (
        <mesh
          key={`seam${s}`}
          position={[s * seamX, -TOP_H / 2 - 0.0008, 0]}
          material={built.seam}
        >
          <boxGeometry args={[0.0015, TOP_H, D - 0.002]} />
        </mesh>
      ))}

      {/* breadboard end grain: the caps' grain runs front-to-back, so their
          crosscut shows on the desk's front/back faces — thin veneer planes
          0.3 mm proud of the cap, darker and matter, anchoring the joinery
          when light rakes the front edge */}
      {([
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1]
      ] as const).map(([sx, fz]) => (
        <mesh
          key={`endgrain${sx}:${fz}`}
          position={[sx * (W / 2 - CAP_W / 2), -TOP_H / 2, fz * (D / 2 + 0.0003)]}
          rotation={[0, fz === 1 ? 0 : Math.PI, 0]}
          receiveShadow
          material={built.endGrain}
        >
          <planeGeometry args={[CAP_W - 0.009, TOP_H - 0.007]} />
        </mesh>
      ))}

      {/* routed edge: chamfer band, then undercut reveal */}
      <RoundedBox
        args={[W - 0.011, BAND_H, D - 0.011]}
        radius={0.0025}
        smoothness={4}
        position={[0, -TOP_H - BAND_H / 2 + 0.001, 0]}
        castShadow
        receiveShadow
        material={built.edge}
      />
      <RoundedBox
        args={[W - 0.024, REVEAL_H, D - 0.024]}
        radius={0.003}
        smoothness={4}
        position={[0, -T + REVEAL_H / 2, 0]}
        castShadow
        material={built.edge}
      />

      {/* turned legs under square top blocks */}
      {built.legs.map((leg, i) => (
        <group key={`leg${i}`}>
          <group
            position={[leg.sx * LX, -H, leg.sz * LZ]}
            rotation={[leg.tiltX, leg.yaw, leg.tiltZ]}
          >
            <mesh geometry={built.legGeo} material={leg.mat} castShadow receiveShadow />
          </group>
          <RoundedBox
            args={[BLOCK, BLOCK_H, BLOCK]}
            radius={0.004}
            smoothness={4}
            position={[leg.sx * LX, -T - BLOCK_H / 2 + 0.001, leg.sz * LZ]}
            castShadow
            material={built.block}
          />
        </group>
      ))}

      {/* aprons with beaded lower strips */}
      {[-1, 1].map((s) => (
        <group key={`apfb${s}`}>
          <RoundedBox
            args={[2 * LX, APRON_H, APRON_T]}
            radius={0.003}
            smoothness={4}
            position={[0, apronY, s * APR_Z]}
            castShadow
            receiveShadow
            material={built.apron}
          />
          <mesh
            position={[0, beadY, s * (APR_Z + APRON_T / 2 - 0.002)]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
            material={built.edge}
          >
            <cylinderGeometry args={[0.0045, 0.0045, 2 * LX - 0.05, 18]} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((s) => (
        <group key={`apside${s}`}>
          <RoundedBox
            args={[APRON_T, APRON_H, 2 * LZ + 0.02]}
            radius={0.003}
            smoothness={4}
            position={[s * APR_X, apronY, 0]}
            castShadow
            receiveShadow
            material={built.apron}
          />
          <mesh
            position={[s * (APR_X + APRON_T / 2 - 0.002), beadY, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
            material={built.edge}
          >
            <cylinderGeometry args={[0.0045, 0.0045, 2 * LZ - 0.05, 18]} />
          </mesh>
        </group>
      ))}

      {/* interior corner blocks bracing apron-to-leg joints */}
      {([
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ] as const).map(([sx, sz], i) => (
        <mesh
          key={`brace${i}`}
          position={[sx * (LX - 0.052), apronY, sz * (LZ - 0.052)]}
          rotation={[0, sx * sz > 0 ? Math.PI / 4 : -Math.PI / 4, 0]}
          material={built.dark}
        >
          <boxGeometry args={[0.085, 0.07, 0.016]} />
        </mesh>
      ))}
    </group>
  );
}
