"use client";

import { useMemo } from "react";
import * as THREE from "three";
import {
  makeCanvasTexture,
  plasticMaterial,
  woodMaterial
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

const BOARD_SIZE = 0.3;
const BOARD_THICKNESS = 0.016;
// Playing-surface plane is slightly inset so a lip of the walnut frame shows.
const SURFACE_SIZE = 0.296;
const SURFACE_LIFT = 0.0003;

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

type Part = {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation: [number, number, number];
};

export default function Chessboard() {
  const frameMat = useMemo(
    () => woodMaterial({ base: "#54381f", streak: "#3a2715", roughness: 0.5 }),
    []
  );
  const whiteMat = useMemo(() => plasticMaterial("#e6ddc8", 0.5), []);
  const blackMat = useMemo(() => plasticMaterial("#2b241d", 0.45), []);

  const surfaceTexture = useMemo(
    () =>
      makeCanvasTexture(
        1024,
        1024,
        (ctx, w, h) => {
          const sq = (SQUARE_SIZE / SURFACE_SIZE) * w;
          const grid = sq * 8;
          const m = (w - grid) / 2;

          ctx.fillStyle = "#5a3b20";
          ctx.fillRect(0, 0, w, h);

          for (let i = 0; i < 70; i++) {
            ctx.strokeStyle = "#3a2715";
            ctx.globalAlpha = 0.04 + Math.random() * 0.06;
            ctx.lineWidth = 0.8 + Math.random() * 1.6;
            const y = Math.random() * h;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y + (Math.random() - 0.5) * 14);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;

          // Canvas bottom = local +z = rank 1, so a1 lands dark on the
          // bottom-left, matching squareToLocal.
          for (let f = 0; f < 8; f++) {
            for (let r = 0; r < 8; r++) {
              const x = m + f * sq;
              const y = h - m - (r + 1) * sq;
              ctx.globalAlpha = 1;
              ctx.fillStyle = (f + r) % 2 === 1 ? "#e8dcc3" : "#6b4226";
              ctx.fillRect(x, y, sq + 0.6, sq + 0.6);
              ctx.fillStyle = Math.random() < 0.5 ? "#1c1208" : "#fff6e2";
              ctx.globalAlpha = Math.random() * 0.04;
              ctx.fillRect(x, y, sq + 0.6, sq + 0.6);
            }
          }
          ctx.globalAlpha = 1;

          for (let i = 0; i < 36; i++) {
            ctx.strokeStyle = i % 2 === 0 ? "#2c1c0d" : "#f7ecd4";
            ctx.globalAlpha = 0.018 + Math.random() * 0.02;
            ctx.lineWidth = 0.7 + Math.random() * 1.2;
            const y = m + Math.random() * grid;
            ctx.beginPath();
            ctx.moveTo(m, y);
            ctx.lineTo(m + grid, y + (Math.random() - 0.5) * 8);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;

          ctx.strokeStyle = "#cdb189";
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 2.4;
          ctx.strokeRect(m - 5, m - 5, grid + 10, grid + 10);
          ctx.lineWidth = 1.1;
          ctx.globalAlpha = 0.45;
          ctx.strokeRect(m - 10, m - 10, grid + 20, grid + 20);

          ctx.fillStyle = "#c4a678";
          ctx.globalAlpha = 0.5;
          ctx.font = "26px Georgia, 'Times New Roman', serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (let f = 0; f < 8; f++) {
            ctx.fillText(FILES.charAt(f), m + (f + 0.5) * sq, h - (m - 10) / 2);
          }
          for (let r = 0; r < 8; r++) {
            ctx.fillText(String(r + 1), (m - 10) / 2, h - m - (r + 0.5) * sq);
          }
          ctx.globalAlpha = 1;
        },
        { anisotropy: 8 }
      ),
    []
  );

  const surfaceMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: surfaceTexture,
        roughness: 0.42,
        metalness: 0.03
      }),
    [surfaceTexture]
  );

  const partsByKind = useMemo<Record<PieceKind, Part[]>>(() => {
    const part = (
      geometry: THREE.BufferGeometry,
      position: [number, number, number],
      rotation: [number, number, number] = [0, 0, 0]
    ): Part => ({ geometry, position, rotation });
    const cyl = (rTop: number, rBottom: number, height: number) =>
      new THREE.CylinderGeometry(rTop, rBottom, height, 20);
    const sph = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
    const box = (x: number, y: number, z: number) =>
      new THREE.BoxGeometry(x, y, z);
    const ringFlat: [number, number, number] = [Math.PI / 2, 0, 0];

    const pawn: Part[] = [
      part(cyl(0.0091, 0.01, 0.0035), [0, 0.00175, 0]),
      part(cyl(0.0035, 0.008, 0.0165), [0, 0.0118, 0]),
      part(sph(0.0042), [0, 0.0238, 0])
    ];

    const crenel = box(0.004, 0.0042, 0.0034);
    const rook: Part[] = [
      part(cyl(0.0101, 0.0111, 0.004), [0, 0.002, 0]),
      part(cyl(0.0072, 0.0092, 0.0215), [0, 0.01475, 0]),
      part(cyl(0.0087, 0.0077, 0.005), [0, 0.0275, 0]),
      ...[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2;
        return part(
          crenel,
          [Math.sin(a) * 0.0058, 0.0318, Math.cos(a) * 0.0058],
          [0, a, 0]
        );
      })
    ];

    // Knight is built facing +z; placement yaws white knights by PI so both
    // sides look across the board.
    const ear = box(0.0024, 0.0048, 0.0026);
    const knight: Part[] = [
      part(cyl(0.0095, 0.0105, 0.004), [0, 0.002, 0]),
      part(cyl(0.0054, 0.0084, 0.025), [0, 0.0157, 0.0023], [0.35, 0, 0]),
      part(box(0.0092, 0.008, 0.017), [0, 0.0305, 0.0058], [0.62, 0, 0]),
      part(ear, [0.0022, 0.0378, -0.0012], [0.25, 0, 0]),
      part(ear, [-0.0022, 0.0378, -0.0012], [0.25, 0, 0])
    ];

    const bishop: Part[] = [
      part(cyl(0.0097, 0.0107, 0.004), [0, 0.002, 0]),
      part(cyl(0.0036, 0.0086, 0.0245), [0, 0.01625, 0]),
      part(new THREE.TorusGeometry(0.0042, 0.0012, 8, 18), [0, 0.0288, 0], ringFlat),
      part(new THREE.ConeGeometry(0.0052, 0.0105, 20), [0, 0.0338, 0]),
      part(sph(0.0019, 10, 7), [0, 0.0399, 0])
    ];

    const queen: Part[] = [
      part(cyl(0.0107, 0.0117, 0.0045), [0, 0.00225, 0]),
      part(cyl(0.004, 0.0094, 0.034), [0, 0.0215, 0]),
      part(new THREE.TorusGeometry(0.0046, 0.0014, 8, 18), [0, 0.0398, 0], ringFlat),
      part(sph(0.0036), [0, 0.0455, 0])
    ];

    const king: Part[] = [
      part(cyl(0.0111, 0.0121, 0.0045), [0, 0.00225, 0]),
      part(cyl(0.0042, 0.0098, 0.036), [0, 0.0225, 0]),
      part(sph(0.0038), [0, 0.0432, 0]),
      part(box(0.0016, 0.0078, 0.0016), [0, 0.0505, 0]),
      part(box(0.005, 0.0016, 0.0016), [0, 0.0512, 0])
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
        const facing =
          piece.kind === "knight" && piece.color === "white" ? Math.PI : 0;
        return {
          piece,
          position: [
            x + jx,
            BOARD_THICKNESS + SURFACE_LIFT,
            z + jz
          ] as [number, number, number],
          yaw: facing + jitterYaw
        };
      }),
    []
  );

  return (
    <group>
      <mesh
        position={[0, BOARD_THICKNESS / 2, 0]}
        castShadow
        receiveShadow
        material={frameMat}
      >
        <boxGeometry args={[BOARD_SIZE, BOARD_THICKNESS, BOARD_SIZE]} />
      </mesh>
      <mesh
        position={[0, BOARD_THICKNESS + SURFACE_LIFT, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        material={surfaceMat}
      >
        <planeGeometry args={[SURFACE_SIZE, SURFACE_SIZE]} />
      </mesh>
      {placements.map(({ piece, position, yaw }) => (
        <group key={piece.square} position={position} rotation={[0, yaw, 0]}>
          {partsByKind[piece.kind].map((p, i) => (
            <mesh
              key={i}
              geometry={p.geometry}
              material={piece.color === "white" ? whiteMat : blackMat}
              position={p.position}
              rotation={p.rotation}
              castShadow
            />
          ))}
        </group>
      ))}
    </group>
  );
}
