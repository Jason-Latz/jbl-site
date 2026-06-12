"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { mergeBufferGeometries } from "three-stdlib";
import { lacquerMaterial, makeCanvasTexture } from "@/lib/three/materials";
import { FLOOR_Y } from "../layout";

// Concept block-out B: "the corner window".
//
// A real corner of a warm room at night — back wall behind the desk with a
// double-hung sash window punched through it (centered over the desk's left
// half, near the lamp, square to the judging camera), and a windowless right
// side wall meeting it at x = +1.5. Mounted ONLY in the offline bake/export
// scene, never in the live site (yet).
//
// Export-safety: MeshStandard/MeshPhysical only, canvas textures only, no
// glass — the window openings are empty so path-traced light passes through
// unimpeded. The two backdrop planes outside the window are emissive canvases
// (windowBackdropNight / windowBackdropDay); the bake script toggles their
// visibility per theme.

// ---------------------------------------------------------------------------
// Room envelope. Desk top is y=0, floor at FLOOR_Y; desk rear edge sits at
// z = -0.425, so a wall at z = -0.9 is ~0.5m behind the desk.
const BACK_WALL_Z = -0.9;
const SIDE_WALL_X = 1.5;
const WALL_HEIGHT = 2.5;
const WALL_THICKNESS = 0.09;

// Floor: one textured plane (Room.tsx's per-plank lay is too heavy to
// duplicate here) — 4.2m wide x 3.2m deep, flush into the corner.
const FLOOR_X_MIN = -2.7;
const FLOOR_X_MAX = SIDE_WALL_X;
const FLOOR_Z_MIN = BACK_WALL_Z;
const FLOOR_Z_MAX = 2.3;
const FLOOR_W = FLOOR_X_MAX - FLOOR_X_MIN; // 4.2
const FLOOR_D = FLOOR_Z_MAX - FLOOR_Z_MIN; // 3.2
const FLOOR_CX = (FLOOR_X_MIN + FLOOR_X_MAX) / 2; // -0.6
const FLOOR_CZ = (FLOOR_Z_MIN + FLOOR_Z_MAX) / 2; // 0.7

// Window opening in the back wall (all heights above the FLOOR, not the desk).
const WIN_W = 0.75;
const WIN_H = 1.1;
const WIN_SILL = 0.9; // sill height above the floor
const WIN_X_CENTER = -0.5; // over the desk's left half, near the lamp
const WIN_X_MIN = WIN_X_CENTER - WIN_W / 2; // -0.875
const WIN_X_MAX = WIN_X_CENTER + WIN_W / 2; // -0.125
const WIN_Y_MIN = FLOOR_Y + WIN_SILL; // 0.15 (world)
const WIN_Y_MAX = WIN_Y_MIN + WIN_H; // 1.25 (world)

// Frame member sizing (meters).
const JAMB = 0.025; // jamb board thickness
const JAMB_DEPTH = WALL_THICKNESS + 0.012; // proud of the plaster ~6mm each side
const SASH_D = 0.032; // sash member depth (into the wall)
const STILE_W = 0.045; // sash stile width
const MUNTIN_W = 0.018; // muntin bar width
const MUNTIN_D = 0.02; // muntin bar depth (thinner than the sash frame)

// Backdrops outside the window: two overlapping 3.2m planes ~0.5m beyond the
// back wall's outer face, facing back in through the opening — sized so the
// painted sky covers the opening even from shallow interior angles. Night
// sits nearest the window; day 2cm behind it so both can stay visible
// in-file without z-fighting.
const BACKDROP_SIZE = 3.2;
const BACKDROP_Z_NIGHT = BACK_WALL_Z - WALL_THICKNESS - 0.5; // -1.49
const BACKDROP_Z_DAY = BACKDROP_Z_NIGHT - 0.02; // -1.51
const BACKDROP_CY = (WIN_Y_MIN + WIN_Y_MAX) / 2; // window vertical center

// Aged-oak trios borrowed from Room.tsx's palette: [base, dark grain, light].
const OAK_TONES: [string, string, string][] = [
  ["#6e5637", "#52402a", "#82693f"],
  ["#675134", "#4c3b26", "#7a6240"],
  ["#755c3b", "#5a462d", "#876d46"],
  ["#615033", "#473a24", "#735f3b"],
  ["#6b573b", "#4f4128", "#7d6845"]
];

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
// Backdrops — what the window looks out on. Both painted, both emissive.

// Deep blue-black night: sparse warm lit windows of a far building, a few
// rooftop silhouettes (bulkheads, antennas, one water tower), faint stars.
function nightBackdropTexture(rng: () => number): THREE.CanvasTexture {
  return makeCanvasTexture(
    1024,
    1024,
    (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#04060e");
      sky.addColorStop(0.55, "#0a1020");
      sky.addColorStop(0.85, "#141226");
      sky.addColorStop(1, "#1b1322");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // A handful of faint stars in the upper sky.
      for (let i = 0; i < 110; i++) {
        const a = 0.12 + rng() * 0.45;
        ctx.fillStyle = `rgba(214,225,255,${a})`;
        const s = 0.8 + rng() * 1.2;
        ctx.fillRect(rng() * w, rng() * h * 0.48, s, s);
      }

      // Distant block — a slightly lighter silhouette band, almost no lights.
      ctx.fillStyle = "#0c101e";
      let dx = -10;
      while (dx < w) {
        const bw = 60 + rng() * 130;
        const top = h * (0.38 + rng() * 0.12);
        ctx.fillRect(dx, top, bw, h - top);
        if (rng() < 0.25) {
          ctx.fillStyle = rgba("#c8a36b", 0.22);
          ctx.fillRect(dx + 10 + rng() * (bw - 24), top + 14 + rng() * 60, 6, 8);
          ctx.fillStyle = "#0c101e";
        }
        dx += bw;
      }

      // Main far building row, near-black, with rooftop furniture.
      type Building = { x: number; w: number; top: number };
      const buildings: Building[] = [];
      let mx = -30 + rng() * 40;
      while (mx < w) {
        const bw = 100 + rng() * 170;
        buildings.push({ x: mx, w: bw, top: h * (0.46 + rng() * 0.16) });
        mx += bw + (rng() < 0.35 ? 10 + rng() * 50 : 0);
      }
      ctx.fillStyle = "#04060c";
      for (const b of buildings) {
        ctx.fillRect(b.x, b.top, b.w, h - b.top);
        if (rng() < 0.8) {
          // Stair bulkhead on the roof.
          ctx.fillRect(
            b.x + b.w * (0.15 + rng() * 0.5),
            b.top - 14 - rng() * 10,
            26 + rng() * 30,
            30
          );
        }
        if (rng() < 0.45) {
          ctx.fillRect(b.x + b.w * (0.2 + rng() * 0.6), b.top - 44 - rng() * 26, 2, 60);
        }
      }

      // One water tower for the skyline's sake.
      const wt = buildings[Math.floor(rng() * buildings.length)];
      if (wt) {
        const tx = wt.x + wt.w * 0.65;
        ctx.fillStyle = "#04060c";
        ctx.fillRect(tx - 4, wt.top - 26, 4, 26); // legs
        ctx.fillRect(tx + 20, wt.top - 26, 4, 26);
        ctx.fillRect(tx - 8, wt.top - 54, 36, 30); // tank
        ctx.beginPath(); // conical cap
        ctx.moveTo(tx - 10, wt.top - 54);
        ctx.lineTo(tx + 10, wt.top - 72);
        ctx.lineTo(tx + 30, wt.top - 54);
        ctx.closePath();
        ctx.fill();
      }

      // Sparse warm lit windows — most of the far building is asleep.
      const warm = ["#ffce8a", "#ffb95f", "#f7dcae", "#e09a48"];
      for (const b of buildings) {
        for (let wy = b.top + 14; wy < h - 26; wy += 22) {
          for (let wx = b.x + 10; wx < b.x + b.w - 18; wx += 16) {
            if (rng() >= 0.07) continue;
            const color = warm[Math.floor(rng() * warm.length)];
            ctx.globalAlpha = 0.5 + rng() * 0.5;
            ctx.fillStyle = color;
            ctx.fillRect(wx, wy, 7 + rng() * 3, 9 + rng() * 4);
            if (rng() < 0.14) {
              // The rare window with a glow bleed.
              const glow = ctx.createRadialGradient(wx + 4, wy + 6, 0, wx + 4, wy + 6, 20);
              glow.addColorStop(0, rgba(color, 0.18));
              glow.addColorStop(1, rgba(color, 0));
              ctx.fillStyle = glow;
              ctx.fillRect(wx - 18, wy - 16, 44, 44);
            }
          }
        }
      }
      ctx.globalAlpha = 1;
    },
    { anisotropy: 8 }
  );
}

// Soft overcast morning: pale warm gray-blue gradient with cloud banks and a
// hidden-sun warmth low in the sky. No skyline — just weather.
function dayBackdropTexture(rng: () => number): THREE.CanvasTexture {
  return makeCanvasTexture(
    1024,
    1024,
    (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#a7b0bb");
      sky.addColorStop(0.5, "#c2c6c4");
      sky.addColorStop(1, "#ded6c8");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Stretched overcast cloud banks, lighter and darker.
      for (let i = 0; i < 16; i++) {
        const cx = rng() * w;
        const cy = rng() * h * 0.85;
        const r = 90 + rng() * 240;
        const lighter = rng() < 0.6;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1.8 + rng() * 1.4, 1);
        const tone = lighter ? "#eceae4" : "#8e98a4";
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        grad.addColorStop(0, rgba(tone, lighter ? 0.05 + rng() * 0.06 : 0.04 + rng() * 0.04));
        grad.addColorStop(1, rgba(tone, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();
      }

      // The morning sun hiding behind the overcast, low and warm.
      const glow = ctx.createRadialGradient(w * 0.35, h * 0.8, 0, w * 0.35, h * 0.8, w * 0.5);
      glow.addColorStop(0, "rgba(238,222,196,0.16)");
      glow.addColorStop(1, "rgba(238,222,196,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
    },
    { anisotropy: 8 }
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

// Sash builder: two stiles, two rails, and a 2x2 muntin cross. NO glass —
// the panes are empty air on purpose.
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
  const yMid = (yMin + yMax) / 2;

  parts.push(
    box(STILE_W, yMax - yMin, SASH_D, xMin + STILE_W / 2, yMid, zCenter),
    box(STILE_W, yMax - yMin, SASH_D, xMax - STILE_W / 2, yMid, zCenter),
    box(innerW, bottomRail, SASH_D, WIN_X_CENTER, yMin + bottomRail / 2, zCenter),
    box(innerW, topRail, SASH_D, WIN_X_CENTER, yMax - topRail / 2, zCenter)
  );

  // Muntin cross splitting the glazing into 2x2 panes.
  const gMin = yMin + bottomRail;
  const gMax = yMax - topRail;
  const gMid = (gMin + gMax) / 2;
  parts.push(
    box(MUNTIN_W, gMax - gMin, MUNTIN_D, WIN_X_CENTER, gMid, zCenter),
    box(innerW, MUNTIN_W, MUNTIN_D, WIN_X_CENTER, gMid, zCenter)
  );
}

export default function RoomWindow() {
  const built = useMemo(() => {
    const rng = mulberry32(0xc0_ffee);

    // --- Surfaces -------------------------------------------------------
    // Walls a touch lighter than Room.tsx's plaster; ceiling a touch darker.
    const wallWashes = ["#f3e4c6", "#dfd2b8", "#eed9b4", "#e6d8c2"];

    // The back wall is extruded (real thickness for the window reveal), and
    // ExtrudeGeometry UVs come out in shape units — meters — so the plaster
    // canvas is repeat-scaled to span the wall exactly once.
    const backRepeat: [number, number] = [1 / FLOOR_W, 1 / WALL_HEIGHT];
    const backWallMaterial = new THREE.MeshStandardMaterial({
      map: plasterColorTexture(rng, "#eadcc2", wallWashes, backRepeat),
      bumpMap: plasterBumpTexture(rng, backRepeat),
      bumpScale: 0.0012,
      color: "#fdfaf4",
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.6
    });

    const sideWallMaterial = new THREE.MeshStandardMaterial({
      map: plasterColorTexture(rng, "#eadcc2", wallWashes),
      bumpMap: plasterBumpTexture(rng),
      bumpScale: 0.0012,
      color: "#fdfaf4",
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.6
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

    // Painted trim: the same satin enamel as Room.tsx — baseboards and the
    // window frame are the same warm painted wood.
    const trimMaterial = lacquerMaterial("#e7dabd", {
      clearcoat: 0.35,
      clearcoatRoughness: 0.45,
      roughness: 0.5
    });
    trimMaterial.envMapIntensity = 0.7;

    // --- Back wall with the window punched through ------------------------
    // Shape plane: localX runs world +x from the wall's left end, localY is
    // height above the floor. Extruded along +z so the wall body spans
    // z = BACK_WALL_Z - WALL_THICKNESS .. BACK_WALL_Z, keeping the interior
    // face flush where the old flat plane stood.
    const wallShape = new THREE.Shape();
    wallShape.moveTo(0, 0);
    wallShape.lineTo(FLOOR_W, 0);
    wallShape.lineTo(FLOOR_W, WALL_HEIGHT);
    wallShape.lineTo(0, WALL_HEIGHT);
    wallShape.closePath();

    const opening = new THREE.Path();
    const hx0 = WIN_X_MIN - FLOOR_X_MIN;
    const hx1 = WIN_X_MAX - FLOOR_X_MIN;
    opening.moveTo(hx0, WIN_SILL);
    opening.lineTo(hx1, WIN_SILL);
    opening.lineTo(hx1, WIN_SILL + WIN_H);
    opening.lineTo(hx0, WIN_SILL + WIN_H);
    opening.closePath();
    wallShape.holes.push(opening);

    const backWallGeometry = new THREE.ExtrudeGeometry(wallShape, {
      depth: WALL_THICKNESS,
      bevelEnabled: false,
      steps: 1
    });
    backWallGeometry.translate(
      FLOOR_X_MIN,
      FLOOR_Y,
      BACK_WALL_Z - WALL_THICKNESS
    );
    backWallGeometry.name = "winWallBackGeometry";

    // --- Window frame: jambs, sill, casing, two sashes — one merged mesh --
    // The wall's interior face is at BACK_WALL_Z; its body runs toward -z.
    const frameParts: THREE.BufferGeometry[] = [];
    const jambZ = BACK_WALL_Z - WALL_THICKNESS / 2;
    const winYMid = (WIN_Y_MIN + WIN_Y_MAX) / 2;

    // Jamb lining (sides + head), slightly proud of the plaster.
    frameParts.push(
      box(JAMB, WIN_H, JAMB_DEPTH, WIN_X_MIN + JAMB / 2, winYMid, jambZ),
      box(JAMB, WIN_H, JAMB_DEPTH, WIN_X_MAX - JAMB / 2, winYMid, jambZ),
      box(WIN_W - JAMB * 2, JAMB, JAMB_DEPTH, WIN_X_CENTER, WIN_Y_MAX - JAMB / 2, jambZ)
    );

    // Sill with horns, nosing ~7cm into the room, and the apron beneath it.
    frameParts.push(
      box(WIN_W + 0.11, 0.035, 0.16, WIN_X_CENTER, WIN_Y_MIN - 0.0175, BACK_WALL_Z - 0.01),
      box(WIN_W + 0.03, 0.07, 0.018, WIN_X_CENTER, WIN_Y_MIN - 0.07, BACK_WALL_Z + 0.009)
    );

    // Interior casing on the room face: two legs standing on the sill horns,
    // one head board across the top.
    const casingZ = BACK_WALL_Z + 0.009;
    frameParts.push(
      box(0.07, WIN_H, 0.018, WIN_X_MIN - 0.035, winYMid, casingZ),
      box(0.07, WIN_H, 0.018, WIN_X_MAX + 0.035, winYMid, casingZ),
      box(WIN_W + 0.18, 0.07, 0.018, WIN_X_CENTER, WIN_Y_MAX + 0.035, casingZ)
    );

    // Double-hung sashes: lower rides the inner track, upper the outer, and
    // their meeting rails overlap 2.5cm at mid-height. 2x2 panes each, empty.
    const meetY = winYMid;
    pushSash(frameParts, WIN_Y_MIN, meetY + 0.0125, BACK_WALL_Z - 0.02, 0.055, 0.035);
    pushSash(
      frameParts,
      meetY - 0.0125,
      WIN_Y_MAX - JAMB,
      BACK_WALL_Z - WALL_THICKNESS + 0.02,
      0.035,
      0.045
    );

    const frameGeometry = merge(frameParts);
    frameGeometry.name = "winWindowFrameGeometry";

    // --- Baseboards + quarter-round shoes along both walls, one mesh -----
    // Back run hugs the back wall (yaw -90: depth -> +z, run -> -x), stopping
    // 13mm shy of the corner so it butts the side run instead of z-fighting.
    const baseboardGeometry = merge([
      trimRun(baseboardShape(), FLOOR_W - 0.013, -Math.PI / 2, [
        FLOOR_X_MAX - 0.013,
        FLOOR_Y,
        BACK_WALL_Z
      ]),
      trimRun(shoeShape(), FLOOR_W - 0.024, -Math.PI / 2, [
        FLOOR_X_MAX - 0.024,
        FLOOR_Y,
        BACK_WALL_Z + 0.013
      ]),
      // Side run hugs the window wall (yaw 180: depth -> -x, run -> -z).
      trimRun(baseboardShape(), FLOOR_D, Math.PI, [
        SIDE_WALL_X,
        FLOOR_Y,
        FLOOR_Z_MAX
      ]),
      trimRun(shoeShape(), FLOOR_D - 0.013, Math.PI, [
        SIDE_WALL_X - 0.013,
        FLOOR_Y,
        FLOOR_Z_MAX
      ])
    ]);
    baseboardGeometry.name = "winBaseboardsGeometry";

    // --- Backdrops: emissive canvases the bake toggles per theme ---------
    // Color is black so room light never grazes them; the canvas rides the
    // emissive slot and exports as a glTF emissiveTexture for Cycles.
    const nightTexture = nightBackdropTexture(rng);
    const backdropNightMaterial = new THREE.MeshStandardMaterial({
      map: nightTexture,
      color: "#000000",
      emissive: "#ffffff",
      emissiveMap: nightTexture,
      emissiveIntensity: 1,
      roughness: 1,
      metalness: 0
    });

    const dayTexture = dayBackdropTexture(rng);
    const backdropDayMaterial = new THREE.MeshStandardMaterial({
      map: dayTexture,
      color: "#000000",
      emissive: "#ffffff",
      emissiveMap: dayTexture,
      emissiveIntensity: 1,
      roughness: 1,
      metalness: 0
    });

    return {
      backWallMaterial,
      sideWallMaterial,
      ceilingMaterial,
      floorMaterial,
      trimMaterial,
      backWallGeometry,
      frameGeometry,
      baseboardGeometry,
      backdropNightMaterial,
      backdropDayMaterial
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

      {/* Back wall, ~0.5m behind the desk's rear edge, with the window
          punched through — real thickness so the opening has a reveal for
          light to wrap around. */}
      <mesh
        name="winWallBack"
        geometry={built.backWallGeometry}
        material={built.backWallMaterial}
        castShadow
        receiveShadow
      />

      {/* Right side wall — plain, windowless, closing the corner. */}
      <mesh
        name="winWallSide"
        rotation={[0, -Math.PI / 2, 0]}
        position={[SIDE_WALL_X, FLOOR_Y + WALL_HEIGHT / 2, FLOOR_CZ]}
        material={built.sideWallMaterial}
        receiveShadow
      >
        <planeGeometry args={[FLOOR_D, WALL_HEIGHT]} />
      </mesh>

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

      {/* Double-hung sash window: jambs, sill, casing, sashes, muntins. */}
      <mesh
        name="winWindowFrame"
        geometry={built.frameGeometry}
        material={built.trimMaterial}
        castShadow
        receiveShadow
      />

      <mesh
        name="winBaseboards"
        geometry={built.baseboardGeometry}
        material={built.trimMaterial}
        castShadow
        receiveShadow
      />

      {/* What's outside: night nearest the window, day 2cm behind it. The
          bake script flips visibility per theme; both stay on in-file. */}
      <mesh
        name="windowBackdropNight"
        position={[WIN_X_CENTER, BACKDROP_CY, BACKDROP_Z_NIGHT]}
        material={built.backdropNightMaterial}
      >
        <planeGeometry args={[BACKDROP_SIZE, BACKDROP_SIZE]} />
      </mesh>
      <mesh
        name="windowBackdropDay"
        position={[WIN_X_CENTER, BACKDROP_CY, BACKDROP_Z_DAY]}
        material={built.backdropDayMaterial}
      >
        <planeGeometry args={[BACKDROP_SIZE, BACKDROP_SIZE]} />
      </mesh>
    </group>
  );
}
