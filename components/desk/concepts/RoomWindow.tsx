"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { mergeBufferGeometries } from "three-stdlib";
import { lacquerMaterial, makeCanvasTexture } from "@/lib/three/materials";
import { FLOOR_Y } from "../layout";

// Concept block-out B: "the back-wall window" (composition v3).
//
// A real corner of a warm room at night — back wall behind the desk holds a
// double-hung sash window CENTERED at x=0, with a plain plaster right side
// wall meeting it at x = +1.5. Light from the night city outside rakes
// forward over the desk through the opening. Mounted ONLY in the offline
// bake/export scene, never in the live site (yet).
//
// Export-safety: MeshStandard/MeshPhysical only, canvas textures only, no
// glass — the window openings are empty so path-traced light passes through
// unimpeded. It is ALWAYS NIGHT here: a single emissive backdrop canvas
// (windowBackdropNight) hangs outside the opening; the bake script keys on
// that exact name and drives its emission per theme.

// ---------------------------------------------------------------------------
// Room envelope. Desk top is y=0, floor at FLOOR_Y; desk rear edge sits at
// z = -0.425, so a wall at z = -0.9 is ~0.5m behind the desk.
const BACK_WALL_Z = -0.9;
const SIDE_WALL_X = 1.5;
const WALL_HEIGHT = 2.5;
const WALL_THICKNESS = 0.09;
const BACK_WALL_OUTER_Z = BACK_WALL_Z - WALL_THICKNESS / 2; // -0.945
const BACK_WALL_INNER_Z = BACK_WALL_Z + WALL_THICKNESS / 2; // -0.855

// Floor: one textured plane (Room.tsx's per-plank lay is too heavy to
// duplicate here) — 4.2m wide x 3.2m deep, flush into the corner.
// Brought in from -2.7 so the room is enclosed on BOTH sides — the left
// wall sits on this edge (mirroring the right wall at FLOOR_X_MAX). Clears
// the record crate at x=-1.08 with ~0.7m to spare.
const FLOOR_X_MIN = -1.85;
const FLOOR_X_MAX = SIDE_WALL_X;
const FLOOR_Z_MIN = BACK_WALL_Z;
const FLOOR_Z_MAX = 2.3;
const FLOOR_W = FLOOR_X_MAX - FLOOR_X_MIN; // 4.2
const FLOOR_D = FLOOR_Z_MAX - FLOOR_Z_MIN; // 3.2
const FLOOR_CX = (FLOOR_X_MIN + FLOOR_X_MAX) / 2; // -0.6
const FLOOR_CZ = (FLOOR_Z_MIN + FLOOR_Z_MAX) / 2; // 0.7

// Window opening in the BACK wall, centered at x=0 (all heights above the
// FLOOR, not the desk).
const WIN_W = 0.85;
const WIN_H = 1.15;
const WIN_SILL = 0.85; // sill height above the floor
const WIN_X_CENTER = 0; // centered on the back wall
const WIN_X_MIN = WIN_X_CENTER - WIN_W / 2; // -0.425
const WIN_X_MAX = WIN_X_CENTER + WIN_W / 2; // 0.425
const WIN_Y_MIN = FLOOR_Y + WIN_SILL; // 0.10 (world)
const WIN_Y_MAX = WIN_Y_MIN + WIN_H; // 1.25 (world)

// Frame member sizing (meters).
const JAMB = 0.025; // jamb board thickness
const JAMB_DEPTH = WALL_THICKNESS + 0.012; // proud of the plaster ~6mm each side
const SASH_D = 0.032; // sash member depth (into the wall)
const STILE_W = 0.045; // sash stile width
const MUNTIN_W = 0.018; // muntin bar width
const MUNTIN_D = 0.02; // muntin bar depth (thinner than the sash frame)

// Raised-panel wainscoting (dark walnut). Stiles (vertical) and rails
// (horizontal) stand proud of the base wall by FRAME_RELIEF; the panel field
// sits between them, raised again by FIELD_RELIEF with a beveled edge — so the
// frame reads as the deepest plane, the bevel as a ramp, the field as a low
// plateau. Heights are above the FLOOR.
const PANEL_FRAME_W = 0.07; // stile / rail face width
const FRAME_RELIEF = 0.012; // stiles & rails proud of the base wall (12mm)
const FIELD_RELIEF = 0.006; // raised panel field above the base wall (6mm)
const FIELD_BEVEL = 0.018; // chamfered ramp width around each field
const CHAIR_RAIL_Y = 0.92; // chair-rail center height above the floor
const CHAIR_RAIL_H = 0.06; // chair-rail face height
const CHAIR_RAIL_RELIEF = 0.022; // chair rail stands proud the most (a cap)
const BASE_TOP_Y = 0.105; // baseboard top (matches baseboardShape height)
const CORNICE_Y = WALL_HEIGHT - 0.07; // top of the upper panel run

// Interior sill shelf: a real board ~0.12m deep into the room (a plant sits
// on it), capping at a known world y so the integrator can stand things on it.
const SILL_DEPTH = 0.12; // front-to-back into the room
const SILL_THICK = 0.035;
const SILL_TOP_Y = WIN_Y_MIN; // top surface flush with the opening bottom

// Backdrop outside the window: one emissive 3m plane ~0.5m beyond the wall's
// OUTER face, facing +z back in through the opening. It is the only backdrop —
// always night — and is sized to fully cover the opening from interior angles.
// The backdrop is sized and placed so the WINDOW OPENING frames most of the
// painting — a 3 m plane half a meter back showed only a ~28% central slice,
// hiding the moon and skyline behind the wall. Close and not much wider than
// the opening, the whole view reads through the glass.
const BACKDROP_SIZE = 1.55;
const BACKDROP_Z_NIGHT = BACK_WALL_OUTER_Z - 0.16; // just behind the wall
const BACKDROP_CY = (WIN_Y_MIN + WIN_Y_MAX) / 2; // window vertical center (0.675)

// Aged-oak trios borrowed from Room.tsx's palette: [base, dark grain, light].
const OAK_TONES: [string, string, string][] = [
  ["#6e5637", "#52402a", "#82693f"],
  ["#675134", "#4c3b26", "#7a6240"],
  ["#755c3b", "#5a462d", "#876d46"],
  ["#615033", "#473a24", "#735f3b"],
  ["#6b573b", "#4f4128", "#7d6845"]
];

// Dark-walnut wall paneling tones — deep, cool-brown and distinct from the
// desk's redder oak so the wainscoting reads as its own surface (a lawyer's
// study). [field base, dark grain, light figure].
const WALNUT_FIELD = "#33200f"; // panel field — deepest
const WALNUT_FRAME = "#3d2715"; // stiles/rails — a hair warmer/lighter
const WALNUT_RAIL = "#2c1c0e"; // chair rail & baseboard — darkest
const WALNUT_GRAIN_DARK = "#1f1409";
const WALNUT_GRAIN_LIGHT = "#5a3c22";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Axis-aligned box pre-translated into world position — the building block
// for the merged window frame.
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number
): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  return geometry;
}

function merge(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeBufferGeometries(geometries);
  if (!merged) {
    throw new Error("RoomWindow: geometry merge failed.");
  }
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
}

// ---------------------------------------------------------------------------
// Plaster, repainted in the spirit of Room.tsx but a touch lighter (walls)
// and a touch darker (ceiling) so bounced window light has tonal range.

function plasterColorTexture(
  rng: () => number,
  base: string,
  washes: string[],
  repeat?: [number, number]
): THREE.CanvasTexture {
  return makeCanvasTexture(
    1024,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      // Soft tonal washes — sun-warmed patches and dustier corners.
      for (let i = 0; i < 14; i++) {
        const x = rng() * w;
        const y = rng() * h;
        const r = 120 + rng() * 320;
        const tone = washes[Math.floor(rng() * washes.length)];
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, rgba(tone, 0.03 + rng() * 0.04));
        grad.addColorStop(1, rgba(tone, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }

      // Barely-there pigment speckle.
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = rgba(rng() < 0.5 ? "#cdbc9c" : "#f4e8d0", 0.04);
        ctx.fillRect(rng() * w, rng() * h, 1 + rng(), 1 + rng());
      }
    },
    repeat ? { anisotropy: 8, repeat } : { anisotropy: 8 }
  );
}

function plasterBumpTexture(
  rng: () => number,
  repeat?: [number, number]
): THREE.CanvasTexture {
  return makeCanvasTexture(
    2048,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);

      // Low-contrast mottle.
      for (let i = 0; i < 1100; i++) {
        const x = rng() * w;
        const y = rng() * h;
        const r = 8 + rng() * 80;
        const tone = rng() < 0.5 ? 235 : 60;
        const a = 0.02 + rng() * 0.04;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(${tone},${tone},${tone},${a})`);
        grad.addColorStop(1, `rgba(${tone},${tone},${tone},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }

      // Faint trowel sweeps with a thin ridge along the outer edge.
      for (let i = 0; i < 80; i++) {
        const x = rng() * w;
        const y = rng() * h;
        const r = 90 + rng() * 420;
        const start = rng() * Math.PI * 2;
        const sweep = 0.25 + rng() * 0.9;
        const lighter = rng() < 0.5;
        ctx.strokeStyle = lighter
          ? "rgba(212,212,212,0.05)"
          : "rgba(76,76,76,0.045)";
        ctx.lineWidth = 8 + rng() * 30;
        ctx.beginPath();
        ctx.arc(x, y, r, start, start + sweep);
        ctx.stroke();
        ctx.strokeStyle = lighter
          ? "rgba(255,255,255,0.05)"
          : "rgba(40,40,40,0.05)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r + 6, start, start + sweep);
        ctx.stroke();
      }

      // Sand-fine speckle.
      for (let i = 0; i < 4000; i++) {
        const t = rng() < 0.5 ? 30 : 230;
        ctx.fillStyle = `rgba(${t},${t},${t},${0.03 + rng() * 0.03})`;
        ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 1.5, 1 + rng() * 1.5);
      }
    },
    repeat ? { srgb: false, anisotropy: 8, repeat } : { srgb: false, anisotropy: 8 }
  );
}

// ---------------------------------------------------------------------------
// Dark walnut wall paneling. A deep, near-black walnut with STRAIGHT VERTICAL
// grain (the grain runs up the wall) plus the occasional broad cathedral
// figure — distinct from the floor/desk oak. One canvas serves as the colour
// map; a second, contrast-boosted pass serves as its bump. `vertical` swaps
// the grain axis so the same generator can dress horizontal members (rails)
// with grain running along their length.

function walnutColorTexture(
  rng: () => number,
  base: string,
  repeat?: [number, number],
  vertical = true
): THREE.CanvasTexture {
  // Portrait canvas so vertical grain has resolution along the long axis.
  const W = vertical ? 512 : 1024;
  const H = vertical ? 1024 : 512;
  return makeCanvasTexture(
    W,
    H,
    (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      // Broad tonal banding across the grain (sapwood/heartwood drift).
      const bands = 9;
      for (let i = 0; i < bands; i++) {
        const pos = (i / bands) * (vertical ? w : h) + rng() * 18;
        const span = 24 + rng() * 60;
        const dark = rng() < 0.55;
        const tone = dark ? WALNUT_GRAIN_DARK : WALNUT_GRAIN_LIGHT;
        const a = 0.05 + rng() * 0.08;
        let grad: CanvasGradient;
        if (vertical) {
          grad = ctx.createLinearGradient(pos - span, 0, pos + span, 0);
        } else {
          grad = ctx.createLinearGradient(0, pos - span, 0, pos + span);
        }
        grad.addColorStop(0, rgba(tone, 0));
        grad.addColorStop(0.5, rgba(tone, a));
        grad.addColorStop(1, rgba(tone, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Fine straight grain lines running the length of the grain axis, each
      // with a slight wander so it reads as wood rather than a comb.
      const lineCount = vertical ? 220 : 200;
      for (let i = 0; i < lineCount; i++) {
        const across = rng() * (vertical ? w : h);
        const amp = 0.6 + rng() * 2.4;
        const freq = 0.004 + rng() * 0.012;
        const phase = rng() * Math.PI * 2;
        ctx.strokeStyle = rng() < 0.6 ? WALNUT_GRAIN_DARK : WALNUT_GRAIN_LIGHT;
        ctx.globalAlpha = 0.05 + rng() * 0.1;
        ctx.lineWidth = 0.5 + rng() * 1.4;
        ctx.beginPath();
        if (vertical) {
          for (let y = 0; y <= h; y += 12) {
            const x = across + Math.sin(y * freq + phase) * amp;
            if (y === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        } else {
          for (let x = 0; x <= w; x += 12) {
            const y = across + Math.sin(x * freq + phase) * amp;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // A couple of broad cathedral arches for figure.
      const cath = 1 + Math.floor(rng() * 2);
      for (let c = 0; c < cath; c++) {
        const cx = rng() * w;
        const cy = rng() * h;
        const rings = 4 + Math.floor(rng() * 4);
        const rx = vertical ? 12 + rng() * 16 : 60 + rng() * 70;
        const ry = vertical ? 60 + rng() * 70 : 12 + rng() * 16;
        for (let ring = 1; ring <= rings; ring++) {
          ctx.strokeStyle = WALNUT_GRAIN_DARK;
          ctx.globalAlpha = 0.04 + rng() * 0.04;
          ctx.lineWidth = 0.8 + rng() * 1.2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, ring * rx, ring * ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    },
    repeat ? { anisotropy: 8, repeat } : { anisotropy: 8 }
  );
}

function walnutBumpTexture(
  rng: () => number,
  repeat?: [number, number],
  vertical = true
): THREE.CanvasTexture {
  const W = vertical ? 512 : 1024;
  const H = vertical ? 1024 : 512;
  return makeCanvasTexture(
    W,
    H,
    (ctx, w, h) => {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);

      // Grain grooves as fine dark/light ridges along the grain axis.
      const lineCount = vertical ? 260 : 240;
      for (let i = 0; i < lineCount; i++) {
        const across = rng() * (vertical ? w : h);
        const amp = 0.6 + rng() * 2.2;
        const freq = 0.004 + rng() * 0.012;
        const phase = rng() * Math.PI * 2;
        const lift = rng() < 0.5 ? 40 : 210;
        ctx.strokeStyle = `rgba(${lift},${lift},${lift},${0.06 + rng() * 0.08})`;
        ctx.lineWidth = 0.5 + rng() * 1.2;
        ctx.beginPath();
        if (vertical) {
          for (let y = 0; y <= h; y += 12) {
            const x = across + Math.sin(y * freq + phase) * amp;
            if (y === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        } else {
          for (let x = 0; x <= w; x += 12) {
            const y = across + Math.sin(x * freq + phase) * amp;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      // Fine pore speckle.
      for (let i = 0; i < 2600; i++) {
        const t = rng() < 0.5 ? 50 : 205;
        ctx.fillStyle = `rgba(${t},${t},${t},${0.03 + rng() * 0.04})`;
        ctx.fillRect(rng() * w, rng() * h, 1 + rng(), 1 + rng() * 1.5);
      }
    },
    repeat ? { srgb: false, anisotropy: 8, repeat } : { srgb: false, anisotropy: 8 }
  );
}

// ---------------------------------------------------------------------------
// Floor: the whole board lay painted into one canvas — staggered end joints,
// per-board tone shifts, wavy grain, cathedrals and the odd knot, matching
// Room.tsx's oak tones at 480 px/m. Doubles as its own bump map.

function floorBoardsTexture(rng: () => number): THREE.CanvasTexture {
  const PX = 480; // canvas pixels per world meter (both axes)
  return makeCanvasTexture(
    Math.round(FLOOR_W * PX), // 2016
    Math.round(FLOOR_D * PX), // 1536
    (ctx, w, h) => {
      // Gap/shadow color showing between boards.
      ctx.fillStyle = "#1d140c";
      ctx.fillRect(0, 0, w, h);

      const rowH = 0.14 * PX; // 0.14m planks, as laid in Room.tsx
      let y = 0;
      while (y < h - 2) {
        const rh = Math.min(rowH, h - y);
        let x = 0;
        let first = true;
        while (x < w - 2) {
          const remaining = (w - x) / PX;
          let len: number;
          if (remaining <= 2.0) {
            len = remaining;
          } else {
            // Cut starter board staggers the joints row to row.
            len = first ? 0.5 + rng() * 1.5 : 1.2 + rng() * 0.8;
          }
          first = false;
          const bw = len * PX;

          const [base, dark, light] =
            OAK_TONES[Math.floor(rng() * OAK_TONES.length)];
          const bx = x + 1.5;
          const by = y + 1.5;
          const bwi = bw - 3;
          const bhi = rh - 3;

          ctx.save();
          ctx.beginPath();
          ctx.rect(bx, by, bwi, bhi);
          ctx.clip();

          ctx.fillStyle = base;
          ctx.fillRect(bx, by, bwi, bhi);

          // Per-board tone shift — sun-bleached or replacement-dark.
          const lighter = rng() < 0.55;
          ctx.fillStyle = rgba(
            lighter ? "#f4e2c2" : "#241808",
            0.04 + rng() * 0.1
          );
          ctx.fillRect(bx, by, bwi, bhi);

          // Long wavy grain running with the board.
          const lines = Math.round(len * 22);
          for (let i = 0; i < lines; i++) {
            const ly = by + rng() * bhi;
            const amp = 0.8 + rng() * 2.6;
            const phase = rng() * Math.PI * 2;
            const freq = 0.004 + rng() * 0.01;
            ctx.strokeStyle = rng() < 0.62 ? dark : light;
            ctx.globalAlpha = 0.05 + rng() * 0.09;
            ctx.lineWidth = 0.6 + rng() * 1.8;
            ctx.beginPath();
            for (let lx = bx; lx <= bx + bwi; lx += 14) {
              const yy = ly + Math.sin(lx * freq + phase) * amp;
              if (lx === bx) ctx.moveTo(lx, yy);
              else ctx.lineTo(lx, yy);
            }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;

          // Cathedral figure — flat-sawn oak's signature.
          if (rng() < 0.4) {
            const cx = bx + rng() * bwi;
            const cy = by + rng() * bhi;
            const rings = 3 + Math.floor(rng() * 4);
            const rx = 40 + rng() * 46;
            const ry = 3.5 + rng() * 4;
            for (let ring = 1; ring <= rings; ring++) {
              ctx.strokeStyle = dark;
              ctx.globalAlpha = 0.045 + rng() * 0.05;
              ctx.lineWidth = 1 + rng() * 1.4;
              ctx.beginPath();
              ctx.ellipse(cx, cy, ring * rx, ring * ry, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.globalAlpha = 1;
          }

          // The occasional knot.
          if (rng() < 0.15) {
            const cx = bx + rng() * bwi;
            const cy = by + rng() * bhi;
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = dark;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 6 + rng() * 5, 4 + rng() * 3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }

          ctx.restore();
          x += bw;
        }
        y += rowH;
      }
    },
    { anisotropy: 8 }
  );
}

// ---------------------------------------------------------------------------
// The night view — what the back-wall window looks out on. One painted,
// emissive 2048px canvas: a nighttime city rooftop scene. It is ALWAYS night,
// so there is only this one backdrop. All randomness is seeded (the caller
// passes a fixed-seed rng) so every bake reproduces the same skyline.

// Deep blue-black sky, a large off-center moon up-left with a soft halo and
// crater shading, scattered stars, a couple of moonlit cloud wisps, a band of
// mid-distance buildings with sparse warm-lit windows, near rooftop
// silhouettes (chimneys, a water tower) and a faint warm horizon glow.
function nightBackdropTexture(rng: () => number): THREE.CanvasTexture {
  return makeCanvasTexture(
    2048,
    2048,
    (ctx, w, h) => {
      // --- Sky: deep blue-black, darker at the top -----------------------
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#03050d");
      sky.addColorStop(0.45, "#070b1a");
      sky.addColorStop(0.72, "#0d1228");
      sky.addColorStop(0.9, "#141a30");
      sky.addColorStop(1, "#1a1c30");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // --- Faint warm distant-skyline glow near the horizon line ---------
      const horizonY = h * 0.62;
      const hglow = ctx.createLinearGradient(0, horizonY - h * 0.14, 0, horizonY + h * 0.05);
      hglow.addColorStop(0, "rgba(120,96,70,0)");
      hglow.addColorStop(0.7, "rgba(150,112,72,0.14)");
      hglow.addColorStop(1, "rgba(176,128,80,0.22)");
      ctx.fillStyle = hglow;
      ctx.fillRect(0, horizonY - h * 0.14, w, h * 0.19);

      // --- Stars: a fine scatter across the upper sky --------------------
      for (let i = 0; i < 240; i++) {
        const sx = rng() * w;
        const sy = rng() * horizonY * 0.92;
        const a = 0.1 + rng() * 0.5;
        const s = 0.8 + rng() * 1.8;
        ctx.fillStyle = `rgba(${214 + Math.floor(rng() * 30)},${224 + Math.floor(rng() * 20)},255,${a})`;
        ctx.fillRect(sx, sy, s, s);
        // a few brighter stars get a faint cross-glint
        if (rng() < 0.06) {
          ctx.strokeStyle = `rgba(225,232,255,${a * 0.6})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(sx - 4, sy + 0.5);
          ctx.lineTo(sx + 5, sy + 0.5);
          ctx.moveTo(sx + 0.5, sy - 4);
          ctx.lineTo(sx + 0.5, sy + 5);
          ctx.stroke();
        }
      }

      // --- The moon: large, upper third, off-center toward the LEFT -----
      const moonX = w * 0.3;
      const moonY = h * 0.22;
      const moonR = w * 0.082;

      // Soft outer halo.
      const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.7, moonX, moonY, moonR * 3.4);
      halo.addColorStop(0, "rgba(206,216,236,0.22)");
      halo.addColorStop(0.4, "rgba(170,184,214,0.08)");
      halo.addColorStop(1, "rgba(150,168,210,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(moonX - moonR * 3.4, moonY - moonR * 3.4, moonR * 6.8, moonR * 6.8);

      // Moon disc with a gentle terminator shade (lit from upper-left).
      const disc = ctx.createRadialGradient(
        moonX - moonR * 0.32,
        moonY - moonR * 0.32,
        moonR * 0.2,
        moonX,
        moonY,
        moonR
      );
      disc.addColorStop(0, "#f3f0e6");
      disc.addColorStop(0.7, "#dfe0da");
      disc.addColorStop(1, "#bcc1c4");
      ctx.save();
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = disc;
      ctx.fillRect(moonX - moonR, moonY - moonR, moonR * 2, moonR * 2);

      // Subtle craters: soft grey discs with a faint rim highlight.
      for (let i = 0; i < 16; i++) {
        const ang = rng() * Math.PI * 2;
        const rad = rng() * moonR * 0.82;
        const cx = moonX + Math.cos(ang) * rad;
        const cy = moonY + Math.sin(ang) * rad;
        const cr = moonR * (0.04 + rng() * 0.12);
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
        cg.addColorStop(0, "rgba(150,152,150,0.28)");
        cg.addColorStop(0.7, "rgba(168,170,168,0.12)");
        cg.addColorStop(1, "rgba(180,182,180,0)");
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
        // thin lit rim on the upper-left edge
        ctx.strokeStyle = "rgba(246,244,236,0.18)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(cx, cy, cr * 0.92, Math.PI * 0.9, Math.PI * 1.6);
        ctx.stroke();
      }
      ctx.restore();

      // --- Moonlit cloud wisps: one or two thin, stretched bands ---------
      for (let i = 0; i < 2; i++) {
        const cy = moonY + moonR * (1.6 + i * 1.7) + rng() * 40;
        const cx = w * (0.22 + i * 0.18) + rng() * 60;
        const cw = w * (0.22 + rng() * 0.16);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, 0.22);
        const wisp = ctx.createRadialGradient(0, 0, 0, 0, 0, cw);
        wisp.addColorStop(0, "rgba(180,190,212,0.12)");
        wisp.addColorStop(0.5, "rgba(150,162,190,0.06)");
        wisp.addColorStop(1, "rgba(140,152,182,0)");
        ctx.fillStyle = wisp;
        ctx.fillRect(-cw, -cw, cw * 2, cw * 2);
        ctx.restore();
      }

      // --- Mid-distance band of building silhouettes ---------------------
      type Building = { x: number; w: number; top: number };
      const buildings: Building[] = [];
      let mx = -40 + rng() * 50;
      while (mx < w) {
        const bw = 130 + rng() * 240;
        const top = horizonY - (40 + rng() * 360);
        buildings.push({ x: mx, w: bw, top });
        mx += bw + (rng() < 0.4 ? 14 + rng() * 70 : 0);
      }
      ctx.fillStyle = "#060912";
      for (const b of buildings) {
        ctx.fillRect(b.x, b.top, b.w, horizonY - b.top + 4);
        // rooftop stair bulkhead
        if (rng() < 0.75) {
          ctx.fillRect(
            b.x + b.w * (0.12 + rng() * 0.55),
            b.top - 20 - rng() * 16,
            34 + rng() * 44,
            42
          );
        }
        // thin antenna
        if (rng() < 0.5) {
          ctx.fillRect(b.x + b.w * (0.2 + rng() * 0.6), b.top - 70 - rng() * 40, 3, 90);
        }
      }

      // --- Sparse, irregular warm-lit windows on the mid buildings -------
      const warm = ["#ffce8a", "#ffb95f", "#f7dcae", "#e09a48", "#ffd9a0"];
      const cool = ["#cfe2ff", "#dfe9f6"];
      for (const b of buildings) {
        const colStep = 26 + rng() * 8;
        const rowStep = 34 + rng() * 10;
        for (let wy = b.top + 22; wy < horizonY - 14; wy += rowStep) {
          for (let wx = b.x + 14; wx < b.x + b.w - 22; wx += colStep) {
            if (rng() >= 0.085) continue;
            const isCool = rng() < 0.14;
            const color = isCool
              ? cool[Math.floor(rng() * cool.length)]
              : warm[Math.floor(rng() * warm.length)];
            const ww = 8 + rng() * 6;
            const wh = 11 + rng() * 7;
            ctx.globalAlpha = 0.45 + rng() * 0.5;
            ctx.fillStyle = color as string;
            ctx.fillRect(wx, wy, ww, wh);
            if (!isCool && rng() < 0.16) {
              const glow = ctx.createRadialGradient(
                wx + ww / 2,
                wy + wh / 2,
                0,
                wx + ww / 2,
                wy + wh / 2,
                30
              );
              glow.addColorStop(0, rgba(color as string, 0.2));
              glow.addColorStop(1, rgba(color as string, 0));
              ctx.fillStyle = glow;
              ctx.fillRect(wx - 26, wy - 22, 64, 64);
            }
          }
        }
      }
      ctx.globalAlpha = 1;

      // --- Near rooftop silhouettes along the bottom ---------------------
      // A solid near roofline rising into the lower third, near-black.
      ctx.fillStyle = "#02040a";
      const roofTop = h * (0.82 + rng() * 0.02);
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, roofTop);
      let rx = 0;
      while (rx < w) {
        const step = 120 + rng() * 200;
        const dy = (rng() - 0.5) * 60;
        ctx.lineTo(Math.min(rx + step, w), roofTop + dy);
        rx += step;
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      // Chimneys along the near roofline.
      for (let i = 0; i < 5; i++) {
        const cx = w * (0.08 + i * 0.2) + rng() * 60;
        const cwd = 34 + rng() * 30;
        const ch = 50 + rng() * 60;
        ctx.fillStyle = "#02040a";
        ctx.fillRect(cx, roofTop - ch, cwd, ch + 40);
        // a faint warm chimney-top ember on one or two
        if (rng() < 0.3) {
          ctx.fillStyle = "rgba(200,120,70,0.35)";
          ctx.fillRect(cx + 4, roofTop - ch - 4, cwd - 8, 5);
        }
      }

      // One near water tower silhouette, slightly right of center.
      const tx = w * 0.66;
      const tBase = roofTop - 8;
      ctx.fillStyle = "#02040a";
      ctx.fillRect(tx - 6, tBase - 70, 8, 74); // legs
      ctx.fillRect(tx + 64, tBase - 70, 8, 74);
      ctx.fillRect(tx + 24, tBase - 70, 8, 74);
      ctx.fillRect(tx - 14, tBase - 132, 92, 70); // tank
      ctx.beginPath(); // conical cap
      ctx.moveTo(tx - 20, tBase - 132);
      ctx.lineTo(tx + 32, tBase - 176);
      ctx.lineTo(tx + 84, tBase - 132);
      ctx.closePath();
      ctx.fill();
    },
    { anisotropy: 8 }
  );
}

// Terracotta for the windowsill pot — throwing rings + fired blotches.
// (Cribbed from FloorBookcase.tsx's terracottaTexture.)
function terracottaTexture(rng: () => number): THREE.CanvasTexture {
  return makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#9c5236";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) {
        ctx.globalAlpha = 0.05 + rng() * 0.06;
        ctx.fillStyle = rng() > 0.5 ? "#7e3f28" : "#b06a48";
        ctx.fillRect(0, y, w, 1.5);
      }
      for (let i = 0; i < 40; i++) {
        ctx.globalAlpha = 0.04 + rng() * 0.05;
        ctx.fillStyle = rng() > 0.5 ? "#86452c" : "#ad6543";
        ctx.beginPath();
        ctx.ellipse(rng() * w, rng() * h, 8 + rng() * 22, 5 + rng() * 12, rng() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    { repeat: [1, 1], anisotropy: 4 }
  );
}

// ---------------------------------------------------------------------------
// Trim profiles, lifted from Room.tsx so the corner reads as the same house.
// Shape space: x = depth off the wall, y = up; extruded along z, then yawed
// into place (the yaw decides which wall the run hugs).

function baseboardShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.013, 0);
  s.lineTo(0.013, 0.092);
  s.quadraticCurveTo(0.013, 0.103, 0.002, 0.105);
  s.lineTo(0, 0.105);
  s.closePath();
  return s;
}

function shoeShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.011, 0);
  s.absarc(0, 0, 0.011, 0, Math.PI / 2, false);
  s.closePath();
  return s;
}

function trimRun(
  shape: THREE.Shape,
  length: number,
  yaw: number,
  position: [number, number, number]
): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: false,
    curveSegments: 8,
    steps: 1
  });
  geometry.rotateY(yaw);
  geometry.translate(position[0], position[1], position[2]);
  return geometry;
}

// ---------------------------------------------------------------------------
// Raised-panel wainscoting builders. A wall is described by a `place` function
// mapping panel-space (u = horizontal along the wall, v = height above floor,
// depthProud = how far the piece stands off the base wall toward the room)
// onto a world-space, axis-aligned box. This lets the same panel logic dress
// either wall — the back wall (members along X, depth along Z) or the side
// wall (members along Z, depth along X) — without duplicating geometry math.
type WallPlace = (
  uCenter: number,
  vCenter: number,
  uSize: number,
  vSize: number,
  depthProud: number
) => THREE.BufferGeometry;

// A single raised panel: a thin field plate proud of the wall, ringed by a
// chamfered bevel that ramps down to the surrounding frame. Modeled as a small
// stack of concentric plates (field plateau + four ramped bevel strips) so the
// relief catches the raking window light. All pushed onto `field`.
function pushRaisedPanel(
  field: THREE.BufferGeometry[],
  place: WallPlace,
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number
): void {
  const uc = (uMin + uMax) / 2;
  const vc = (vMin + vMax) / 2;
  const uw = uMax - uMin;
  const vh = vMax - vMin;
  if (uw <= FIELD_BEVEL * 2 || vh <= FIELD_BEVEL * 2) return;

  // Inner flat field plateau (raised the full FIELD_RELIEF above the frame).
  const fieldUW = uw - FIELD_BEVEL * 2;
  const fieldVH = vh - FIELD_BEVEL * 2;
  field.push(place(uc, vc, fieldUW, fieldVH, FRAME_RELIEF + FIELD_RELIEF));

  // Four bevel strips ramping from the field plateau down to the frame plane.
  // Approximated as thin plates at the mid-relief so the chamfer reads without
  // a custom lathe — cheap, export-clean boxes.
  const midProud = FRAME_RELIEF + FIELD_RELIEF / 2;
  // left & right vertical bevels
  field.push(
    place(uMin + FIELD_BEVEL / 2, vc, FIELD_BEVEL, vh - FIELD_BEVEL * 2, midProud),
    place(uMax - FIELD_BEVEL / 2, vc, FIELD_BEVEL, vh - FIELD_BEVEL * 2, midProud)
  );
  // top & bottom horizontal bevels (full width incl. corners)
  field.push(
    place(uc, vMin + FIELD_BEVEL / 2, uw, FIELD_BEVEL, midProud),
    place(uc, vMax - FIELD_BEVEL / 2, uw, FIELD_BEVEL, midProud)
  );
}

// A rectangular run of raised panels inside [uMin,uMax] x [vMin,vMax], framed
// by stiles/rails of PANEL_FRAME_W. The continuous frame face plate goes onto
// `frame` (its own darker material); the raised panel fields go onto `field`
// (the lighter, satin walnut) so the two planes read as distinct woods under
// raking light. Splits the run into `cols` x `rows` evenly spaced fields.
function pushPanelRun(
  frame: THREE.BufferGeometry[],
  field: THREE.BufferGeometry[],
  place: WallPlace,
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number,
  cols: number,
  rows: number
): void {
  const uc = (uMin + uMax) / 2;
  const vc = (vMin + vMax) / 2;
  const runUW = uMax - uMin;
  const runVH = vMax - vMin;
  if (runUW <= PANEL_FRAME_W * 2 || runVH <= PANEL_FRAME_W * 2) return;

  // The frame is one continuous proud face plate spanning the whole run; the
  // raised panels then sit on top of it inside their cells. (Cheaper and
  // crisper than building each stile/rail separately, and reads identically.)
  frame.push(place(uc, vc, runUW, runVH, FRAME_RELIEF));

  // Cell sizing: subtract framing from the run, divide the remainder.
  const innerU = runUW - PANEL_FRAME_W * (cols + 1);
  const innerV = runVH - PANEL_FRAME_W * (rows + 1);
  if (innerU <= 0 || innerV <= 0) return;
  const cellU = innerU / cols;
  const cellV = innerV / rows;

  for (let c = 0; c < cols; c++) {
    const cuMin = uMin + PANEL_FRAME_W * (c + 1) + cellU * c;
    const cuMax = cuMin + cellU;
    for (let r = 0; r < rows; r++) {
      const cvMin = vMin + PANEL_FRAME_W * (r + 1) + cellV * r;
      const cvMax = cvMin + cellV;
      pushRaisedPanel(field, place, cuMin, cuMax, cvMin, cvMax);
    }
  }
}

// Sash builder for the BACK-wall window: the sash lies in the X-Y plane,
// with its members thin along Z (depth into the wall). Two stiles, two rails,
// and a 2x2 muntin cross. NO glass — the panes are empty air on purpose.
function pushSash(
  parts: THREE.BufferGeometry[],
  yMin: number,
  yMax: number,
  zCenter: number,
  bottomRail: number,
  topRail: number
): void {
  const xMin = WIN_X_MIN + JAMB; // clear opening between the jambs
  const xMax = WIN_X_MAX - JAMB;
  const innerW = xMax - xMin - STILE_W * 2;
  const xMid = (xMin + xMax) / 2;
  const yMid = (yMin + yMax) / 2;

  parts.push(
    box(STILE_W, yMax - yMin, SASH_D, xMin + STILE_W / 2, yMid, zCenter),
    box(STILE_W, yMax - yMin, SASH_D, xMax - STILE_W / 2, yMid, zCenter),
    box(innerW, bottomRail, SASH_D, xMid, yMin + bottomRail / 2, zCenter),
    box(innerW, topRail, SASH_D, xMid, yMax - topRail / 2, zCenter)
  );

  // Muntin cross splitting the glazing into 2x2 panes.
  const gMin = yMin + bottomRail;
  const gMax = yMax - topRail;
  const gMid = (gMin + gMax) / 2;
  parts.push(
    box(MUNTIN_W, gMax - gMin, MUNTIN_D, xMid, gMid, zCenter),
    box(innerW, MUNTIN_W, MUNTIN_D, xMid, gMid, zCenter)
  );
}

export default function RoomWindow() {
  const built = useMemo(() => {
    const rng = mulberry32(0xc0_ffee);

    // --- Surfaces -------------------------------------------------------
    // The walls are now DARK WALNUT PANELING (a lawyer's study), so the base
    // wall surface wears the walnut canvas — straight vertical grain — rather
    // than plaster. The ceiling stays plaster (a touch warmer off-white).

    // The BACK wall is extruded (real thickness for the window reveal), and
    // ExtrudeGeometry UVs come out in shape units — meters — so the walnut
    // canvas is repeat-scaled to span the wall exactly once. Grain runs up.
    const backRepeat: [number, number] = [1 / FLOOR_W, 1 / WALL_HEIGHT];
    const backWallMaterial = new THREE.MeshStandardMaterial({
      map: walnutColorTexture(rng, WALNUT_FIELD, backRepeat, true),
      bumpMap: walnutBumpTexture(rng, backRepeat, true),
      bumpScale: 0.0016,
      color: "#ffffff",
      roughness: 0.62,
      metalness: 0,
      envMapIntensity: 0.45
    });

    // The right side wall is a flat plane (windowless), UVs already 0..1, so
    // no repeat scaling — same dark walnut, vertical grain.
    const sideWallMaterial = new THREE.MeshStandardMaterial({
      map: walnutColorTexture(rng, WALNUT_FIELD, undefined, true),
      bumpMap: walnutBumpTexture(rng, undefined, true),
      bumpScale: 0.0016,
      color: "#ffffff",
      roughness: 0.62,
      metalness: 0,
      envMapIntensity: 0.45
    });

    const ceilingMaterial = new THREE.MeshStandardMaterial({
      map: plasterColorTexture(rng, "#dccfb6", [
        "#e5d6bb",
        "#d0c3ab",
        "#dfcca9",
        "#d6c9b4"
      ]),
      bumpMap: plasterBumpTexture(rng),
      bumpScale: 0.001,
      color: "#f3ece0",
      roughness: 0.97,
      metalness: 0,
      envMapIntensity: 0.5
    });

    const boards = floorBoardsTexture(rng);
    const floorMaterial = new THREE.MeshStandardMaterial({
      map: boards,
      bumpMap: boards,
      bumpScale: 0.0008,
      roughness: 0.52,
      metalness: 0,
      envMapIntensity: 0.65
    });

    // Painted trim: the same satin enamel as Room.tsx — the WINDOW casing
    // stays warm painted wood so it pops against the dark paneling.
    const trimMaterial = lacquerMaterial("#e7dabd", {
      clearcoat: 0.35,
      clearcoatRoughness: 0.45,
      roughness: 0.5
    });
    trimMaterial.envMapIntensity = 0.7;

    // Walnut paneling materials. The PANEL FIELDS carry the walnut canvas with
    // a faint satin sheen (a lawyer's-study polish), tinted a hair lighter so
    // the raised plateau reads bright against the recessed frame. The FRAME
    // (the proud stile/rail grid behind the panels) is a flatter, darker
    // walnut. Distinct tone + sheen keep the relief reading under raking light.
    const panelRepeat: [number, number] = [0.45, 0.9];
    const panelMaterial = new THREE.MeshPhysicalMaterial({
      map: walnutColorTexture(rng, WALNUT_FIELD, panelRepeat, true),
      bumpMap: walnutBumpTexture(rng, panelRepeat, true),
      bumpScale: 0.0016,
      color: "#f0f0f0",
      roughness: 0.46,
      metalness: 0,
      clearcoat: 0.4,
      clearcoatRoughness: 0.36
    });
    panelMaterial.envMapIntensity = 0.55;

    const panelFrameMaterial = new THREE.MeshPhysicalMaterial({
      map: walnutColorTexture(rng, WALNUT_FRAME, panelRepeat, true),
      bumpMap: walnutBumpTexture(rng, panelRepeat, true),
      bumpScale: 0.0016,
      color: "#cfcfcf",
      roughness: 0.58,
      metalness: 0,
      clearcoat: 0.28,
      clearcoatRoughness: 0.46
    });
    panelFrameMaterial.envMapIntensity = 0.42;

    // Chair rail + baseboard molding: flat dark walnut, a hair warmer than the
    // field, glossier so the molding profile reads.
    const moldingMaterial = new THREE.MeshPhysicalMaterial({
      map: walnutColorTexture(rng, WALNUT_RAIL, [2, 0.5], false),
      bumpMap: walnutBumpTexture(rng, [2, 0.5], false),
      bumpScale: 0.0014,
      color: "#ededed",
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.32
    });
    moldingMaterial.envMapIntensity = 0.6;

    // Terracotta + foliage for the windowsill succulent (cribbed from
    // FloorBookcase.tsx's bottom-shelf plant).
    const potMaterial = new THREE.MeshStandardMaterial({
      map: terracottaTexture(rng),
      roughness: 0.88,
      metalness: 0,
      envMapIntensity: 0.4
    });
    const plantMaterial = new THREE.MeshStandardMaterial({
      color: "#5f7c4b",
      roughness: 0.62,
      metalness: 0,
      envMapIntensity: 0.6
    });

    // --- Back wall with the window punched through -----------------------
    // Shape plane: localX = world x, localY = height above the floor;
    // extruded along +z by WALL_THICKNESS, then slid so the wall straddles
    // BACK_WALL_Z (outer face at BACK_WALL_OUTER_Z, inner at the room side).
    const wallShape = new THREE.Shape();
    wallShape.moveTo(FLOOR_X_MIN, 0);
    wallShape.lineTo(FLOOR_X_MAX, 0);
    wallShape.lineTo(FLOOR_X_MAX, WALL_HEIGHT);
    wallShape.lineTo(FLOOR_X_MIN, WALL_HEIGHT);
    wallShape.closePath();

    const opening = new THREE.Path();
    opening.moveTo(WIN_X_MIN, WIN_SILL);
    opening.lineTo(WIN_X_MAX, WIN_SILL);
    opening.lineTo(WIN_X_MAX, WIN_SILL + WIN_H);
    opening.lineTo(WIN_X_MIN, WIN_SILL + WIN_H);
    opening.closePath();
    wallShape.holes.push(opening);

    const backWallGeometry = new THREE.ExtrudeGeometry(wallShape, {
      depth: WALL_THICKNESS,
      bevelEnabled: false,
      steps: 1
    });
    // localY (shape) is height above the floor → lift to FLOOR_Y; extrusion
    // runs world +z from the wall's outer face.
    backWallGeometry.translate(0, FLOOR_Y, BACK_WALL_OUTER_Z);
    backWallGeometry.name = "winWallBackGeometry";

    // --- Window frame: jambs, sill shelf, casing, two sashes — one mesh ---
    // The window now lies in the X-Y plane of the back wall; depth runs along
    // z. Center of the wall thickness is BACK_WALL_Z.
    const frameParts: THREE.BufferGeometry[] = [];
    const jambZ = BACK_WALL_Z; // jamb lining centered in the wall thickness
    const winXMid = WIN_X_CENTER;
    const winYMid = (WIN_Y_MIN + WIN_Y_MAX) / 2;

    // Jamb lining (sides + head), slightly proud of the plaster on each face.
    frameParts.push(
      box(JAMB, WIN_H, JAMB_DEPTH, WIN_X_MIN + JAMB / 2, winYMid, jambZ),
      box(JAMB, WIN_H, JAMB_DEPTH, WIN_X_MAX - JAMB / 2, winYMid, jambZ),
      box(WIN_W - JAMB * 2, JAMB, JAMB_DEPTH, winXMid, WIN_Y_MAX - JAMB / 2, jambZ)
    );

    // Interior sill SHELF: a real board nosing SILL_DEPTH into the room, its
    // top surface at SILL_TOP_Y (the plant stands on it), plus the apron
    // beneath. The shelf front edge sits at z = BACK_WALL_INNER_Z + SILL_DEPTH.
    const sillZ = BACK_WALL_INNER_Z + SILL_DEPTH / 2 - 0.01; // tuck 1cm into the reveal
    frameParts.push(
      box(WIN_W + 0.11, SILL_THICK, SILL_DEPTH, winXMid, SILL_TOP_Y - SILL_THICK / 2, sillZ),
      box(WIN_W + 0.03, 0.07, 0.018, winXMid, WIN_Y_MIN - 0.07, BACK_WALL_INNER_Z + 0.009)
    );

    // Interior casing on the room face: two legs and a head board, standing
    // just proud of the inner plaster.
    const casingZ = BACK_WALL_INNER_Z + 0.009;
    frameParts.push(
      box(0.07, WIN_H, 0.018, WIN_X_MIN - 0.035, winYMid, casingZ),
      box(0.07, WIN_H, 0.018, WIN_X_MAX + 0.035, winYMid, casingZ),
      box(WIN_W + 0.18, 0.07, 0.018, winXMid, WIN_Y_MAX + 0.035, casingZ)
    );

    // Double-hung sashes: lower rides the inner (room-side) track, upper the
    // outer, meeting rails overlap 2.5cm at mid-height. 2x2 panes each, empty.
    const meetY = winYMid;
    pushSash(frameParts, WIN_Y_MIN, meetY + 0.0125, BACK_WALL_INNER_Z - 0.02, 0.055, 0.035);
    pushSash(
      frameParts,
      meetY - 0.0125,
      WIN_Y_MAX - JAMB,
      BACK_WALL_OUTER_Z + 0.02,
      0.035,
      0.045
    );

    const frameGeometry = merge(frameParts);
    frameGeometry.name = "winWindowFrameGeometry";

    // --- Windowsill succulent: terracotta pot + a small rosette ----------
    // Sits ON the sill shelf at its LEFT end (world x ~ -0.25). Pot profile
    // and rosette cribbed from FloorBookcase.tsx (scaled to taste).
    const SILL_POT_X = -0.25;
    const SILL_POT_Z = sillZ; // centered on the shelf depth
    const potProfile = [
      new THREE.Vector2(0.004, 0),
      new THREE.Vector2(0.024, 0),
      new THREE.Vector2(0.026, 0.003),
      new THREE.Vector2(0.0335, 0.06),
      new THREE.Vector2(0.034, 0.061),
      new THREE.Vector2(0.0375, 0.062),
      new THREE.Vector2(0.038, 0.064),
      new THREE.Vector2(0.038, 0.076),
      new THREE.Vector2(0.0375, 0.078),
      new THREE.Vector2(0.033, 0.078),
      new THREE.Vector2(0.0315, 0.072),
      new THREE.Vector2(0.0312, 0.066)
    ];
    const potGeometry = new THREE.LatheGeometry(potProfile, 28);
    potGeometry.translate(SILL_POT_X, SILL_TOP_Y, SILL_POT_Z);
    potGeometry.name = "sillPotGeometry";

    // Rosette: a soil cap + three whorls of flattened ellipsoid blades and a
    // center bud, all merged into one foliage mesh.
    const plantParts: THREE.BufferGeometry[] = [];
    const potRimY = SILL_TOP_Y + 0.066; // soil sits ~at the pot rim
    const soil = new THREE.CylinderGeometry(0.0315, 0.0315, 0.006, 20);
    soil.translate(SILL_POT_X, potRimY, SILL_POT_Z);
    plantParts.push(soil);

    const whorls = [
      { n: 6, tilt: 0.62, len: 0.042, phase: 0 },
      { n: 5, tilt: 0.4, len: 0.052, phase: 0.5 },
      { n: 4, tilt: 0.2, len: 0.06, phase: 1.0 }
    ];
    for (const ring of whorls) {
      for (let i = 0; i < ring.n; i++) {
        const angle = ring.phase + (i / ring.n) * Math.PI * 2 + rng() * 0.2;
        const leaf = new THREE.SphereGeometry(0.012, 8, 6);
        leaf.scale(0.45, ring.len / 0.024, 0.16);
        leaf.translate(0, ring.len / 2, 0);
        const lm = new THREE.Matrix4()
          .makeRotationY(angle)
          .multiply(new THREE.Matrix4().makeRotationX(ring.tilt + rng() * 0.1));
        lm.setPosition(SILL_POT_X, potRimY + 0.002, SILL_POT_Z);
        leaf.applyMatrix4(lm);
        plantParts.push(leaf);
      }
    }
    const bud = new THREE.SphereGeometry(0.009, 8, 6);
    bud.scale(1, 1.4, 1);
    bud.translate(SILL_POT_X, potRimY + 0.01, SILL_POT_Z);
    plantParts.push(bud);

    const plantGeometry = merge(plantParts);
    plantGeometry.name = "sillPlantGeometry";

    // --- Raised-panel wainscoting on both walls --------------------------
    // The base walls already wear the walnut canvas; on top of them sit
    // proud raised panels framed by stiles/rails, broken into a lower band
    // (baseboard -> chair rail) and an upper band (chair rail -> cornice),
    // arranged AROUND the window on the back wall.

    // Vertical band limits (heights above the floor).
    const LOWER_V_MIN = BASE_TOP_Y; // panels start atop the baseboard
    const LOWER_V_MAX = CHAIR_RAIL_Y - CHAIR_RAIL_H / 2; // up to the chair rail
    const UPPER_V_MIN = CHAIR_RAIL_Y + CHAIR_RAIL_H / 2; // above the chair rail
    const UPPER_V_MAX = CORNICE_Y; // up to the cornice

    // Back-wall placer: u -> world x, v -> height above floor, proud -> +z.
    const placeBack: WallPlace = (uc, vc, uSize, vSize, proud) =>
      box(
        uSize,
        vSize,
        proud,
        uc,
        FLOOR_Y + vc,
        BACK_WALL_INNER_Z + proud / 2
      );

    // Side-wall placer: u -> world z, v -> height above floor, proud -> -x.
    const placeSide: WallPlace = (uc, vc, uSize, vSize, proud) =>
      box(
        proud,
        vSize,
        uSize,
        SIDE_WALL_X - proud / 2,
        FLOOR_Y + vc,
        uc
      );

    // Left-wall placer: u -> world z, v -> height above floor, proud -> +x.
    const placeLeft: WallPlace = (uc, vc, uSize, vSize, proud) =>
      box(
        proud,
        vSize,
        uSize,
        FLOOR_X_MIN + proud / 2,
        FLOOR_Y + vc,
        uc
      );

    // Frame plates (darker walnut) and raised fields (lighter satin) collect
    // into separate lists → two materials, two meshes.
    const panelFrameParts: THREE.BufferGeometry[] = [];
    const fieldParts: THREE.BufferGeometry[] = [];

    // Window clearances so the paneling never collides with the casing.
    const WIN_MARGIN_X = 0.085;
    const WIN_MARGIN_Y = 0.1;
    const winLeftEdge = WIN_X_MIN - WIN_MARGIN_X; // -0.51
    const winRightEdge = WIN_X_MAX + WIN_MARGIN_X; // 0.51
    const winTopEdge = WIN_Y_MAX - FLOOR_Y + WIN_MARGIN_Y; // above-floor height
    const winBotEdge = WIN_Y_MIN - FLOOR_Y - WIN_MARGIN_Y; // above-floor height

    // LEFT section: full-height run from the left corner to the window.
    pushPanelRun(panelFrameParts, fieldParts, placeBack, FLOOR_X_MIN + 0.02, winLeftEdge, LOWER_V_MIN, LOWER_V_MAX, 3, 1);
    pushPanelRun(panelFrameParts, fieldParts, placeBack, FLOOR_X_MIN + 0.02, winLeftEdge, UPPER_V_MIN, UPPER_V_MAX, 3, 1);

    // RIGHT section: full-height run from the window to the side corner.
    pushPanelRun(panelFrameParts, fieldParts, placeBack, winRightEdge, FLOOR_X_MAX - 0.02, LOWER_V_MIN, LOWER_V_MAX, 1, 1);
    pushPanelRun(panelFrameParts, fieldParts, placeBack, winRightEdge, FLOOR_X_MAX - 0.02, UPPER_V_MIN, UPPER_V_MAX, 1, 1);

    // BELOW the window: a single panel from the baseboard up to the sill.
    pushPanelRun(panelFrameParts, fieldParts, placeBack, winLeftEdge, winRightEdge, LOWER_V_MIN, winBotEdge, 1, 1);

    // ABOVE the window: a short run from the window head to the cornice.
    pushPanelRun(panelFrameParts, fieldParts, placeBack, winLeftEdge, winRightEdge, winTopEdge, UPPER_V_MAX, 1, 1);

    // SIDE wall: a regular run of tall panels, both bands, full depth.
    pushPanelRun(panelFrameParts, fieldParts, placeSide, FLOOR_Z_MIN + 0.02, FLOOR_Z_MAX - 0.02, LOWER_V_MIN, LOWER_V_MAX, 4, 1);
    pushPanelRun(panelFrameParts, fieldParts, placeSide, FLOOR_Z_MIN + 0.02, FLOOR_Z_MAX - 0.02, UPPER_V_MIN, UPPER_V_MAX, 4, 1);

    // LEFT wall: a matching run of tall panels, both bands, full depth.
    pushPanelRun(panelFrameParts, fieldParts, placeLeft, FLOOR_Z_MIN + 0.02, FLOOR_Z_MAX - 0.02, LOWER_V_MIN, LOWER_V_MAX, 4, 1);
    pushPanelRun(panelFrameParts, fieldParts, placeLeft, FLOOR_Z_MIN + 0.02, FLOOR_Z_MAX - 0.02, UPPER_V_MIN, UPPER_V_MAX, 4, 1);

    const panelFrameGeometry = merge(panelFrameParts);
    panelFrameGeometry.name = "winPanelFrameGeometry";
    const panelFieldGeometry = merge(fieldParts);
    panelFieldGeometry.name = "winPanelFieldGeometry";

    // --- Chair rail: a proud horizontal molding band ~0.92m up, both walls --
    // Runs the back wall (broken around the window casing) and the side wall.
    const railParts: THREE.BufferGeometry[] = [];
    const railProud = FRAME_RELIEF + CHAIR_RAIL_RELIEF;
    // back-wall left leg (corner to window)
    railParts.push(
      box(
        winLeftEdge - (FLOOR_X_MIN + 0.02),
        CHAIR_RAIL_H,
        railProud,
        (FLOOR_X_MIN + 0.02 + winLeftEdge) / 2,
        FLOOR_Y + CHAIR_RAIL_Y,
        BACK_WALL_INNER_Z + railProud / 2
      ),
      // back-wall right leg (window to corner)
      box(
        FLOOR_X_MAX - 0.02 - winRightEdge,
        CHAIR_RAIL_H,
        railProud,
        (winRightEdge + FLOOR_X_MAX - 0.02) / 2,
        FLOOR_Y + CHAIR_RAIL_Y,
        BACK_WALL_INNER_Z + railProud / 2
      ),
      // side-wall run
      box(
        railProud,
        CHAIR_RAIL_H,
        FLOOR_D - 0.04,
        SIDE_WALL_X - railProud / 2,
        FLOOR_Y + CHAIR_RAIL_Y,
        FLOOR_CZ
      ),
      // left-wall run
      box(
        railProud,
        CHAIR_RAIL_H,
        FLOOR_D - 0.04,
        FLOOR_X_MIN + railProud / 2,
        FLOOR_Y + CHAIR_RAIL_Y,
        FLOOR_CZ
      )
    );
    const chairRailGeometry = merge(railParts);
    chairRailGeometry.name = "winChairRailGeometry";

    // --- Baseboards + quarter-round shoes along both walls, one mesh -----
    // Back run hugs the back wall (yaw -90: depth -> +z, run -> -x) but breaks
    // around the window opening (the apron/casing handle that span), so it
    // splits into a left leg and a right leg. Stops 13mm shy of the corner so
    // it butts the side run instead of z-fighting.
    const baseGap = 0.05; // clearance each side of the opening for the casing
    const backLeftLen = WIN_X_MIN - baseGap - FLOOR_X_MIN; // -0.475 - (-2.7)
    const backRightLen = FLOOR_X_MAX - 0.013 - (WIN_X_MAX + baseGap); // to the corner
    const baseboardGeometry = merge([
      // back-wall left leg: from the left corner to the window's left jamb
      trimRun(baseboardShape(), backLeftLen, -Math.PI / 2, [
        WIN_X_MIN - baseGap,
        FLOOR_Y,
        BACK_WALL_INNER_Z
      ]),
      trimRun(shoeShape(), backLeftLen, -Math.PI / 2, [
        WIN_X_MIN - baseGap,
        FLOOR_Y,
        BACK_WALL_INNER_Z + 0.013
      ]),
      // back-wall right leg: from the window's right jamb to the corner
      trimRun(baseboardShape(), backRightLen, -Math.PI / 2, [
        FLOOR_X_MAX - 0.013,
        FLOOR_Y,
        BACK_WALL_INNER_Z
      ]),
      trimRun(shoeShape(), backRightLen, -Math.PI / 2, [
        FLOOR_X_MAX - 0.013,
        FLOOR_Y,
        BACK_WALL_INNER_Z + 0.013
      ]),
      // side run hugs the windowless side wall (yaw 180: depth -> -x, run -> -z)
      trimRun(baseboardShape(), FLOOR_D, Math.PI, [
        SIDE_WALL_X,
        FLOOR_Y,
        FLOOR_Z_MAX
      ]),
      trimRun(shoeShape(), FLOOR_D - 0.013, Math.PI, [
        SIDE_WALL_X - 0.013,
        FLOOR_Y,
        FLOOR_Z_MAX
      ]),
      // left run hugs the new left wall (yaw 0: depth -> +x, run -> +z)
      trimRun(baseboardShape(), FLOOR_D, 0, [
        FLOOR_X_MIN,
        FLOOR_Y,
        FLOOR_Z_MIN
      ]),
      trimRun(shoeShape(), FLOOR_D - 0.013, 0, [
        FLOOR_X_MIN + 0.013,
        FLOOR_Y,
        FLOOR_Z_MIN
      ])
    ]);
    baseboardGeometry.name = "winBaseboardsGeometry";

    // --- Backdrop: the single ALWAYS-NIGHT emissive canvas ---------------
    // Color is black so room light never grazes it; the canvas rides the
    // emissive slot and exports as a glTF emissiveTexture for Cycles. The
    // bake script keys on the mesh name "windowBackdropNight".
    const nightTexture = nightBackdropTexture(rng);
    const backdropNightMaterial = new THREE.MeshStandardMaterial({
      map: nightTexture,
      color: "#000000",
      emissive: "#ffffff",
      emissiveMap: nightTexture,
      emissiveIntensity: 1,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide
    });

    return {
      backWallMaterial,
      sideWallMaterial,
      ceilingMaterial,
      floorMaterial,
      trimMaterial,
      panelMaterial,
      panelFrameMaterial,
      moldingMaterial,
      potMaterial,
      plantMaterial,
      backWallGeometry,
      frameGeometry,
      panelFrameGeometry,
      panelFieldGeometry,
      chairRailGeometry,
      potGeometry,
      plantGeometry,
      baseboardGeometry,
      backdropNightMaterial
    };
  }, []);

  return (
    <group name="roomWindowConcept">
      {/* Floor: one big plane wearing the painted board lay. */}
      <mesh
        name="winFloor"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[FLOOR_CX, FLOOR_Y, FLOOR_CZ]}
        material={built.floorMaterial}
        receiveShadow
      >
        <planeGeometry args={[FLOOR_W, FLOOR_D]} />
      </mesh>

      {/* Back wall with the window punched through — real thickness so the
          opening has a reveal for light to wrap around. ~0.5m behind the
          desk's rear edge, window centered at x=0. */}
      <mesh
        name="winWallBack"
        geometry={built.backWallGeometry}
        material={built.backWallMaterial}
        castShadow
        receiveShadow
      />

      {/* Right side wall — dark walnut base surface (windowless), facing -x. */}
      <mesh
        name="winWallSide"
        position={[SIDE_WALL_X, FLOOR_Y + WALL_HEIGHT / 2, FLOOR_CZ]}
        rotation={[0, -Math.PI / 2, 0]}
        material={built.sideWallMaterial}
        receiveShadow
      >
        <planeGeometry args={[FLOOR_D, WALL_HEIGHT]} />
      </mesh>

      {/* Left side wall — encloses the room on the left, facing +x. */}
      <mesh
        name="winWallLeft"
        position={[FLOOR_X_MIN, FLOOR_Y + WALL_HEIGHT / 2, FLOOR_CZ]}
        rotation={[0, Math.PI / 2, 0]}
        material={built.sideWallMaterial}
        receiveShadow
      >
        <planeGeometry args={[FLOOR_D, WALL_HEIGHT]} />
      </mesh>

      {/* Raised-panel wainscoting on both walls, arranged around the window.
          Two meshes: the proud stile/rail FRAME grid (darker walnut) and the
          beveled raised panel FIELDS (lighter satin walnut). */}
      <mesh
        name="winPanelFrame"
        geometry={built.panelFrameGeometry}
        material={built.panelFrameMaterial}
        castShadow
        receiveShadow
      />
      <mesh
        name="winPanelFields"
        geometry={built.panelFieldGeometry}
        material={built.panelMaterial}
        castShadow
        receiveShadow
      />

      {/* Chair rail molding ~0.92m up, running both walls. */}
      <mesh
        name="winChairRail"
        geometry={built.chairRailGeometry}
        material={built.moldingMaterial}
        castShadow
        receiveShadow
      />

      {/* Ceiling plane so window light has something to bounce between. */}
      <mesh
        name="winCeiling"
        rotation={[Math.PI / 2, 0, 0]}
        position={[FLOOR_CX, FLOOR_Y + WALL_HEIGHT, FLOOR_CZ]}
        material={built.ceilingMaterial}
        receiveShadow
      >
        <planeGeometry args={[FLOOR_W, FLOOR_D]} />
      </mesh>

      {/* Double-hung sash window: jambs, sill shelf, casing, sashes, muntins. */}
      <mesh
        name="winWindowFrame"
        geometry={built.frameGeometry}
        material={built.trimMaterial}
        castShadow
        receiveShadow
      />

      {/* Windowsill succulent: terracotta pot + rosette, on the sill's left. */}
      <mesh
        name="sillPot"
        geometry={built.potGeometry}
        material={built.potMaterial}
        castShadow
        receiveShadow
      />
      <mesh
        name="sillPlant"
        geometry={built.plantGeometry}
        material={built.plantMaterial}
        castShadow
        receiveShadow
      />

      {/* Baseboard + quarter-round shoe — dark walnut to match the paneling. */}
      <mesh
        name="winBaseboards"
        geometry={built.baseboardGeometry}
        material={built.moldingMaterial}
        castShadow
        receiveShadow
      />

      {/* What's outside: it is ALWAYS night. One emissive city-rooftop canvas
          ~0.5m beyond the wall's outer face, facing +z back through the
          opening. The bake script keys on this exact mesh name. */}
      <mesh
        name="windowBackdropNight"
        position={[WIN_X_CENTER, BACKDROP_CY, BACKDROP_Z_NIGHT]}
        material={built.backdropNightMaterial}
      >
        <planeGeometry args={[BACKDROP_SIZE, BACKDROP_SIZE]} />
      </mesh>
    </group>
  );
}
