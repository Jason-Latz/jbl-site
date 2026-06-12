"use client";

// Desk book row — the retired floor bookcase's books come home to the desk.
// All ten verified books (same content/books data: titles, authors, spine art
// — nothing invented, nothing dropped) stand in a single row along the desk's
// back edge, spines facing the viewer (+z). The right end stands flush and
// upright where it will butt against the back gallery rail's corner; the left
// end is open, held by one folded-steel L bookend (dark powder-coat, matte)
// with the last book settled into it at ~9 degrees. Two more books lean
// mid-row, and The Wise Man's Fear is pulled a few millimeters forward out of
// line — the copy that gets reread.
//
// Spine pipeline mirrors FloorBookcase.tsx / Bookshelf.tsx: the four real
// spines keep individual materials with a color pass plus a linear G/B
// response pass (foil glints under its own lobe); the six untitled fillers
// share one spine atlas; covers bake into vertex-tinted batches per finish;
// page blocks and spine caps each merge into one draw. 12 draws all in:
// pages, 3 cover finishes, caps, filler atlas, 4 real spines, bookend steel,
// bookend felt.
//
// Conventions: meters, base at y=0 (sits directly on the desk top), centered
// on the row-footprint origin, row along local x. Everything inside
// 0.511 x 0.165 x 0.24. Export-safe: Standard/Physical materials only.

import { useMemo } from "react";
import * as THREE from "three";
import { mergeBufferGeometries } from "three-stdlib";
import { makeCanvasTexture } from "@/lib/three/materials";
import { BOOKS, type Book } from "@/content/books";

// Declared footprint (the bookend base sets the left edge; The Power Law
// sets the height; spine bulge plus the pulled book set the depth).
const WIDTH = 0.511;
const DEPTH = 0.165;
const HEIGHT = 0.24;

// Book dims shared with the source files so the same data reads the same.
const BOOK_DEPTH = 0.15;
const COVER_T = 0.0022;
const OVERHANG = 0.0025; // cover-board square past the text block

// Nominal book center in z: back covers reach -0.08, the pulled spine
// reaches +0.083 — the footprint stays centered on the origin.
const BOOK_ZC = -0.005;

// Bookend: one folded sheet — felt pad, base plate, upright rising from the
// fold. Base faces away from the books (FloorBookcase convention).
const UP_T = 0.0025;
const UP_H = 0.132;
const UP_D = 0.112;
const BASE_T = 0.0018;
const BASE_L = 0.072;
const BASE_D = 0.096;
const FELT_T = 0.001;
const UP_Y0 = FELT_T + BASE_T; // upright bottom = top of the base fold
const UP_Y_TOP = UP_Y0 + UP_H;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toneColor(hex: string, mul: number): THREE.Color {
  const c = new THREE.Color(hex).multiplyScalar(mul);
  c.r = Math.min(1, c.r);
  c.g = Math.min(1, c.g);
  c.b = Math.min(1, c.b);
  return c;
}

function tone(hex: string, mul: number): string {
  return `#${toneColor(hex, mul).getHexString()}`;
}

// ---------------------------------------------------------------------------
// Cover finishes — same assignment scheme as the source files: real books
// keep their verified bindings, fillers cycle the variety that reads as real.

type Finish = "cloth" | "matte" | "gloss";

const REAL_FINISH: Record<string, Finish> = {
  "The Wise Man's Fear": "cloth", // classic cloth case with gold stamping
  "Moonwalking with Einstein": "gloss", // modern trade jacket, laminated
  "The Power Law": "matte",
  "On the Edge": "matte" // standing here — no flat display copy on the desk
};
const FILLER_FINISHES: Finish[] = ["cloth", "matte", "cloth", "gloss", "cloth", "matte"];

// Spine textures draw twice: a color pass and a linear "response" pass
// encoding roughness in G / metalness in B, so foil type glints under a
// separate lobe from the cover it's stamped into.
type SpinePass = "color" | "response";

const RESP_BASE: Record<Finish, string> = {
  cloth: "rgb(0,212,0)",
  matte: "rgb(0,143,0)",
  gloss: "rgb(0,92,0)"
};

// Bright foil = stamped metal leaf (smooth, metallic). Dark "foil" is gloss
// ink — smooth but dielectric.
function foilResponseInk(foil: string): string {
  const c = new THREE.Color(foil);
  const lum = c.r * 0.35 + c.g * 0.55 + c.b * 0.1;
  return lum > 0.45 ? "rgb(0,66,255)" : "rgb(0,74,0)";
}

// ---------------------------------------------------------------------------
// Geometry helpers

const EPS = 1e-5;

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x, y + r);
  s.lineTo(x, y + h - r);
  s.quadraticCurveTo(x, y + h, x + r, y + h);
  s.lineTo(x + w - r, y + h);
  s.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  s.lineTo(x + w, y + r);
  s.quadraticCurveTo(x + w, y, x + w - r, y);
  s.lineTo(x + r, y);
  s.quadraticCurveTo(x, y, x, y + r);
  return s;
}

type PlateAxis = "x" | "y" | "z";

// A slab with filleted edges (extrude + bevel) whose flat caps carry
// normalized 0..1 UVs. Groups: material 0 = caps, material 1 = edge band.
function plateGeometry(
  w: number,
  h: number,
  t: number,
  radius: number,
  axis: PlateAxis
): THREE.ExtrudeGeometry {
  const r = Math.min(radius, t / 2 - EPS);
  const shape = roundedRectShape(w - r * 2, h - r * 2, EPS);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: t - r * 2,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r - EPS,
    bevelSegments: 3,
    curveSegments: 4
  });
  geo.center();
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (const g of geo.groups) {
    if (g.materialIndex !== 0) continue;
    for (let i = g.start; i < g.start + g.count; i++) {
      uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / h + 0.5);
    }
  }
  if (axis === "x") geo.rotateY(Math.PI / 2);
  if (axis === "y") geo.rotateX(-Math.PI / 2);
  return geo;
}

// Rounded hardcover spine: half-cylinder flattened into a shallow ellipse,
// bulging +z, UVs running u across the fold and v up the book.
function spineGeometry(t: number, h: number, bulge: number): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(t / 2, t / 2, h, 40, 1, true, -Math.PI / 2, Math.PI);
  g.scale(1, 1, bulge / (t / 2));
  return g;
}

function spineCapGeometry(t: number, bulge: number): THREE.CircleGeometry {
  const g = new THREE.CircleGeometry(t / 2, 20, 0, Math.PI);
  g.rotateX(Math.PI / 2);
  g.scale(1, 1, bulge / (t / 2));
  return g;
}

// One merged geometry per material — the whole batching strategy lives here.
// Parts may carry per-material-group colors (cover tint vs darker edge band,
// page top vs deckle) which land in a vertex color attribute.
type BakedPart = {
  geometry: THREE.BufferGeometry;
  matrix?: THREE.Matrix4;
  colors?: THREE.Color[]; // indexed by group materialIndex; last entry clamps
};

const WHITE = new THREE.Color("#ffffff");

function bakeParts(parts: BakedPart[], label: string): THREE.BufferGeometry {
  const geos = parts.map((p) => {
    const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
    if (p.colors) {
      const count = (g.attributes.position as THREE.BufferAttribute).count;
      const arr = new Float32Array(count * 3);
      const groups =
        g.groups.length > 0 ? g.groups : [{ start: 0, count, materialIndex: 0 }];
      for (const grp of groups) {
        const c =
          p.colors[Math.min(grp.materialIndex ?? 0, p.colors.length - 1)] ?? WHITE;
        for (let i = grp.start; i < grp.start + grp.count; i++) {
          arr[i * 3] = c.r;
          arr[i * 3 + 1] = c.g;
          arr[i * 3 + 2] = c.b;
        }
      }
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    }
    if (p.matrix) g.applyMatrix4(p.matrix);
    return g;
  });
  const merged = mergeBufferGeometries(geos);
  if (!merged) {
    throw new Error(`DeskBookRow: ${label} merge failed.`);
  }
  return merged;
}

function bookMatrix(
  position: [number, number, number],
  rotation: [number, number, number]
): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation));
  m.setPosition(position[0], position[1], position[2]);
  return m;
}

// ---------------------------------------------------------------------------
// Canvas textures (book passes mirror FloorBookcase.tsx / Bookshelf.tsx)

function pageEdgeTexture(seed: number): THREE.CanvasTexture {
  return makeCanvasTexture(
    1024,
    512,
    (ctx, w, h) => {
      const rnd = mulberry32(seed);
      ctx.fillStyle = "#efe6cd";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = rnd() > 0.5 ? "rgba(146,116,72,0.05)" : "rgba(255,250,235,0.07)";
        ctx.fillRect(rnd() * w, 0, 6 + rnd() * 50, h);
      }
      for (let i = 0; i < 1400; i++) {
        ctx.globalAlpha = 0.05 + rnd() * 0.13;
        ctx.fillStyle = rnd() > 0.42 ? "#9a8157" : "#fffaf0";
        ctx.fillRect(rnd() * w, 0, 1, h);
      }
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(120,90,50,0.16)");
      g.addColorStop(0.12, "rgba(120,90,50,0)");
      g.addColorStop(0.88, "rgba(120,90,50,0)");
      g.addColorStop(1, "rgba(120,90,50,0.16)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { anisotropy: 8 }
  );
}

function clothTexture(seed: number): THREE.CanvasTexture {
  return makeCanvasTexture(
    512,
    512,
    (ctx, w, h) => {
      const rnd = mulberry32(seed);
      ctx.fillStyle = "#dcd7cd";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) {
        ctx.globalAlpha = 0.04 + rnd() * 0.05;
        ctx.fillStyle = rnd() > 0.5 ? "#b8b1a3" : "#f5f0e7";
        ctx.fillRect(0, y, w, 1);
      }
      for (let x = 0; x < w; x += 3) {
        ctx.globalAlpha = 0.04 + rnd() * 0.05;
        ctx.fillStyle = rnd() > 0.5 ? "#b8b1a3" : "#f3eee5";
        ctx.fillRect(x, 0, 1, h);
      }
      for (let i = 0; i < 900; i++) {
        ctx.globalAlpha = 0.03 + rnd() * 0.04;
        ctx.fillStyle = rnd() > 0.5 ? "#a59d8d" : "#ffffff";
        ctx.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
    },
    { repeat: [1, 1], anisotropy: 8 }
  );
}

function fitPx(
  ctx: CanvasRenderingContext2D,
  text: string,
  startPx: number,
  maxWidth: number,
  font: (px: number) => string
): number {
  let px = startPx;
  ctx.font = font(px);
  while (px > 22 && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = font(px);
  }
  return px;
}

// Foil/ink lettering: offset under-shadow plus a vertical sheen gradient so
// the type reads stamped instead of printed; the response pass lays the same
// glyphs down flat in G/B response ink.
function drawFoil(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  px: number,
  foil: string,
  pass: SpinePass = "color"
): void {
  if (pass === "response") {
    ctx.fillStyle = foilResponseInk(foil);
    ctx.fillText(text, x, y);
    return;
  }
  const c = new THREE.Color(foil);
  const lum = c.r * 0.35 + c.g * 0.55 + c.b * 0.1;
  ctx.fillStyle = lum > 0.45 ? "rgba(18,8,2,0.55)" : "rgba(255,246,224,0.42)";
  ctx.fillText(text, x + 2, y + 2.4);
  const g = ctx.createLinearGradient(0, y - px * 0.55, 0, y + px * 0.45);
  g.addColorStop(0, tone(foil, 1.38));
  g.addColorStop(0.45, foil);
  g.addColorStop(1, tone(foil, 0.7));
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
}

function drawColophon(
  ctx: CanvasRenderingContext2D,
  foil: string,
  pass: SpinePass = "color"
): void {
  const ink = pass === "color" ? foil : foilResponseInk(foil);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(14, 0);
  ctx.lineTo(0, 20);
  ctx.lineTo(-14, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Both passes consume the rng in the same order, so wear that darkens is the
// same wear that scatters the gloss.
function spineBase(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  book: Book,
  rnd: () => number,
  pass: SpinePass = "color",
  finish: Finish = "cloth"
): void {
  ctx.fillStyle = pass === "color" ? book.spineColor : RESP_BASE[finish];
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    ctx.globalAlpha = 0.025 + rnd() * 0.045;
    const dark = rnd() > 0.5;
    ctx.fillStyle =
      pass === "color"
        ? dark
          ? "#000000"
          : "#ffffff"
        : dark
          ? "#000000"
          : "rgb(0,255,0)";
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2.5, 1.5);
  }
  ctx.globalAlpha = 1;
  const edge = ctx.createLinearGradient(0, 0, w, 0);
  if (pass === "color") {
    edge.addColorStop(0, "rgba(0,0,0,0.42)");
    edge.addColorStop(0.07, "rgba(0,0,0,0.1)");
    edge.addColorStop(0.16, "rgba(0,0,0,0)");
    edge.addColorStop(0.84, "rgba(0,0,0,0)");
    edge.addColorStop(0.93, "rgba(0,0,0,0.1)");
    edge.addColorStop(1, "rgba(0,0,0,0.42)");
  } else {
    // hinge wear reads rougher at the curl-away edges
    edge.addColorStop(0, "rgba(0,255,0,0.35)");
    edge.addColorStop(0.07, "rgba(0,255,0,0.12)");
    edge.addColorStop(0.16, "rgba(0,255,0,0)");
    edge.addColorStop(0.84, "rgba(0,255,0,0)");
    edge.addColorStop(0.93, "rgba(0,255,0,0.12)");
    edge.addColorStop(1, "rgba(0,255,0,0.35)");
  }
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);
}

function spineScuffs(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rnd: () => number,
  pass: SpinePass = "color"
): void {
  for (let i = 0; i < 5; i++) {
    const a = rnd();
    const x = rnd() * w * 0.5;
    const y = h - 60 - rnd() * 150;
    const sw = w * (0.2 + rnd() * 0.35);
    if (pass === "color") {
      ctx.fillStyle = "#000000";
      ctx.globalAlpha = 0.04 + a * 0.06;
    } else {
      ctx.fillStyle = "rgb(0,255,0)";
      ctx.globalAlpha = 0.2 + a * 0.25;
    }
    ctx.fillRect(x, y, sw, 2);
  }
  ctx.globalAlpha = 1;
}

function realSpineTexture(
  book: Book,
  seed: number,
  pass: SpinePass = "color",
  finish: Finish = "cloth"
): THREE.CanvasTexture {
  return makeCanvasTexture(
    512,
    2048,
    (ctx, w, h) => {
      const rnd = mulberry32(seed);
      const foil = book.foilColor ?? book.textColor;
      const band = book.bandColor ?? tone(book.spineColor, 1.5);
      const foilInk = pass === "color" ? foil : foilResponseInk(foil);
      // u maps over the unwrapped spine arc; compensate pixel density so
      // type keeps a true aspect on narrow and wide spines alike
      const arc = Math.PI * 0.5 * book.thicknessM;
      const squish = (w / arc) / (h / book.heightM);
      const vw = w / squish;

      spineBase(ctx, w, h, book, rnd, pass, finish);

      const bandH = 24;
      for (const top of [true, false]) {
        const y0 = top ? 0 : h - bandH;
        // headbands are woven thread: rough, dielectric in the response pass
        ctx.fillStyle = pass === "color" ? band : "rgb(0,205,0)";
        ctx.fillRect(0, y0, w, bandH);
        ctx.fillStyle = pass === "color" ? "rgba(0,0,0,0.3)" : "rgba(0,255,0,0.3)";
        for (let x = 3; x < w; x += 9) ctx.fillRect(x, y0 + 4, 3.5, bandH - 8);
        if (pass === "color") {
          const sy = top ? bandH : h - bandH - 14;
          const sh = ctx.createLinearGradient(0, sy, 0, sy + 14);
          sh.addColorStop(top ? 0 : 1, "rgba(0,0,0,0.32)");
          sh.addColorStop(top ? 1 : 0, "rgba(0,0,0,0)");
          ctx.fillStyle = sh;
          ctx.fillRect(0, sy, w, 14);
        }
      }

      ctx.globalAlpha = pass === "color" ? 0.92 : 1;
      ctx.fillStyle = foilInk;
      ctx.fillRect(w * 0.17, 96, w * 0.66, 6);
      ctx.fillRect(w * 0.17, 114, w * 0.66, 3);
      ctx.fillRect(w * 0.17, h - 116, w * 0.66, 3);
      ctx.fillRect(w * 0.17, h - 102, w * 0.66, 6);
      ctx.globalAlpha = 1;

      const style = book.jacketStyle ?? "serif-run";
      const serif = style.startsWith("serif");
      const titleFont = (px: number) =>
        serif
          ? `bold ${px}px Georgia, "Times New Roman", serif`
          : `600 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      const authorFont = (px: number) =>
        serif
          ? `${px}px Georgia, "Times New Roman", serif`
          : `500 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (style.endsWith("stacked")) {
        ctx.save();
        ctx.translate(w / 2, 0);
        ctx.scale(squish, 1);
        const words = book.title.split(" ");
        let px = 150;
        for (const word of words) {
          px = Math.min(px, fitPx(ctx, word, 150, vw * 0.72, titleFont));
        }
        ctx.font = titleFont(px);
        const lineH = px * 1.2;
        words.forEach((word, i) => {
          drawFoil(ctx, word, 0, 330 + i * lineH, px, foil, pass);
        });
        const authorWords = book.author.split(" ");
        let apx = 54;
        for (const word of authorWords) {
          apx = Math.min(apx, fitPx(ctx, word.toUpperCase(), 54, vw * 0.6, authorFont));
        }
        ctx.font = authorFont(apx);
        authorWords.forEach((word, i) => {
          drawFoil(ctx, word.toUpperCase(), 0, h - 430 + i * apx * 1.45, apx, foil, pass);
        });
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(squish, 1);
        ctx.rotate(Math.PI / 2); // tilt-your-head-right US spine convention
        const tpx = fitPx(ctx, book.title, 86, h * 0.5, titleFont);
        drawFoil(ctx, book.title, -h * 0.1, 0, tpx, foil, pass);
        const apx = fitPx(ctx, book.author, 46, h * 0.26, authorFont);
        drawFoil(ctx, book.author, h * 0.3, 0, apx, foil, pass);
        ctx.restore();
      }

      ctx.save();
      ctx.translate(w / 2, h - 188);
      ctx.scale(squish, 1);
      drawColophon(ctx, foil, pass);
      ctx.restore();

      spineScuffs(ctx, w, h, rnd, pass);
    },
    // response maps carry data, not color — they must stay linear
    { srgb: pass === "color", anisotropy: 8 }
  );
}

// All six untitled fillers share one atlas — one texture, one material, one
// merged mesh. Per-column content matches the source files' filler pass:
// sun-fade, blind-embossed bands, scuffs.
function fillerAtlasTexture(fillers: Book[], seed: number): THREE.CanvasTexture {
  const colW = 256;
  const colH = 1024;
  return makeCanvasTexture(
    colW * fillers.length,
    colH,
    (ctx) => {
      fillers.forEach((book, col) => {
        ctx.save();
        ctx.translate(col * colW, 0);
        ctx.beginPath();
        ctx.rect(0, 0, colW, colH);
        ctx.clip();
        const rnd = mulberry32(seed + col * 17);
        spineBase(ctx, colW, colH, book, rnd);
        const fade = ctx.createLinearGradient(0, 0, 0, colH * 0.5);
        fade.addColorStop(0, "rgba(255,244,220,0.1)");
        fade.addColorStop(1, "rgba(255,244,220,0)");
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, colW, colH * 0.5);
        const bands = [70 + rnd() * 30, 120 + rnd() * 30, colH - 120 - rnd() * 40];
        for (const y of bands) {
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.fillRect(colW * 0.12, y, colW * 0.76, 5);
          ctx.fillStyle = "rgba(255,250,235,0.16)";
          ctx.fillRect(colW * 0.12, y + 5, colW * 0.76, 2);
        }
        spineScuffs(ctx, colW, colH, rnd);
        ctx.restore();
      });
    },
    { anisotropy: 8 }
  );
}

// ---------------------------------------------------------------------------
// Row layout — authored, not packed: which book stands where, who leans,
// who's pulled forward. Leans are signed: positive tips the top toward -x
// (left, into the bookend), negative settles right onto the next spine.

type RowSlot = {
  book: Book;
  lean: number;
  pull?: boolean;
  gap: number; // air after this book
  yaw?: number; // explicit yaw override (rightmost book stays flush at 0)
};

function realBook(title: string): Book {
  const b = BOOKS.find((x) => x.title === title);
  if (!b) throw new Error(`DeskBookRow: missing book "${title}".`);
  return b;
}

function fillerBook(fillers: Book[], i: number): Book {
  const b = fillers[i];
  if (!b) throw new Error(`DeskBookRow: missing filler ${i}.`);
  return b;
}

type RealSpine = {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhysicalMaterial;
};

export default function DeskBookRow() {
  const built = useMemo(() => {
    const rand = mulberry32(20260612);

    const fillerList = BOOKS.filter((b) => b.filler);

    // Left to right. The leftmost (Moonwalking) settles into the bookend at
    // ~9 deg; two fillers lean right onto The Power Law and On the Edge
    // (both pass the shorter-than-right-neighbor check); The Wise Man's Fear
    // is eased a few mm out of line. The rightmost filler stands flush and
    // square for the rail corner.
    const slots: RowSlot[] = [
      { book: realBook("Moonwalking with Einstein"), lean: 0.16, gap: 0.0012 },
      { book: fillerBook(fillerList, 0), lean: 0, gap: 0.0034 },
      { book: realBook("The Wise Man's Fear"), lean: 0, pull: true, gap: 0.0038, yaw: 0.024 },
      { book: fillerBook(fillerList, 1), lean: 0, gap: 0.003 },
      { book: fillerBook(fillerList, 2), lean: -0.13, gap: 0.0006 },
      { book: realBook("The Power Law"), lean: 0, gap: 0.0036 },
      { book: fillerBook(fillerList, 3), lean: -0.15, gap: 0.0006 },
      { book: realBook("On the Edge"), lean: 0, gap: 0.0034 },
      { book: fillerBook(fillerList, 4), lean: 0, gap: 0.0028 },
      { book: fillerBook(fillerList, 5), lean: 0, gap: 0, yaw: 0 }
    ];

    // -- cursor walk: bbox-accurate placement, origin fixed up afterwards ----
    type Placement = {
      book: Book;
      position: [number, number, number];
      rotation: [number, number, number];
    };
    const placements: Placement[] = [];
    let cursor = 0;
    slots.forEach((slot) => {
      const t = slot.book.thicknessM;
      const h = slot.book.heightM;
      let z = BOOK_ZC + (rand() - 0.5) * 0.003;
      if (slot.pull) z += 0.005; // pulled out of line, spine proud of the row
      if (slot.lean !== 0) {
        const a = Math.abs(slot.lean);
        const footprint = t * Math.cos(a) + h * Math.sin(a);
        const cy = (h * Math.cos(a) + t * Math.sin(a)) / 2;
        placements.push({
          book: slot.book,
          position: [cursor + footprint / 2, cy, z],
          rotation: [0, 0, slot.lean]
        });
        cursor += footprint + slot.gap;
      } else {
        placements.push({
          book: slot.book,
          position: [cursor + t / 2, h / 2, z],
          rotation: [0, slot.yaw ?? (rand() - 0.5) * 0.02, 0]
        });
        cursor += t + slot.gap;
      }
    });

    // -- bookend contact: the leaning book's left face meets the upright's
    // top edge; everything else (fold, base, felt) hangs off that line ------
    const lead = placements[0];
    if (!lead) throw new Error("DeskBookRow: empty row.");
    const leadBook = lead.book;
    const a0 = lead.rotation[2];
    const cx0 = lead.position[0];
    const cy0 = lead.position[1];
    const t0 = leadBook.thicknessM;
    // left face of the tilted book, parameterized by s along its height,
    // evaluated at the upright's top edge
    const s = (UP_Y_TOP - cy0 + (t0 / 2) * Math.sin(a0)) / Math.cos(a0);
    const xContact = cx0 - (t0 / 2) * Math.cos(a0) - s * Math.sin(a0);
    const upInner = xContact - 0.0003; // hairline so steel and cloth don't weld
    const upCx = upInner - UP_T / 2;
    const upOuter = upCx - UP_T / 2;
    const baseCx = upOuter - BASE_L / 2;

    // -- recenter: origin = center of the full row footprint ----------------
    const minX = upOuter - BASE_L;
    const maxX = cursor; // last gap is 0, so this is the flush right face
    const xOff = (minX + maxX) / 2;
    for (const p of placements) p.position[0] -= xOff;

    // -- shared book materials (batch tint rides vertex color) --------------
    const pagesTex = pageEdgeTexture(77);
    const clothTex = clothTexture(78);
    // shared micro-grain bump for jacketed covers (linear, bump-only)
    const paperTex = makeCanvasTexture(
      256,
      256,
      (ctx, w, h) => {
        const rnd = mulberry32(79);
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 2000; i++) {
          const g = 104 + Math.floor(rnd() * 60);
          ctx.globalAlpha = 0.4 + rnd() * 0.3;
          ctx.fillStyle = `rgb(${g},${g},${g})`;
          ctx.fillRect(rnd() * w, rnd() * h, 1.4, 1.4);
        }
        ctx.globalAlpha = 1;
      },
      { srgb: false, repeat: [1, 1], anisotropy: 4 }
    );

    const coverMats: Record<Finish, THREE.MeshPhysicalMaterial> = {
      cloth: new THREE.MeshPhysicalMaterial({
        map: clothTex,
        bumpMap: clothTex,
        bumpScale: 0.0007,
        vertexColors: true,
        roughness: 0.78,
        sheen: 0.55,
        sheenRoughness: 0.58,
        sheenColor: new THREE.Color("#e9e3d4"),
        envMapIntensity: 0.55
      }),
      matte: new THREE.MeshPhysicalMaterial({
        bumpMap: paperTex,
        bumpScale: 0.00018,
        vertexColors: true,
        roughness: 0.55,
        clearcoat: 0.05,
        clearcoatRoughness: 0.5,
        envMapIntensity: 0.8
      }),
      gloss: new THREE.MeshPhysicalMaterial({
        bumpMap: paperTex,
        bumpScale: 0.0001,
        vertexColors: true,
        roughness: 0.36,
        clearcoat: 0.42,
        clearcoatRoughness: 0.14,
        envMapIntensity: 1.1
      })
    };
    const pagesMat = new THREE.MeshStandardMaterial({
      map: pagesTex,
      bumpMap: pagesTex,
      bumpScale: 0.0004,
      vertexColors: true,
      roughness: 0.93,
      envMapIntensity: 0.55
    });
    const capsMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      side: THREE.DoubleSide,
      envMapIntensity: 0.5
    });

    const atlasTex = fillerAtlasTexture(fillerList, 401);
    const fillerSpinesMat = new THREE.MeshPhysicalMaterial({
      map: atlasTex,
      roughness: 0.68,
      sheen: 0.3,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color("#e7e0d0"),
      envMapIntensity: 0.6
    });

    const coverParts: Record<Finish, BakedPart[]> = { cloth: [], matte: [], gloss: [] };
    const pageParts: BakedPart[] = [];
    const capParts: BakedPart[] = [];
    const fillerSpineParts: BakedPart[] = [];
    const realSpines: RealSpine[] = [];

    const spineInnerColor = new THREE.Color("#241a12");
    let bookIndex = 0;
    let fillerFinishIndex = 0;

    const placeBook = (p: Placement): void => {
      const book = p.book;
      const t = book.thicknessM;
      const h = book.heightM;
      const d = BOOK_DEPTH;
      const seed = 131 + bookIndex * 17;
      bookIndex++;
      const finish: Finish = book.filler
        ? FILLER_FINISHES[fillerFinishIndex++ % FILLER_FINISHES.length] ?? "cloth"
        : REAL_FINISH[book.title] ?? "cloth";
      const m = bookMatrix(p.position, p.rotation);

      const tint = new THREE.Color(book.spineColor).multiplyScalar(0.92 + rand() * 0.14);
      tint.r = Math.min(1, tint.r * 1.05);
      tint.g = Math.min(1, tint.g * 1.05);
      tint.b = Math.min(1, tint.b * 1.05);
      const edgeTint = tint.clone().multiplyScalar(0.88);
      const sheenTint = new THREE.Color("#f6f2e9").lerp(tint, 0.42);

      // cover boards — both into the finish batch
      const frontGeo = plateGeometry(d, h, COVER_T, 0.0008, "x");
      frontGeo.translate((t - COVER_T) / 2, 0, 0);
      const backGeo = plateGeometry(d, h, COVER_T, 0.0008, "x");
      backGeo.translate(-(t - COVER_T) / 2, 0, 0);
      coverParts[finish].push({ geometry: frontGeo, matrix: m, colors: [tint, edgeTint] });
      coverParts[finish].push({ geometry: backGeo, matrix: m, colors: [tint, edgeTint] });

      // page block — vertex colors per face: sides, dust-bright top, shadowed
      // bottom, dark inner fold (+z is the fore-edge here; spine bulges +z so
      // the fold sits behind at -z... faces ordered +x,-x,+y,-y,+z,-z)
      const pageHex = book.pageTint ?? "#f5edd8";
      const pagesGeo = new THREE.BoxGeometry(
        t - 2 * COVER_T - 0.0004,
        h - 2 * OVERHANG,
        d - OVERHANG - 0.002
      );
      pagesGeo.translate(0, 0, (OVERHANG - 0.002) / 2);
      const pageSide = new THREE.Color(pageHex);
      pageParts.push({
        geometry: pagesGeo,
        matrix: m,
        colors: [
          pageSide,
          pageSide,
          toneColor(pageHex, 1.06),
          toneColor(pageHex, 0.9),
          spineInnerColor,
          toneColor(pageHex, 0.9)
        ]
      });

      // spine roll + caps
      const bulge = Math.min(0.0065, Math.max(0.0035, t * 0.16));
      const spineGeo = spineGeometry(t, h, bulge);
      spineGeo.translate(0, 0, d / 2);
      const capColor = toneColor(book.spineColor, 0.5);
      for (const sy of [h / 2 - 0.0006, -h / 2 + 0.0006]) {
        const cap = spineCapGeometry(t, bulge);
        cap.translate(0, sy, d / 2);
        capParts.push({ geometry: cap, matrix: m, colors: [capColor] });
      }

      if (book.filler) {
        // remap u into this filler's atlas column, then into the shared mesh
        const col = fillerList.indexOf(book);
        const uv = spineGeo.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) {
          uv.setX(i, (col + uv.getX(i)) / fillerList.length);
        }
        fillerSpineParts.push({ geometry: spineGeo, matrix: m });
        return;
      }

      // real spine: full pipeline — color pass plus a linear G/B response
      // pass so the stamped type glints under its own lobe
      const spineMat = new THREE.MeshPhysicalMaterial({
        map: realSpineTexture(book, seed, "color", finish)
      });
      const response = realSpineTexture(book, seed, "response", finish);
      spineMat.roughnessMap = response;
      spineMat.metalnessMap = response;
      spineMat.roughness = 1;
      spineMat.metalness = 1;
      if (finish === "cloth") {
        spineMat.sheen = 0.45;
        spineMat.sheenRoughness = 0.6;
        spineMat.sheenColor.copy(sheenTint);
        spineMat.bumpMap = clothTex;
        spineMat.bumpScale = 0.0004;
        spineMat.envMapIntensity = 0.65;
      } else if (finish === "matte") {
        spineMat.clearcoat = 0.06;
        spineMat.clearcoatRoughness = 0.45;
        spineMat.envMapIntensity = 0.9;
      } else {
        spineMat.clearcoat = 0.4;
        spineMat.clearcoatRoughness = 0.14;
        spineMat.envMapIntensity = 1.2;
      }
      spineGeo.applyMatrix4(m);
      realSpines.push({
        name: `bookSpine${book.title.replace(/[^A-Za-z0-9]/g, "")}`,
        geometry: spineGeo,
        material: spineMat
      });
    };

    placements.forEach(placeBook);

    // -- bookend: one folded-steel L, dark matte powder coat -----------------
    const bookendParts: BakedPart[] = [
      {
        geometry: plateGeometry(UP_D, UP_H, UP_T, 0.0007, "x"),
        matrix: new THREE.Matrix4().makeTranslation(
          upCx - xOff,
          UP_Y0 + UP_H / 2,
          BOOK_ZC
        )
      },
      {
        geometry: plateGeometry(BASE_L, BASE_D, BASE_T, 0.0005, "y"),
        matrix: new THREE.Matrix4().makeTranslation(
          baseCx - xOff,
          FELT_T + BASE_T / 2,
          BOOK_ZC
        )
      }
    ];
    const bookendGeo = bakeParts(bookendParts, "bookend");
    const steel = new THREE.MeshStandardMaterial({
      color: "#303234",
      metalness: 0.45,
      roughness: 0.58,
      envMapIntensity: 0.8
    });

    const feltGeo = new THREE.BoxGeometry(BASE_L - 0.006, FELT_T, BASE_D - 0.008);
    feltGeo.translate(baseCx - xOff, FELT_T / 2, BOOK_ZC);
    const feltMat = new THREE.MeshStandardMaterial({
      color: "#2c2724",
      roughness: 1,
      envMapIntensity: 0.25
    });

    return {
      coverGeos: {
        cloth: bakeParts(coverParts.cloth, "cloth covers"),
        matte: bakeParts(coverParts.matte, "matte covers"),
        gloss: bakeParts(coverParts.gloss, "gloss covers")
      },
      coverMats,
      pagesGeo: bakeParts(pageParts, "pages"),
      pagesMat,
      capsGeo: bakeParts(capParts, "spine caps"),
      capsMat,
      fillerSpinesGeo: bakeParts(fillerSpineParts, "filler spines"),
      fillerSpinesMat,
      realSpines,
      bookendGeo,
      steel,
      feltGeo,
      feltMat
    };
  }, []);

  return (
    <group name="deskBookRow">
      {/* books: batched bodies, individual real spines */}
      <mesh name="bookPages" geometry={built.pagesGeo} material={built.pagesMat} castShadow receiveShadow />
      <mesh name="bookCoversCloth" geometry={built.coverGeos.cloth} material={built.coverMats.cloth} castShadow receiveShadow />
      <mesh name="bookCoversMatte" geometry={built.coverGeos.matte} material={built.coverMats.matte} castShadow receiveShadow />
      <mesh name="bookCoversGloss" geometry={built.coverGeos.gloss} material={built.coverMats.gloss} castShadow receiveShadow />
      <mesh name="bookCaps" geometry={built.capsGeo} material={built.capsMat} />
      <mesh name="bookSpinesFiller" geometry={built.fillerSpinesGeo} material={built.fillerSpinesMat} castShadow />
      {built.realSpines.map((s) => (
        <mesh key={s.name} name={s.name} geometry={s.geometry} material={s.material} castShadow />
      ))}

      {/* the one bookend at the open left end */}
      <mesh name="bookendSteel" geometry={built.bookendGeo} material={built.steel} castShadow receiveShadow />
      <mesh name="bookendFelt" geometry={built.feltGeo} material={built.feltMat} />
    </group>
  );
}

export {
  WIDTH as DESK_BOOK_ROW_WIDTH,
  DEPTH as DESK_BOOK_ROW_DEPTH,
  HEIGHT as DESK_BOOK_ROW_HEIGHT
};
