"use client";

import { useMemo } from "react";
import * as THREE from "three";
import {
  brushedMetalMaterial,
  makeCanvasTexture,
  woodMaterial
} from "@/lib/three/materials";
import { BOOKS, type Book, type BookShelfName } from "@/content/books";

const WIDTH = 0.46;
const DEPTH = 0.165;
const SIDE_T = 0.016;
const BOARD_T = 0.015;
const BACK_T = 0.006;
const BAY_CLEARANCE = 0.012;
const BOOK_DEPTH = 0.15;
const BOOK_GAP = 0.002;

// Bay heights derive from the book data: two hardcover rows physically need
// more than the nominal 0.43m carcass, so the shelf grows to fit its contents.
function shelfMaxHeight(shelf: BookShelfName): number {
  return BOOKS.reduce((m, b) => (b.shelf === shelf ? Math.max(m, b.heightM) : m), 0);
}

const BOTTOM_BAY = shelfMaxHeight("current") + BAY_CLEARANCE;
const TOP_BAY = shelfMaxHeight("favorites") + BAY_CLEARANCE;
const BOTTOM_SHELF_Y = BOARD_T;
const TOP_SHELF_Y = BOARD_T + BOTTOM_BAY + BOARD_T;
const MID_BOARD_Y = BOARD_T + BOTTOM_BAY + BOARD_T / 2;
const SIDE_H = TOP_SHELF_Y + TOP_BAY;
const TOTAL_H = SIDE_H + BOARD_T;
const INNER_W = WIDTH - 2 * SIDE_T;
const BOOK_BASE_Z = -DEPTH / 2 + BACK_T + 0.004 + BOOK_DEPTH / 2;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shelfOrder(shelf: BookShelfName): Book[] {
  const real = BOOKS.filter((b) => b.shelf === shelf && !b.filler);
  const filler = BOOKS.filter((b) => b.shelf === shelf && b.filler);
  const order: Book[] = [];
  for (let i = 0; i < Math.max(real.length, filler.length); i++) {
    const r = real[i];
    if (r) order.push(r);
    const f = filler[i];
    if (f) order.push(f);
  }
  return order;
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  startPx: number,
  maxWidth: number,
  font: (px: number) => string
): void {
  let px = startPx;
  ctx.font = font(px);
  while (px > 28 && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = font(px);
  }
}

function spineTexture(book: Book, seed: number): THREE.CanvasTexture {
  return makeCanvasTexture(256, 1024, (ctx, w, h) => {
    ctx.fillStyle = book.spineColor;
    ctx.fillRect(0, 0, w, h);

    const edge = ctx.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, "rgba(0,0,0,0.34)");
    edge.addColorStop(0.14, "rgba(0,0,0,0)");
    edge.addColorStop(0.86, "rgba(0,0,0,0)");
    edge.addColorStop(1, "rgba(0,0,0,0.34)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = book.textColor;
    ctx.globalAlpha = 0.88;
    ctx.fillRect(w * 0.16, 54, w * 0.68, 5);
    ctx.fillRect(w * 0.16, 70, w * 0.68, 3);
    ctx.fillRect(w * 0.16, h - 74, w * 0.68, 3);
    ctx.fillRect(w * 0.16, h - 58, w * 0.68, 5);
    ctx.globalAlpha = 1;

    const scuff = mulberry32(seed);
    ctx.fillStyle = "#000000";
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = 0.04 + scuff() * 0.06;
      ctx.fillRect(scuff() * w * 0.5, h - 40 - scuff() * 130, w * (0.2 + scuff() * 0.35), 2);
    }
    ctx.globalAlpha = 1;

    if (book.filler) return;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = book.textColor;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    // local +x runs down the spine; tilt-your-head-right US spine convention
    ctx.rotate(Math.PI / 2);
    fitText(ctx, book.title, 72, h * 0.48, (px) => `bold ${px}px Georgia, "Times New Roman", serif`);
    ctx.fillText(book.title, -h * 0.12, 0);
    fitText(ctx, book.author, 44, h * 0.29, (px) => `${px}px Georgia, "Times New Roman", serif`);
    ctx.fillText(book.author, h * 0.27, 0);
    ctx.restore();
  });
}

function plaqueTexture(label: string): THREE.CanvasTexture {
  return makeCanvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = "#4a3420";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.strokeStyle = "rgba(232,217,184,0.26)";
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, w - 28, h - 28);

    ctx.font = '40px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const spacing = 14;
    const chars = label.split("");
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let x = (w - total) / 2;
    chars.forEach((c, i) => {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillText(c, x, h / 2 - 2);
      ctx.fillStyle = "#e8d9b8";
      ctx.fillText(c, x, h / 2 + 1);
      x += (widths[i] ?? 0) + spacing;
    });
  });
}

type BookEntry = {
  key: string;
  size: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  materials: THREE.Material[];
};

type MetalPart = {
  key: string;
  size: [number, number, number];
  position: [number, number, number];
};

export default function Bookshelf() {
  const carcassWood = useMemo(
    () => woodMaterial({ base: "#5d4126", streak: "#46301b", roughness: 0.58 }),
    []
  );
  const backWood = useMemo(
    () => woodMaterial({ base: "#523a22", streak: "#3e2b18", roughness: 0.7 }),
    []
  );
  const metal = useMemo(() => brushedMetalMaterial(), []);

  const plaqueMaterials = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color: "#332313", roughness: 0.6 });
    const make = (label: string): THREE.Material[] => {
      const face = new THREE.MeshStandardMaterial({
        map: plaqueTexture(label),
        roughness: 0.5,
        metalness: 0.05
      });
      return [side, side, side, side, face, side];
    };
    return { favorites: make("favorites"), current: make("current") };
  }, []);

  const { books, metalParts } = useMemo(() => {
    const rand = mulberry32(20260610);
    const pagesTop = new THREE.MeshStandardMaterial({ color: "#e8ddc4", roughness: 0.92 });
    const pagesEdge = new THREE.MeshStandardMaterial({ color: "#ddd0b4", roughness: 0.94 });

    const entries: BookEntry[] = [];
    const parts: MetalPart[] = [];
    const shelves: { name: BookShelfName; surfaceY: number }[] = [
      { name: "favorites", surfaceY: TOP_SHELF_Y },
      { name: "current", surfaceY: BOTTOM_SHELF_Y }
    ];

    let bookIndex = 0;
    for (const shelf of shelves) {
      const order = shelfOrder(shelf.name);
      const leanAngle = 0.105 + rand() * 0.03;
      // lean candidate: shorter than its right neighbor so the tipped top
      // corner lands on the neighbor's face, not above it
      let leanIndex = -1;
      for (let i = 0; i < order.length - 1; i++) {
        const b = order[i];
        const next = order[i + 1];
        if (
          b &&
          next &&
          b.heightM * Math.cos(leanAngle) + b.thicknessM * Math.sin(leanAngle) <
            next.heightM - 0.002
        ) {
          leanIndex = i;
          break;
        }
      }

      let cursor = -WIDTH / 2 + SIDE_T + 0.003;
      order.forEach((book, i) => {
        const t = book.thicknessM;
        const bh = book.heightM;
        const spine = new THREE.MeshStandardMaterial({
          map: spineTexture(book, 31 + bookIndex * 17),
          roughness: 0.7,
          metalness: 0
        });
        const cover = new THREE.MeshStandardMaterial({
          color: new THREE.Color(book.spineColor).multiplyScalar(0.82),
          roughness: 0.72
        });
        // box face order +x,-x,+y,-y,+z,-z: covers on the sides, page block
        // on top/bottom/fore-edge, printed spine facing out (+z)
        const materials = [cover, cover, pagesTop, pagesEdge, spine, pagesEdge];
        const z = BOOK_BASE_Z + (rand() - 0.5) * 0.007;

        if (i === leanIndex) {
          // rotated footprint keeps the tipped book clear of both neighbors;
          // base rests on its bottom edge, top corner kisses the next spine
          const footprint = t * Math.cos(leanAngle) + bh * Math.sin(leanAngle);
          entries.push({
            key: `${shelf.name}-${i}`,
            size: [t, bh, BOOK_DEPTH],
            position: [
              cursor + footprint / 2,
              shelf.surfaceY + (bh * Math.cos(leanAngle) + t * Math.sin(leanAngle)) / 2,
              z
            ],
            rotation: [0, 0, -leanAngle],
            materials
          });
          cursor += footprint + 0.0006;
        } else {
          entries.push({
            key: `${shelf.name}-${i}`,
            size: [t, bh, BOOK_DEPTH],
            position: [cursor + t / 2, shelf.surfaceY + bh / 2, z],
            rotation: [0, (rand() - 0.5) * 0.02, 0],
            materials
          });
          cursor += t + BOOK_GAP;
        }
        bookIndex++;
      });

      const endX = cursor - BOOK_GAP + 0.0006;
      parts.push({
        key: `${shelf.name}-bookend-upright`,
        size: [0.003, 0.135, 0.115],
        position: [endX + 0.0015, shelf.surfaceY + 0.0675, BOOK_BASE_Z]
      });
      parts.push({
        key: `${shelf.name}-bookend-base`,
        size: [0.082, 0.0025, 0.115],
        position: [endX + 0.003 + 0.041, shelf.surfaceY + 0.00125, BOOK_BASE_Z]
      });
    }

    return { books: entries, metalParts: parts };
  }, []);

  const sideX = WIDTH / 2 - SIDE_T / 2;

  return (
    <group>
      <mesh position={[-sideX, SIDE_H / 2, 0]} castShadow receiveShadow material={carcassWood}>
        <boxGeometry args={[SIDE_T, SIDE_H, DEPTH]} />
      </mesh>
      <mesh position={[sideX, SIDE_H / 2, 0]} castShadow receiveShadow material={carcassWood}>
        <boxGeometry args={[SIDE_T, SIDE_H, DEPTH]} />
      </mesh>
      <mesh position={[0, BOARD_T / 2, BACK_T / 2]} castShadow receiveShadow material={carcassWood}>
        <boxGeometry args={[INNER_W, BOARD_T, DEPTH - BACK_T]} />
      </mesh>
      <mesh position={[0, MID_BOARD_Y, BACK_T / 2]} castShadow receiveShadow material={carcassWood}>
        <boxGeometry args={[INNER_W, BOARD_T, DEPTH - BACK_T]} />
      </mesh>
      <mesh
        position={[0, SIDE_H + BOARD_T / 2, 0.004]}
        castShadow
        receiveShadow
        material={carcassWood}
      >
        <boxGeometry args={[WIDTH + 0.014, BOARD_T, DEPTH + 0.008]} />
      </mesh>
      <mesh position={[0, SIDE_H / 2, -DEPTH / 2 + BACK_T / 2]} castShadow material={backWood}>
        <boxGeometry args={[INNER_W, SIDE_H - 0.006, BACK_T]} />
      </mesh>

      <mesh position={[0, MID_BOARD_Y, DEPTH / 2 + 0.0011]} material={plaqueMaterials.favorites}>
        <boxGeometry args={[0.06, 0.0115, 0.0022]} />
      </mesh>
      <mesh position={[0, BOARD_T / 2, DEPTH / 2 + 0.0011]} material={plaqueMaterials.current}>
        <boxGeometry args={[0.06, 0.0115, 0.0022]} />
      </mesh>

      {books.map((b) => (
        <mesh
          key={b.key}
          position={b.position}
          rotation={b.rotation}
          castShadow
          receiveShadow
          material={b.materials}
        >
          <boxGeometry args={b.size} />
        </mesh>
      ))}

      {metalParts.map((p) => (
        <mesh key={p.key} position={p.position} castShadow material={metal}>
          <boxGeometry args={p.size} />
        </mesh>
      ))}
    </group>
  );
}

export { TOTAL_H as BOOKSHELF_HEIGHT };
