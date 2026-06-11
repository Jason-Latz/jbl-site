"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  feltMaterial,
  lacquerMaterial,
  lacqueredWoodMaterial,
  makeCanvasTexture
} from "@/lib/three/materials";
import { useDeskTheme } from "../DeskThemeContext";

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

const FEN_KINDS: Record<string, PieceKind> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king"
};

// Hand-rolled FEN placement parser so chess.js never rides along in the 3D
// bundle. Accepts a full FEN or just the placement field; returns null on
// anything malformed so callers can fall back to START_POSITION.
export function parseFenPlacement(fen: string): Piece[] | null {
  const placement = fen.trim().split(/\s+/)[0];
  if (!placement) return null;
  const ranks = placement.split("/");
  if (ranks.length !== 8) return null;
  const pieces: Piece[] = [];
  for (let r = 0; r < 8; r++) {
    const rank = 8 - r;
    const row = ranks[r];
    let file = 0;
    for (let c = 0; c < row.length; c++) {
      const ch = row.charAt(c);
      if (ch >= "1" && ch <= "8") {
        file += ch.charCodeAt(0) - 48;
      } else {
        const kind = FEN_KINDS[ch.toLowerCase()];
        if (!kind || file > 7) return null;
        pieces.push({
          kind,
          color: ch === ch.toUpperCase() ? "white" : "black",
          square: `${FILES.charAt(file)}${rank}`
        });
        file += 1;
      }
    }
    if (file !== 8) return null;
  }
  return pieces;
}

function isSquare(s: string): boolean {
  return (
    s.length === 2 &&
    s.charAt(0) >= "a" &&
    s.charAt(0) <= "h" &&
    s.charAt(1) >= "1" &&
    s.charAt(1) <= "8"
  );
}

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

type PieceColor = Piece["color"];

type Transform = {
  pos: [number, number, number];
  rot: [number, number, number];
};

// A roster of persistent "actors" keeps piece identity across FEN updates so
// moves read as a hand carrying a piece, not a teleport. Targets live on the
// actor; useFrame eases current toward target with a pick-up arc.
type Actor = {
  id: number;
  kind: PieceKind; // mutable: a promoted pawn simply becomes its new self
  color: PieceColor;
  alt: boolean; // which of the two wood batches this piece was turned from
  square: string | null; // null = retired to the graveyard
  capturedIndex: number | null;
  // target / travel-start / current transform components
  tx: number; ty: number; tz: number;
  tTiltX: number; tYaw: number; tTiltZ: number;
  fx: number; fy: number; fz: number;
  fTiltX: number; fYaw: number; fTiltZ: number;
  cx: number; cy: number; cz: number;
  cTiltX: number; cYaw: number; cTiltZ: number;
  t: number; // travel clock in seconds; negative while waiting its turn
  duration: number;
  arc: number; // lift height at mid-travel
  settled: boolean;
};

// Captured pieces retire to two neat rows per flank just past the frame
// molding (outer half-extent 0.1616): white's fallen on the queenside flank,
// black's on the kingside, filling front-to-back in capture order.
const GRAVE_SPACING = SQUARE_SIZE * 0.8;
const GRAVE_X0 = 0.1796;

function boardTransform(
  kind: PieceKind,
  color: PieceColor,
  square: string
): Transform {
  const [x, z] = squareToLocal(square);
  const jx = (hash01(`${square}:x`) - 0.5) * 0.0022;
  const jz = (hash01(`${square}:z`) - 0.5) * 0.0022;
  const jitterYaw = (hash01(`${square}:r`) - 0.5) * 0.2;
  // Hand-set pieces never sit perfectly plumb on their felt.
  const tiltX = (hash01(`${square}:tx`) - 0.5) * 0.014;
  const tiltZ = (hash01(`${square}:tz`) - 0.5) * 0.014;
  // Knights' heads and bishops' mitre cuts face the opponent.
  const facing =
    (kind === "knight" || kind === "bishop") && color === "white"
      ? Math.PI
      : 0;
  return {
    pos: [x + jx, BOARD_THICKNESS + SURFACE_LIFT + PIECE_LIFT, z + jz],
    rot: [tiltX, facing + jitterYaw, tiltZ]
  };
}

function graveyardTransform(
  kind: PieceKind,
  color: PieceColor,
  slot: number
): Transform {
  const row = Math.floor(slot / 8);
  const col = slot % 8;
  const side = color === "white" ? -1 : 1;
  const seed = `grave:${color}:${slot}`;
  const jx = (hash01(`${seed}:x`) - 0.5) * 0.004;
  const jz = (hash01(`${seed}:z`) - 0.5) * 0.004;
  const yaw = (hash01(`${seed}:r`) - 0.5) * 0.5;
  const tiltX = (hash01(`${seed}:tx`) - 0.5) * 0.014;
  const tiltZ = (hash01(`${seed}:tz`) - 0.5) * 0.014;
  const facing =
    (kind === "knight" || kind === "bishop") && color === "white"
      ? Math.PI
      : 0;
  return {
    // Off the board the felt sits on the desk itself, a step down.
    pos: [
      side * (GRAVE_X0 + row * GRAVE_SPACING) + jx,
      PIECE_LIFT,
      (3.5 - col) * GRAVE_SPACING + jz
    ],
    rot: [tiltX, facing + yaw, tiltZ]
  };
}

function createActor(id: number, piece: Piece): Actor {
  const { pos, rot } = boardTransform(piece.kind, piece.color, piece.square);
  return {
    id,
    kind: piece.kind,
    color: piece.color,
    alt: hash01(`${piece.square}:m`) < 0.5,
    square: piece.square,
    capturedIndex: null,
    tx: pos[0], ty: pos[1], tz: pos[2],
    tTiltX: rot[0], tYaw: rot[1], tTiltZ: rot[2],
    fx: pos[0], fy: pos[1], fz: pos[2],
    fTiltX: rot[0], fYaw: rot[1], fTiltZ: rot[2],
    cx: pos[0], cy: pos[1], cz: pos[2],
    cTiltX: rot[0], cYaw: rot[1], cTiltZ: rot[2],
    t: 0,
    duration: 1,
    arc: 0,
    settled: true
  };
}

function retarget(a: Actor, next: Transform, snap: boolean, delay: number) {
  const eps = 1e-7;
  if (
    Math.abs(a.tx - next.pos[0]) < eps &&
    Math.abs(a.ty - next.pos[1]) < eps &&
    Math.abs(a.tz - next.pos[2]) < eps &&
    Math.abs(a.tYaw - next.rot[1]) < eps
  ) {
    return; // already headed there — keep flying
  }
  a.tx = next.pos[0]; a.ty = next.pos[1]; a.tz = next.pos[2];
  a.tTiltX = next.rot[0]; a.tYaw = next.rot[1]; a.tTiltZ = next.rot[2];
  if (snap) {
    a.fx = a.cx = a.tx; a.fy = a.cy = a.ty; a.fz = a.cz = a.tz;
    a.fTiltX = a.cTiltX = a.tTiltX;
    a.fYaw = a.cYaw = a.tYaw;
    a.fTiltZ = a.cTiltZ = a.tTiltZ;
    a.t = 0;
    a.arc = 0;
    a.settled = true;
    return;
  }
  a.fx = a.cx; a.fy = a.cy; a.fz = a.cz;
  a.fTiltX = a.cTiltX; a.fYaw = a.cYaw; a.fTiltZ = a.cTiltZ;
  const dist = Math.hypot(a.tx - a.fx, a.tz - a.fz);
  // Longer reaches take a touch longer; tiny shuffles stay quick and low.
  a.duration = THREE.MathUtils.clamp(0.45 + dist * 0.8, 0.5, 0.72);
  a.arc = 0.012 * THREE.MathUtils.clamp(dist / SQUARE_SIZE, 0.35, 1);
  a.t = -delay;
  a.settled = false;
}

function squareDist(a: string, b: string): number {
  return Math.hypot(
    a.charCodeAt(0) - b.charCodeAt(0),
    a.charCodeAt(1) - b.charCodeAt(1)
  );
}

// Reconcile the roster against the next position. lastMove pins the primary
// mover first; exact stays, then greedy nearest-distance passes cover
// castling's second mover, resurrections (new game), and promotions. Pieces
// left unmatched were captured and head for the graveyard — so the captured
// set is exactly full-set-minus-board, derivable from the FEN alone.
function advanceRoster(
  roster: Actor[],
  next: Piece[],
  lastMove: { from: string; to: string } | null,
  snap: boolean
) {
  const taken = new Array<boolean>(next.length).fill(false);
  const claimed = new Set<number>();
  const assignments: {
    actor: Actor;
    piece: Piece;
    viaLastMove: boolean;
    fromGrave: boolean;
  }[] = [];
  const bySquare = new Map<string, Actor>();
  for (const a of roster) {
    if (a.square) bySquare.set(a.square, a);
  }

  const claim = (actor: Actor, i: number, viaLastMove = false) => {
    claimed.add(actor.id);
    taken[i] = true;
    assignments.push({
      actor,
      piece: next[i],
      viaLastMove,
      fromGrave: actor.square === null
    });
  };

  // 0. The reported move maps its mover directly (also covers promotion,
  //    where the arriving piece is a different kind than the pawn that left).
  if (lastMove && isSquare(lastMove.from) && isSquare(lastMove.to)) {
    const mover = bySquare.get(lastMove.from);
    const i = next.findIndex((p) => p.square === lastMove.to);
    if (mover && i >= 0 && next[i].color === mover.color) {
      claim(mover, i, true);
    }
  }

  // 1. Pieces that didn't move.
  next.forEach((p, i) => {
    if (taken[i]) return;
    const a = bySquare.get(p.square);
    if (a && !claimed.has(a.id) && a.kind === p.kind && a.color === p.color) {
      claim(a, i);
    }
  });

  const greedy = (ok: (a: Actor, p: Piece) => boolean) => {
    const pairs: { d: number; a: Actor; i: number }[] = [];
    next.forEach((p, i) => {
      if (taken[i]) return;
      for (const a of roster) {
        if (claimed.has(a.id) || !ok(a, p)) continue;
        const d = a.square
          ? squareDist(a.square, p.square)
          : 20 + (a.capturedIndex ?? 0);
        pairs.push({ d, a, i });
      }
    });
    pairs.sort((m, n) => m.d - n.d);
    for (const pair of pairs) {
      if (claimed.has(pair.a.id) || taken[pair.i]) continue;
      claim(pair.a, pair.i);
    }
  };

  // 2. Same piece, shortest travel — castling's rook lands here.
  greedy((a, p) => a.square !== null && a.kind === p.kind && a.color === p.color);
  // 3. New game: the fallen march back from the graveyard.
  greedy((a, p) => a.square === null && a.kind === p.kind && a.color === p.color);
  // 4. Promotion without a move hint: a pawn returns as something grander.
  greedy(
    (a, p) =>
      a.square !== null &&
      a.color === p.color &&
      a.kind === "pawn" &&
      p.kind !== "pawn" &&
      p.kind !== "king"
  );
  greedy((a, p) => a.square === null && a.color === p.color && p.kind !== "king");
  // 5. Absolute last resort for positions we can't otherwise reconcile.
  greedy((a, p) => a.color === p.color);

  // 6. Safety net: a FEN stranger than the full set mints a fresh actor.
  next.forEach((p, i) => {
    if (taken[i]) return;
    const a = createActor(roster.length, p);
    roster.push(a);
    claimed.add(a.id);
  });

  const anyPrimary = assignments.some(
    (s) => s.viaLastMove && s.actor.square !== s.piece.square
  );
  let resurrections = 0;
  for (const s of assignments) {
    const moved = s.actor.square !== s.piece.square;
    s.actor.kind = s.piece.kind;
    if (moved) {
      // The known mover leads; a castling rook follows a beat behind; a
      // new game's pieces stream home one after another.
      const delay = snap
        ? 0
        : s.fromGrave
          ? 0.1 + 0.05 * resurrections++
          : s.viaLastMove
            ? 0
            : anyPrimary
              ? 0.12
              : 0;
      retarget(
        s.actor,
        boardTransform(s.actor.kind, s.actor.color, s.piece.square),
        snap,
        Math.min(delay, 0.9)
      );
    }
    s.actor.square = s.piece.square;
    s.actor.capturedIndex = null;
  }

  // Whoever is left on the board was just captured: lowest free slot on
  // their flank, departing just after the conqueror arrives.
  const usedSlots: Record<PieceColor, Set<number>> = {
    white: new Set(),
    black: new Set()
  };
  for (const a of roster) {
    if (a.capturedIndex !== null) usedSlots[a.color].add(a.capturedIndex);
  }
  let captures = 0;
  for (const a of roster) {
    if (a.square === null || claimed.has(a.id)) continue;
    let slot = 0;
    while (usedSlots[a.color].has(slot)) slot++;
    usedSlots[a.color].add(slot);
    a.square = null;
    a.capturedIndex = slot;
    retarget(
      a,
      graveyardTransform(a.kind, a.color, slot),
      snap,
      snap ? 0 : 0.24 + 0.06 * captures++
    );
  }
}

function smootherstep(k: number): number {
  return k * k * k * (k * (k * 6 - 15) + 10);
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
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

// A whisper of coral on the last move's two squares — a thin glowing inlay
// ring with a faint pooled center, like a hot wire under the varnish. Unlit
// (MeshBasicMaterial) so it reads in the lamp-off room too; opacity follows
// the theme mix and blooms in alongside the gliding piece.
function LastMoveGlow({
  lastMove
}: {
  lastMove: { from: string; to: string } | null;
}) {
  const { mixRef } = useDeskTheme();
  const texture = useMemo(
    () =>
      makeCanvasTexture(256, 256, (ctx, w, h) => {
        const coral = "199, 88, 51"; // #c75833
        const pool = ctx.createRadialGradient(
          w / 2,
          h / 2,
          w * 0.04,
          w / 2,
          h / 2,
          w * 0.46
        );
        pool.addColorStop(0, `rgba(${coral}, 0.18)`);
        pool.addColorStop(0.72, `rgba(${coral}, 0.05)`);
        pool.addColorStop(1, `rgba(${coral}, 0)`);
        ctx.fillStyle = pool;
        ctx.fillRect(0, 0, w, h);
        const inset = w * 0.11;
        ctx.strokeStyle = `rgba(${coral}, 0.9)`;
        ctx.lineWidth = w * 0.02;
        ctx.shadowColor = `rgba(${coral}, 0.8)`;
        ctx.shadowBlur = w * 0.05;
        roundedRectPath(ctx, inset, inset, w - inset * 2, h - inset * 2, w * 0.1);
        ctx.stroke();
        ctx.stroke();
      }),
    []
  );
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(SQUARE_SIZE, SQUARE_SIZE),
    []
  );
  const matFrom = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false
      }),
    [texture]
  );
  const matTo = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false
      }),
    [texture]
  );
  const shownRef = useRef<string | null>(null);

  const valid =
    lastMove !== null && isSquare(lastMove.from) && isSquare(lastMove.to);
  const key = valid ? `${lastMove!.from}>${lastMove!.to}` : null;

  useFrame((_, delta) => {
    if (key !== shownRef.current) {
      shownRef.current = key;
      matFrom.opacity = 0;
      matTo.opacity = 0;
    }
    if (!key) return;
    // Quiet enough to live with permanently; the vacated square fainter
    // still. A touch brighter under the lamp so it survives the bright board.
    const peak = THREE.MathUtils.lerp(0.4, 0.56, mixRef.current);
    matTo.opacity = THREE.MathUtils.damp(matTo.opacity, peak, 2.1, delta);
    matFrom.opacity = THREE.MathUtils.damp(
      matFrom.opacity,
      peak * 0.62,
      2.1,
      delta
    );
  });

  if (!valid) return null;
  const [fx, fz] = squareToLocal(lastMove!.from);
  const [tx, tz] = squareToLocal(lastMove!.to);
  const y = BOARD_THICKNESS + SURFACE_LIFT + 0.00018;
  return (
    <group>
      <mesh
        geometry={geometry}
        material={matFrom}
        position={[fx, y, fz]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
      />
      <mesh
        geometry={geometry}
        material={matTo}
        position={[tx, y, tz]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
      />
    </group>
  );
}

export type ChessboardProps = {
  // Full FEN (or just its placement field). null/undefined renders the
  // starting position — the graceful state while the game API loads.
  fen?: string | null;
  // The most recent move; pins piece identity during the diff and gets the
  // coral square marks.
  lastMove?: { from: string; to: string } | null;
};

export default function Chessboard({ fen = null, lastMove = null }: ChessboardProps) {
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

  const parsed = useMemo(() => (fen ? parseFenPlacement(fen) : null), [fen]);
  const lmFrom = lastMove?.from ?? null;
  const lmTo = lastMove?.to ?? null;

  const rosterRef = useRef<Actor[] | null>(null);
  const groupsRef = useRef<Map<number, THREE.Group>>(new Map());
  // The first real FEN snaps pieces into place (a visitor landing mid-game
  // shouldn't watch the whole game replay); every change after that glides.
  const hadFenRef = useRef(false);

  const actors = useMemo(() => {
    if (!rosterRef.current) {
      rosterRef.current = START_POSITION.map((p, i) => createActor(i, p));
    }
    const roster = rosterRef.current;
    if (parsed) {
      const snap = !hadFenRef.current;
      hadFenRef.current = true;
      advanceRoster(
        roster,
        parsed,
        lmFrom && lmTo ? { from: lmFrom, to: lmTo } : null,
        snap
      );
    }
    return roster.slice();
  }, [parsed, lmFrom, lmTo]);

  useFrame((_, delta) => {
    const roster = rosterRef.current;
    if (!roster) return;
    for (let i = 0; i < roster.length; i++) {
      const a = roster[i];
      if (a.settled) continue;
      a.t += delta;
      if (a.t <= 0) continue; // the hand hasn't reached this piece yet
      let k = a.t / a.duration;
      if (k >= 1) {
        k = 1;
        a.settled = true;
      }
      const e = smootherstep(k);
      a.cx = a.fx + (a.tx - a.fx) * e;
      a.cy = a.fy + (a.ty - a.fy) * e;
      a.cz = a.fz + (a.tz - a.fz) * e;
      a.cTiltX = a.fTiltX + (a.tTiltX - a.fTiltX) * e;
      a.cYaw = a.fYaw + (a.tYaw - a.fYaw) * e;
      a.cTiltZ = a.fTiltZ + (a.tTiltZ - a.fTiltZ) * e;
      const g = groupsRef.current.get(a.id);
      if (!g) continue;
      // Picked up, carried in a low arc, set down — never dragged.
      g.position.set(a.cx, a.cy + Math.sin(Math.PI * e) * a.arc, a.cz);
      g.rotation.set(a.cTiltX, a.cYaw, a.cTiltZ);
    }
  });

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
      <LastMoveGlow
        lastMove={lmFrom && lmTo ? { from: lmFrom, to: lmTo } : null}
      />
      {actors.map((a) => {
        const bodyMat =
          a.color === "white"
            ? a.alt
              ? materials.whiteB
              : materials.whiteA
            : a.alt
              ? materials.blackB
              : materials.blackA;
        return (
          <group
            key={a.id}
            ref={(g: THREE.Group | null) => {
              if (g) groupsRef.current.set(a.id, g);
              else groupsRef.current.delete(a.id);
            }}
            position={[a.cx, a.cy, a.cz]}
            rotation={[a.cTiltX, a.cYaw, a.cTiltZ]}
          >
            {partsByKind[a.kind].map((p, i) => (
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
