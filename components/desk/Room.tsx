"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three-stdlib";
import { lacquerMaterial, makeCanvasTexture } from "@/lib/three/materials";
import { FLOOR_Y } from "./layout";

// The room around the desk, built like set dressing for a locked-off shot:
// individually laid oak planks with eased edges and staggered end joints,
// a hand-trowelled plaster wall, and properly profiled trim where they meet.

const FLOOR_X_MIN = -3.5;
const FLOOR_X_MAX = 3.5;
const FLOOR_Z_MIN = -0.62;
const FLOOR_Z_MAX = 2.6;
const WALL_Z = -0.62;
const WALL_HEIGHT = 3.2;

const PLANK_W = 0.14;
const PLANK_T = 0.016;
const PLANK_EDGE = 0.0018;
const GAP = 0.0015;

// World meters one grain canvas spans along/across a plank. Plank UVs are
// baked as sub-windows of this so grain density stays constant per length
// and no plank ever samples across the (non-tiling) canvas seam.
const TEX_WORLD_U = 2.2;
const TEX_WORLD_V = 0.55;

// Aged-oak trios: [base, dark grain, light grain]. A per-plank tint multiplies
// on top, so five canvases read as dozens of distinct boards.
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

function oakGrainTexture(
  rng: () => number,
  [base, dark, light]: [string, string, string]
): THREE.CanvasTexture {
  return makeCanvasTexture(
    2048,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      // Broad tonal drift across the board face.
      for (let i = 0; i < 12; i++) {
        const y0 = rng() * h;
        const bh = h * (0.08 + rng() * 0.25);
        const tone = rng() < 0.5 ? dark : light;
        const grad = ctx.createLinearGradient(0, y0, 0, y0 + bh);
        grad.addColorStop(0, rgba(tone, 0));
        grad.addColorStop(0.5, rgba(tone, 0.05 + rng() * 0.06));
        grad.addColorStop(1, rgba(tone, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(0, y0, w, bh);
      }

      // Long wavy grain lines running with the plank.
      for (let i = 0; i < 260; i++) {
        const y = rng() * h;
        const amp = 1 + rng() * 3.5;
        const phase = rng() * Math.PI * 2;
        const freq = 0.004 + rng() * 0.01;
        ctx.strokeStyle = rng() < 0.62 ? dark : light;
        ctx.globalAlpha = 0.04 + rng() * 0.09;
        ctx.lineWidth = 0.6 + rng() * 2.2;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 16) {
          const yy = y + Math.sin(x * freq + phase) * amp;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }

      // Cathedral figure: nested squashed rings, flat-sawn oak's signature.
      for (let k = 0; k < 7; k++) {
        const cx = rng() * w;
        const cy = rng() * h;
        const rings = 4 + Math.floor(rng() * 5);
        const rx = 55 + rng() * 50;
        const ry = 4.5 + rng() * 5;
        for (let ring = 1; ring <= rings; ring++) {
          ctx.strokeStyle = dark;
          ctx.globalAlpha = 0.045 + rng() * 0.05;
          ctx.lineWidth = 1 + rng() * 1.6;
          ctx.beginPath();
          ctx.ellipse(cx, cy, ring * rx, ring * ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Fine pore flecks.
      for (let i = 0; i < 1600; i++) {
        const x = rng() * w;
        const y = rng() * h;
        const len = 3 + rng() * 11;
        ctx.strokeStyle = rng() < 0.7 ? dark : light;
        ctx.globalAlpha = 0.05 + rng() * 0.06;
        ctx.lineWidth = 0.5 + rng() * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y + (rng() - 0.5) * 1.5);
        ctx.stroke();
      }

      // The occasional knot.
      if (rng() < 0.7) {
        const cx = rng() * w;
        const cy = rng() * h;
        const krx = 7 + rng() * 6;
        const kry = 5 + rng() * 4;
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.ellipse(cx, cy, krx, kry, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let ring = 1; ring <= 4; ring++) {
          ctx.globalAlpha = Math.max(0.03, 0.16 - ring * 0.03);
          ctx.strokeStyle = dark;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.ellipse(cx, cy, krx + ring * 6, kry + ring * 4, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
    },
    { repeat: [1, 1], anisotropy: 8 }
  );
}

function plasterBumpTexture(rng: () => number): THREE.CanvasTexture {
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

      // Faint trowel sweeps, each with a thin ridge along its outer edge.
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
    { srgb: false, anisotropy: 8 }
  );
}

function plasterColorTexture(rng: () => number): THREE.CanvasTexture {
  return makeCanvasTexture(
    1024,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = "#e3d4ba";
      ctx.fillRect(0, 0, w, h);

      // Soft tonal washes — sun-warmed patches and dustier corners.
      const washes = ["#ecdcbd", "#d8c9b0", "#e6d2ae", "#dccdb8"];
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
        ctx.fillStyle = rgba(rng() < 0.5 ? "#c9b896" : "#f0e4ca", 0.04);
        ctx.fillRect(rng() * w, rng() * h, 1 + rng(), 1 + rng());
      }
    },
    { anisotropy: 8 }
  );
}

// Trim cross-sections live in shape space: x = depth off the wall, y = up.
// Extruded along z then yawed -90deg so the run lies along world x.
function chairRailShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.012, 0);
  s.quadraticCurveTo(0.019, 0.002, 0.02, 0.009);
  s.lineTo(0.02, 0.034);
  s.quadraticCurveTo(0.02, 0.046, 0.01, 0.052);
  s.lineTo(0.008, 0.058);
  s.quadraticCurveTo(0.004, 0.062, 0, 0.062);
  s.closePath();
  return s;
}

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

type Plank = {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhysicalMaterial;
  position: [number, number, number];
  rotationY: number;
};

export default function Room() {
  const built = useMemo(() => {
    const rng = mulberry32(0x5eed_f100);

    const grains = OAK_TONES.map((trio) => oakGrainTexture(rng, trio));

    // Lay the floor row by row, wall outward, cutting boards to fit.
    const planks: Plank[] = [];
    let z = FLOOR_Z_MIN;
    while (z < FLOOR_Z_MAX - 0.02) {
      const rowW = Math.min(PLANK_W, FLOOR_Z_MAX - z);
      let x = FLOOR_X_MIN;
      let first = true;
      while (x < FLOOR_X_MAX - 1e-4) {
        const remaining = FLOOR_X_MAX - x;
        let len: number;
        if (remaining <= 2.0) {
          len = remaining;
        } else if (remaining <= 3.2) {
          len = remaining * (0.42 + rng() * 0.16);
        } else if (first) {
          len = 0.5 + rng() * 1.5; // cut starter board staggers the joints
        } else {
          len = 1.2 + rng() * 0.8;
        }
        first = false;

        const meshLen = len - GAP;
        const geometry = new RoundedBoxGeometry(
          meshLen,
          PLANK_T,
          rowW,
          2,
          PLANK_EDGE
        );
        // Bake this board's grain window so density matches its true size.
        const uScale = len / TEX_WORLD_U;
        const vScale = rowW / TEX_WORLD_V;
        const uOff = rng() * Math.max(0, 1 - uScale);
        const vOff = rng() * Math.max(0, 1 - vScale);
        const uv = geometry.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, uv.getX(i) * uScale + uOff, uv.getY(i) * vScale + vOff);
        }

        // Warm near-white tint, jittered per board; the odd darker
        // replacement board sneaks in.
        const tint = new THREE.Color().setHSL(
          0.085 + (rng() - 0.5) * 0.018,
          0.18 + rng() * 0.14,
          0.82 + (rng() - 0.5) * 0.12
        );
        if (rng() < 0.06) {
          tint.offsetHSL(0.004, 0.03, -0.07);
        }

        const grain = grains[Math.floor(rng() * grains.length)];
        const material = new THREE.MeshPhysicalMaterial({
          map: grain,
          bumpMap: grain,
          bumpScale: 0.0008,
          color: tint,
          roughness: 0.45 + rng() * 0.15,
          metalness: 0,
          clearcoat: 0.2 + rng() * 0.12, // old varnish, mostly worn matte
          clearcoatRoughness: 0.28 + rng() * 0.12,
          envMapIntensity: 0.65
        });

        planks.push({
          geometry,
          material,
          position: [x + len / 2, FLOOR_Y - PLANK_T / 2, z + rowW / 2],
          rotationY: (rng() < 0.5 ? Math.PI : 0) + (rng() - 0.5) * 0.0016
        });
        x += len;
      }
      z += rowW + GAP;
    }

    const underlayMaterial = new THREE.MeshStandardMaterial({
      color: "#15100a",
      roughness: 1,
      metalness: 0
    });

    const wallMaterial = new THREE.MeshStandardMaterial({
      map: plasterColorTexture(rng),
      bumpMap: plasterBumpTexture(rng),
      bumpScale: 0.0012,
      color: "#fdfaf4",
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.6
    });

    // Painted trim: satin enamel over wood, one shade lighter than the wall.
    const trimMaterial = lacquerMaterial("#e7dabd", {
      clearcoat: 0.35,
      clearcoatRoughness: 0.45,
      roughness: 0.5
    });
    trimMaterial.envMapIntensity = 0.7;

    const extrude: THREE.ExtrudeGeometryOptions = {
      depth: FLOOR_X_MAX - FLOOR_X_MIN,
      bevelEnabled: false,
      curveSegments: 10,
      steps: 1
    };
    const railGeometry = new THREE.ExtrudeGeometry(chairRailShape(), extrude);
    const baseboardGeometry = new THREE.ExtrudeGeometry(
      baseboardShape(),
      extrude
    );
    const shoeGeometry = new THREE.ExtrudeGeometry(shoeShape(), extrude);

    // Alpha ramp for the wall-meets-floor shadow line: opaque at the shoe,
    // gone 3.5cm out.
    const shadowRamp = makeCanvasTexture(
      16,
      64,
      (ctx, w, h) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(1, "#000000");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      },
      { srgb: false }
    );
    const shadowLineMaterial = new THREE.MeshBasicMaterial({
      color: "#000000",
      transparent: true,
      opacity: 0.25,
      alphaMap: shadowRamp,
      depthWrite: false
    });

    return {
      planks,
      underlayMaterial,
      wallMaterial,
      trimMaterial,
      railGeometry,
      baseboardGeometry,
      shoeGeometry,
      shadowLineMaterial
    };
  }, []);

  const floorDepth = FLOOR_Z_MAX - FLOOR_Z_MIN;
  const floorMidZ = (FLOOR_Z_MIN + FLOOR_Z_MAX) / 2;

  return (
    <group>
      {/* Dark subfloor showing through the 1.5mm board gaps */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_Y - 0.008, floorMidZ]}
        material={built.underlayMaterial}
        receiveShadow
      >
        <planeGeometry args={[FLOOR_X_MAX - FLOOR_X_MIN, floorDepth]} />
      </mesh>

      {built.planks.map((plank, index) => (
        <mesh
          key={index}
          geometry={plank.geometry}
          material={plank.material}
          position={plank.position}
          rotation-y={plank.rotationY}
          receiveShadow
        />
      ))}

      <mesh
        position={[0, FLOOR_Y + WALL_HEIGHT / 2, WALL_Z]}
        material={built.wallMaterial}
        receiveShadow
      >
        <planeGeometry args={[FLOOR_X_MAX - FLOOR_X_MIN, WALL_HEIGHT]} />
      </mesh>

      {/* Baseboard: tall board + quarter-round shoe, then chair rail at 0.9m */}
      <mesh
        geometry={built.baseboardGeometry}
        material={built.trimMaterial}
        position={[FLOOR_X_MAX, FLOOR_Y, WALL_Z]}
        rotation-y={-Math.PI / 2}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={built.shoeGeometry}
        material={built.trimMaterial}
        position={[FLOOR_X_MAX, FLOOR_Y, WALL_Z + 0.013]}
        rotation-y={-Math.PI / 2}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={built.railGeometry}
        material={built.trimMaterial}
        position={[FLOOR_X_MAX, FLOOR_Y + 0.9, WALL_Z]}
        rotation-y={-Math.PI / 2}
        castShadow
        receiveShadow
      />

      {/* Barely-there occlusion line grounding the wall/floor junction */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_Y + 0.0006, WALL_Z + 0.024 + 0.0175]}
        material={built.shadowLineMaterial}
      >
        <planeGeometry args={[FLOOR_X_MAX - FLOOR_X_MIN, 0.035]} />
      </mesh>
    </group>
  );
}
