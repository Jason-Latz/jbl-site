"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { makeCanvasTexture } from "@/lib/three/materials";
import { FLOOR_Y } from "../layout";

// Concept block-out A — "the perfected void".
//
// An intentional chiaroscuro stage, not an empty scene: the desk floats in
// darkness, grounded by a single warm pool of readable floorboards that dies
// to pure black before it reaches any visible edge. The walls exist only as
// whispers — a breath of warm plaster behind the desk at desk height, gone by
// the time the eye travels up or out. ALL of the drama is painted into the
// albedo maps; the geometry is just four planes (4 draws).
//
// Mounted ONLY in the offline bake/export scene (glTF → Blender Cycles).
// Never wired into DeskScene. Export-safe by construction: MeshStandardMaterial
// only, canvas textures only, stable mesh names.

// ---------------------------------------------------------------------------
// Stage extents (meters, world space). The desk is centered at the origin
// with its top surface at y=0 (layout.ts convention); the floor plane sits at
// exactly FLOOR_Y — the same height Room.tsx lays its plank tops — so the
// desk sits identically on this stage.
const FLOOR_W = 4.2; // x: -2.1 .. 2.1
const FLOOR_D = 3.2; // z: WALL_BACK_Z .. WALL_BACK_Z + FLOOR_D (= 2.25)
const WALL_BACK_Z = -0.95; // desk back edge is z=-0.425 → wall ~0.5 m behind it
const WALL_SIDE_X = 2.0; // side walls ~2 m out from the desk centerline
const WALL_H = 2.4; // no ceiling — the wall tops dissolve into black anyway
const FLOOR_MID_Z = WALL_BACK_Z + FLOOR_D / 2; // 0.65

// Where "desk height" lands on a wall, as a 0..1 fraction up from the floor.
// The glow patches center here: the light lives where the desk lives.
const DESK_V = -FLOOR_Y / WALL_H; // 0.3125

// The lit pool: full board read inside ~0.55 m of the desk center, pure black
// by POOL_R. Stretched along x because the desk is wide (1.9 × 0.85).
const POOL_R = 1.55;
const POOL_STRETCH_X = 1.25;

// Shared vertical kill for all three walls (canvas y=0 is the wall TOP):
// black at the top, untouched below ~0.64 m world height. Multiplied into the
// albedo so the falloff survives the glTF round-trip exactly as painted.
const WALL_VERTICAL_KILL: [number, string][] = [
  [0, "#000000"],
  [0.1, "#0b0b0b"],
  [0.45, "#ffffff"],
  [1, "#ffffff"]
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

// Multiply a linear ramp into everything painted so far. This is THE control
// surface of the concept — falloff lives in the albedo, not in lighting.
function multiplyRamp(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  axis: "x" | "y",
  stops: [number, string][]
): void {
  ctx.globalCompositeOperation = "multiply";
  const grad =
    axis === "x"
      ? ctx.createLinearGradient(0, 0, w, 0)
      : ctx.createLinearGradient(0, 0, 0, h);
  for (const [t, c] of stops) {
    grad.addColorStop(t, c);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

// Soft elliptical patch of warm tone — the only "light" the walls ever get.
function paintGlow(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  radiusPx: number,
  stretchX: number,
  color: string,
  peakAlpha: number
): void {
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(stretchX, 1);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusPx);
  grad.addColorStop(0, rgba(color, peakAlpha));
  grad.addColorStop(0.5, rgba(color, peakAlpha * 0.45));
  grad.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(-radiusPx, -radiusPx, radiusPx * 2, radiusPx * 2);
  ctx.restore();
}

// Near-subliminal plaster character: tonal blobs + speckle. Painted BEFORE
// the multiply ramps (so the edges stay truly black) — it mostly exists to
// dither the gradients against 8-bit banding.
function paintPlasterGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number
): void {
  for (let i = 0; i < 60; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 40 + rng() * 180;
    const tone = rng() < 0.5 ? "#1a120c" : "#060403";
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgba(tone, 0.02 + rng() * 0.03));
    grad.addColorStop(1, rgba(tone, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 1500; i++) {
    const tone = rng() < 0.5 ? "#241a12" : "#030201";
    ctx.fillStyle = rgba(tone, 0.02 + rng() * 0.02);
    ctx.fillRect(rng() * w, rng() * h, 1 + rng(), 1 + rng());
  }
}

// ---------------------------------------------------------------------------
// Floor: dark-stained boards laid full-width along x, readable only inside a
// soft pool around the desk's footprint. The radial falloff is multiplied
// straight into the albedo — by the time the boards reach a visible floor
// edge they are pure black. 2048×1560 keeps px/m uniform on both axes
// (≈488 px/m) so the painted pool stays circular in meters.
function voidFloorTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 1560;
  const pxPerM = W / FLOOR_W;
  const rng = mulberry32(0x0d0a08);

  return makeCanvasTexture(
    W,
    H,
    (ctx, w, h) => {
      // Dark-stained oak trios: [base, dark grain, light grain].
      const stains: [string, string, string][] = [
        ["#211409", "#120b05", "#2e1d0e"],
        ["#1d1208", "#100904", "#291a0d"],
        ["#241608", "#140c05", "#31200f"],
        ["#1a1007", "#0d0703", "#261810"]
      ];

      // Lay the boards row by row (canvas top = z at the back wall).
      const rowH = 0.145 * pxPerM;
      let y = 0;
      while (y < h) {
        const [base, dark, light] = stains[Math.floor(rng() * stains.length)];
        ctx.fillStyle = base;
        ctx.fillRect(0, y, w, rowH);

        // Staggered butt joints, 1–1.9 m apart.
        const joints: number[] = [];
        let jx = rng() * 1.2 * pxPerM;
        while (jx < w) {
          joints.push(jx);
          jx += (1.0 + rng() * 0.9) * pxPerM;
        }

        // Per-board tonal lift/drop between joints — boards read as
        // individuals even under the stain.
        let prev = 0;
        for (const j of [...joints, w]) {
          const pick = rng();
          if (pick < 0.45) {
            ctx.fillStyle = rgba(pick < 0.2 ? dark : light, 0.05 + rng() * 0.07);
            ctx.fillRect(prev, y, j - prev, rowH);
          }
          prev = j;
        }

        // Long wavy grain running with the board.
        for (let i = 0; i < 26; i++) {
          const gy = y + rng() * rowH;
          const amp = 0.8 + rng() * 2.4;
          const phase = rng() * Math.PI * 2;
          const freq = 0.004 + rng() * 0.009;
          ctx.strokeStyle = rng() < 0.6 ? dark : light;
          ctx.globalAlpha = 0.05 + rng() * 0.09;
          ctx.lineWidth = 0.6 + rng() * 1.8;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 16) {
            const yy = gy + Math.sin(x * freq + phase) * amp;
            if (x === 0) ctx.moveTo(x, yy);
            else ctx.lineTo(x, yy);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Joints over the grain, then the row seam.
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        for (const j of joints) {
          ctx.fillRect(j - 1, y, 2, rowH);
        }
        ctx.fillStyle = "rgba(4,2,1,0.85)";
        ctx.fillRect(0, y + rowH - 1.5, w, 1.5);

        y += rowH;
      }

      // Dust-fine speckle to dither the coming gradient (pre-multiply, so the
      // black stays black).
      for (let i = 0; i < 2600; i++) {
        const tone = rng() < 0.5 ? "#32220f" : "#050302";
        ctx.fillStyle = rgba(tone, 0.025 + rng() * 0.025);
        ctx.fillRect(rng() * w, rng() * h, 1 + rng(), 1 + rng());
      }

      // THE pool. Centered on the desk's origin (world x=0, z=0): canvas
      // px = (wx + FLOOR_W/2)·pxPerM, py = (wz − WALL_BACK_Z)·pxPerM.
      // Warm-tinted mid stops push the falloff toward embers instead of grey.
      // Geometry check: side edges (2.1/1.25 = 1.68 m) and the front edge
      // (2.25 m) sit beyond POOL_R → pure black. The back edge (0.95 m)
      // keeps ~half its stain — it hides under the skirting glow of the wall.
      ctx.globalCompositeOperation = "multiply";
      ctx.save();
      ctx.translate(w / 2, -WALL_BACK_Z * pxPerM);
      ctx.scale(POOL_STRETCH_X, 1);
      const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, POOL_R * pxPerM);
      pool.addColorStop(0, "#ffffff");
      pool.addColorStop(0.33, "#f3ece2");
      pool.addColorStop(0.55, "#9b8a76");
      pool.addColorStop(0.74, "#4a3f33");
      pool.addColorStop(0.9, "#161210");
      pool.addColorStop(1, "#000000");
      ctx.fillStyle = pool;
      ctx.fillRect(-w, -h, w * 2, h * 2);
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    },
    { anisotropy: 8 }
  );
}

// ---------------------------------------------------------------------------
// Back wall: near-black warm plaster with one soft breath of warmth centered
// behind the desk at desk height, plus the skirting hint — a slightly lighter
// band at the floor line that fades out to the sides. 320 px/m on both axes.
function backWallTexture(): THREE.CanvasTexture {
  const W = 1280;
  const H = 768;
  const rng = mulberry32(0xba5e_ba11);

  return makeCanvasTexture(
    W,
    H,
    (ctx, w, h) => {
      ctx.fillStyle = "#0d0a08";
      ctx.fillRect(0, 0, w, h);
      paintPlasterGrain(ctx, w, h, rng);

      // Barely lighter at desk height behind the desk. Canvas y=0 is the
      // wall top, so desk height sits at (1 − DESK_V)·h.
      paintGlow(ctx, w / 2, (1 - DESK_V) * h, 0.9 * 320, 1.9, "#26180e", 0.85);

      // Skirting hint: ~9.5 cm band at the floor line, brightest mid-wall,
      // gone by the corners. A 2.5 px edge-light along its top reads as the
      // rounded cap of a baseboard catching the desk's spill.
      const skirtH = 0.095 * 320;
      const band = ctx.createLinearGradient(0, 0, w, 0);
      band.addColorStop(0.08, rgba("#2f2013", 0));
      band.addColorStop(0.5, rgba("#2f2013", 0.55));
      band.addColorStop(0.92, rgba("#2f2013", 0));
      ctx.fillStyle = band;
      ctx.fillRect(0, h - skirtH, w, skirtH);
      const lip = ctx.createLinearGradient(0, 0, w, 0);
      lip.addColorStop(0.12, rgba("#46301c", 0));
      lip.addColorStop(0.5, rgba("#46301c", 0.45));
      lip.addColorStop(0.88, rgba("#46301c", 0));
      ctx.fillStyle = lip;
      ctx.fillRect(0, h - skirtH, w, 2.5);

      // Falloff: black upward, black outward.
      multiplyRamp(ctx, w, h, "y", WALL_VERTICAL_KILL);
      multiplyRamp(ctx, w, h, "x", [
        [0, "#000000"],
        [0.16, "#8a8a8a"],
        [0.3, "#ffffff"],
        [0.7, "#ffffff"],
        [0.84, "#8a8a8a"],
        [1, "#000000"]
      ]);
    },
    { anisotropy: 8 }
  );
}

// ---------------------------------------------------------------------------
// Side walls: same plaster void, dimmer glow centered beside the desk
// (world z=0) at desk height, killed toward the open front of the stage and
// pinched to black where they meet the back wall's dead corners.
// frontEdgeU says which canvas edge faces the camera (left wall's u runs
// front→back, the right wall's runs back→front — plane yaw flips u).
function sideWallTexture(glowU: number, frontEdgeU: 0 | 1): THREE.CanvasTexture {
  const W = 1024;
  const H = 768;
  const rng = mulberry32(frontEdgeU === 0 ? 0x1ef7_0001 : 0x0119_0002);

  return makeCanvasTexture(
    W,
    H,
    (ctx, w, h) => {
      ctx.fillStyle = "#0d0a08";
      ctx.fillRect(0, 0, w, h);
      paintPlasterGrain(ctx, w, h, rng);

      // Roughly half the back wall's warmth — the sides frame, never compete.
      paintGlow(ctx, glowU * w, (1 - DESK_V) * h, 0.75 * 320, 1.4, "#1d130c", 0.5);

      multiplyRamp(ctx, w, h, "y", WALL_VERTICAL_KILL);

      // Long fade toward the camera, short pinch into the back corner.
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      const stop = (t: number, c: string) =>
        grad.addColorStop(frontEdgeU === 0 ? t : 1 - t, c);
      stop(0, "#000000");
      stop(0.45, "#ffffff");
      stop(0.86, "#ffffff");
      stop(1, "#000000");
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    },
    { anisotropy: 8 }
  );
}

// ---------------------------------------------------------------------------

export default function RoomVoid() {
  const built = useMemo(() => {
    const floor = new THREE.MeshStandardMaterial({
      map: voidFloorTexture(),
      roughness: 0.6,
      metalness: 0,
      // Keep the IBL from lifting the void in any live preview; Cycles
      // ignores this on export, where the painted blacks carry themselves.
      envMapIntensity: 0.5
    });

    const wallBack = new THREE.MeshStandardMaterial({
      map: backWallTexture(),
      roughness: 0.94,
      metalness: 0,
      envMapIntensity: 0.3
    });

    // Left wall (x=-2, normal +x, yaw +90°): plane-local +x lands on world
    // −z, so u grows toward the BACK wall — the glow at world z=0 sits at
    // u = 0.5 + FLOOR_MID_Z/FLOOR_D and the camera-side edge is u=0.
    const wallLeft = new THREE.MeshStandardMaterial({
      map: sideWallTexture(0.5 + FLOOR_MID_Z / FLOOR_D, 0),
      roughness: 0.94,
      metalness: 0,
      envMapIntensity: 0.3
    });

    // Right wall (x=+2, normal −x, yaw −90°): u grows toward the FRONT, so
    // everything mirrors.
    const wallRight = new THREE.MeshStandardMaterial({
      map: sideWallTexture(0.5 - FLOOR_MID_Z / FLOOR_D, 1),
      roughness: 0.94,
      metalness: 0,
      envMapIntensity: 0.3
    });

    return { floor, wallBack, wallLeft, wallRight };
  }, []);

  return (
    <group name="roomVoid">
      <mesh
        name="voidFloor"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_Y, FLOOR_MID_Z]}
        material={built.floor}
        receiveShadow
      >
        <planeGeometry args={[FLOOR_W, FLOOR_D]} />
      </mesh>

      <mesh
        name="voidWallBack"
        position={[0, FLOOR_Y + WALL_H / 2, WALL_BACK_Z]}
        material={built.wallBack}
        receiveShadow
      >
        <planeGeometry args={[WALL_SIDE_X * 2, WALL_H]} />
      </mesh>

      <mesh
        name="voidWallLeft"
        position={[-WALL_SIDE_X, FLOOR_Y + WALL_H / 2, FLOOR_MID_Z]}
        rotation={[0, Math.PI / 2, 0]}
        material={built.wallLeft}
        receiveShadow
      >
        <planeGeometry args={[FLOOR_D, WALL_H]} />
      </mesh>

      <mesh
        name="voidWallRight"
        position={[WALL_SIDE_X, FLOOR_Y + WALL_H / 2, FLOOR_MID_Z]}
        rotation={[0, -Math.PI / 2, 0]}
        material={built.wallRight}
        receiveShadow
      >
        <planeGeometry args={[FLOOR_D, WALL_H]} />
      </mesh>
    </group>
  );
}
