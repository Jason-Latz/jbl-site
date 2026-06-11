"use client";

import { useMemo } from "react";
import * as THREE from "three";
import {
  PALETTE,
  makeCanvasTexture,
  paperMaterial,
  woodMaterial
} from "@/lib/three/materials";

const INTERIOR = 0.34;
const CRATE_H = 0.31;
const POST = 0.028;
const SLAT_T = 0.012;
const SLAT_W = 0.075;
const SLAT_LEN = INTERIOR + POST * 2;
const SLAT_ROWS = [0.055, 0.155, 0.26];
const SLAT_FACE = INTERIOR / 2 + POST + SLAT_T / 2;

const SLEEVE = 0.315;
const SLEEVE_T = 0.005;
const SLEEVE_REST_Y = 0.0246; // top of the bottom slats
const LP_COUNT = 10;

const OUT_LEAN = 0.25;
const OUT_BASE_Z =
  INTERIOR / 2 + POST + SLAT_T + SLEEVE * Math.sin(OUT_LEAN) + 0.004;

type Xform = {
  position: [number, number, number];
  rotation: [number, number, number];
};

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

function coverDraw(design: CoverDesign, rng: () => number) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = design.base;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 70; i++) {
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

    // Spine sliver along the sleeve's top edge.
    ctx.fillStyle = design.dark;
    ctx.fillRect(0, 0, w, h * 0.055);
  };
}

function coverMaterials(design: CoverDesign, seed: number) {
  const front = new THREE.MeshStandardMaterial({
    map: makeCanvasTexture(512, 512, coverDraw(design, mulberry32(seed))),
    roughness: 0.88,
    metalness: 0
  });
  return { front, edge: paperMaterial(design.dark) };
}

// Slatted pine record crate on the floor: ten LPs leaning inside,
// one sleeve propped against the front with its vinyl peeking out.
export default function RecordCrate() {
  const crateWood = useMemo(
    () => woodMaterial({ base: "#7a5a38", streak: "#64482c" }),
    []
  );

  const geoms = useMemo(
    () => ({
      post: new THREE.BoxGeometry(POST, CRATE_H, POST),
      slat: new THREE.BoxGeometry(SLAT_LEN, SLAT_W, SLAT_T),
      bottom: new THREE.BoxGeometry(INTERIOR - 0.004, SLAT_T, 0.06),
      sleeve: new THREE.BoxGeometry(SLEEVE, SLEEVE, SLEEVE_T)
    }),
    []
  );

  const frame = useMemo(() => {
    const rng = mulberry32(0xc7a7e);
    const slats: Xform[] = [];
    for (const side of [1, -1]) {
      for (const row of SLAT_ROWS) {
        slats.push({
          position: [
            (rng() - 0.5) * 0.003,
            row + (rng() - 0.5) * 0.003,
            side * (SLAT_FACE + (rng() - 0.5) * 0.0016)
          ],
          rotation: [
            (rng() - 0.5) * 0.02,
            (rng() - 0.5) * 0.012,
            (rng() - 0.5) * 0.014
          ]
        });
      }
    }
    for (const side of [1, -1]) {
      for (const row of SLAT_ROWS) {
        slats.push({
          position: [
            side * (SLAT_FACE + (rng() - 0.5) * 0.0016),
            row + (rng() - 0.5) * 0.003,
            (rng() - 0.5) * 0.003
          ],
          rotation: [
            (rng() - 0.5) * 0.02,
            Math.PI / 2 + (rng() - 0.5) * 0.012,
            (rng() - 0.5) * 0.014
          ]
        });
      }
    }

    const p = INTERIOR / 2 + POST / 2;
    const corners: [number, number][] = [
      [-p, -p],
      [p, -p],
      [-p, p],
      [p, p]
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

  // Sleeves pack against the back; neighbor lean angles random-walk so
  // adjacent covers never cross through each other.
  const sleeves = useMemo(() => {
    const rng = mulberry32(314159);
    const items: {
      x: number;
      z: number;
      lean: number;
      lift: number;
      yaw: number;
      roll: number;
    }[] = [];
    let z = -0.096;
    let lean = 0.14 + rng() * 0.05;
    for (let i = 0; i < LP_COUNT; i++) {
      lean = THREE.MathUtils.clamp(lean + (rng() - 0.5) * 0.05, 0.12, 0.22);
      const pulled = i === 2 || i === 6;
      items.push({
        x: (rng() - 0.5) * 0.008,
        z,
        lean,
        lift: pulled ? 0.012 + rng() * 0.018 : 0,
        yaw: (rng() - 0.5) * 0.04,
        roll: (rng() - 0.5) * 0.026
      });
      z += 0.0165 + rng() * 0.002;
    }
    return items;
  }, []);

  const covers = useMemo(
    () => DESIGNS.map((design, i) => coverMaterials(design, 9100 + i * 137)),
    []
  );

  const outside = useMemo(() => {
    const materials = coverMaterials(
      {
        base: "#efe6d2",
        dark: "#cdc0a2",
        accent: PALETTE.accentCoral,
        motif: "circle"
      },
      777001
    );
    const vinyl = new THREE.MeshStandardMaterial({
      color: "#16130f",
      roughness: 0.38,
      metalness: 0.05
    });
    return { ...materials, vinyl };
  }, []);

  return (
    <group>
      {frame.posts.map((t, i) => (
        <mesh
          key={`post${i}`}
          geometry={geoms.post}
          material={crateWood}
          position={t.position}
          rotation={t.rotation}
          castShadow
          receiveShadow
        />
      ))}
      {frame.slats.map((t, i) => (
        <mesh
          key={`slat${i}`}
          geometry={geoms.slat}
          material={crateWood}
          position={t.position}
          rotation={t.rotation}
          castShadow
          receiveShadow
        />
      ))}
      {frame.bottoms.map((t, i) => (
        <mesh
          key={`bottom${i}`}
          geometry={geoms.bottom}
          material={crateWood}
          position={t.position}
          rotation={t.rotation}
          castShadow
          receiveShadow
        />
      ))}

      {sleeves.map((s, i) => (
        <group
          key={`lp${i}`}
          position={[s.x, SLEEVE_REST_Y, s.z]}
          rotation={[-s.lean, s.yaw, s.roll]}
        >
          <mesh
            geometry={geoms.sleeve}
            material={[
              covers[i].edge,
              covers[i].edge,
              covers[i].edge,
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

      <group position={[0.035, 0.001, OUT_BASE_Z]} rotation={[-OUT_LEAN, 0.05, 0.012]}>
        <mesh
          geometry={geoms.sleeve}
          material={[
            outside.edge,
            outside.edge,
            outside.edge,
            outside.edge,
            outside.front,
            outside.edge
          ]}
          position={[0, SLEEVE / 2, 0]}
          castShadow
          receiveShadow
        />
        <mesh
          position={[0.005, SLEEVE - 0.15 + 0.01, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          material={outside.vinyl}
          castShadow
        >
          <cylinderGeometry args={[0.15, 0.15, 0.0022, 48]} />
        </mesh>
      </group>
    </group>
  );
}
