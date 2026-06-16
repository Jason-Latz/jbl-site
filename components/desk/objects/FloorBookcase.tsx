"use client";

// Floor-standing bookcase — the desktop Bookshelf's successor in the
// minimalist composition. It stands on the floor against the back wall,
// left of the desk: a warm dark-walnut case (same wood family as the desk,
// deliberately straighter grain so it reads as a separate piece) with three
// open bays over a recessed plinth. Top bay holds the favorites run with a
// settled lean; middle bay is a short current-reads run held between a pair
// of folded-steel bookends; bottom bay mixes a horizontal three-book stack
// (On the Edge displayed cover-up on top) with a small terracotta plant.
//
// The book list and the whole spine-art pipeline (foil response maps, cloth
// /matte/gloss finishes, page-edge striations) mirror Bookshelf.tsx — same
// content/books data, nothing invented, nothing dropped. The difference is
// draw-call discipline: a floor case across the room doesn't earn 6 draws a
// book, so covers, page blocks and spine caps bake into vertex-colored
// batches per material, and the six untitled fillers share one spine atlas.
// Only the four real spines keep individual materials (their foil glint
// rides per-book roughness/metalness maps). ~21 draws all in.
//
// Conventions: meters, base at y=0 (layout drops it to FLOOR_Y), centered
// on its own origin, everything inside 0.85 x 0.27 x 1.25. Export-safe:
// Standard/Physical materials only, no transmission.

import { useMemo } from "react";
import * as THREE from "three";
import { mergeBufferGeometries } from "three-stdlib";
import { brushedMetalMaterial, makeCanvasTexture } from "@/lib/three/materials";
import { BOOKS, type Book, type BookShelfName } from "@/content/books";

// Carcass envelope. Sides tuck 1mm under the top cap so nothing pokes past
// the declared footprint; the plinth recesses for a toe-kick shadow.
const WIDTH = 0.85;
const DEPTH = 0.27;
const HEIGHT = 1.25;

const SIDE_T = 0.018;
const SIDE_D = 0.268; // sides stop 1mm shy of the depth bound
const TOP_T = 0.022;
const SHELF_T = 0.018;
const BACK_T = 0.012;
const PLINTH_H = 0.06;

const SIDE_X = WIDTH / 2 - 0.001 - SIDE_T / 2; // outer face at ±0.424
const INNER_X = SIDE_X - SIDE_T / 2; // ±0.406
const SIDE_H = HEIGHT - TOP_T - PLINTH_H;
const SIDE_YC = PLINTH_H + SIDE_H / 2;

// Bays bottom-up: stack + plant, current run, favorites run. Graduated —
// the tallest bay sits low, the way real cases settle.
const SHELF1_Y = PLINTH_H + SHELF_T / 2; // bottom board rides the plinth
const SURFACE_1 = PLINTH_H + SHELF_T;
const SHELF2_Y = 0.472;
const SURFACE_2 = SHELF2_Y + SHELF_T / 2;
const SHELF3_Y = 0.85;
const SURFACE_3 = SHELF3_Y + SHELF_T / 2;

// Back panel floats inside the case with a reveal all around — the dark
// line that reads as plaster shadow behind an almost-flush piece.
const BACK_W = 2 * INNER_X - 0.006;
const BACK_H = HEIGHT - TOP_T - SURFACE_1 - 0.012;
const BACK_YC = SURFACE_1 + 0.006 + BACK_H / 2;
const BACK_ZC = -DEPTH / 2 + 0.013; // 7mm of shadowed air behind it

const SHELF_W = 2 * INNER_X - 0.002; // 1mm pin-gap at each housing
const SHELF_D = 0.244;
const SHELF_ZC = 0.006; // back edge kisses the back panel, 6mm front setback

// Books (dims shared with Bookshelf.tsx so the same data reads the same).
const BOOK_DEPTH = 0.15;
const BOOK_GAP = 0.0024;
const COVER_T = 0.0022;
const OVERHANG = 0.0025; // cover-board square past the text block
const BOOK_Z = 0.035; // spines near the shelf nose, air behind — deep case

// Case wood: a step darker than the desk's #6f4d31, oiled rather than
// lacquered, with long straight ribbons instead of the desk's wavy figure.
const CASE_WOOD = "#5d3f28";
const CASE_STREAK_DARK = "#3a2615";
const CASE_STREAK_LIGHT = "#715032";

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
// Cover finishes — same assignment scheme as Bookshelf.tsx: real books keep
// their verified bindings, fillers cycle the variety that reads as "real".

type Finish = "cloth" | "matte" | "gloss";

const REAL_FINISH: Record<string, Finish> = {
  "The Wise Man's Fear": "cloth", // classic cloth case with gold stamping
  "Moonwalking with Einstein": "gloss", // modern trade jacket, laminated
  "The Power Law": "matte",
  "On the Edge": "matte" // stack-top display copy; art face carries its own gloss
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

function shelfOrder(shelf: BookShelfName): Book[] {
  const standing = BOOKS.filter((b) => b.shelf === shelf && !b.displayFlat);
  const real = standing.filter((b) => !b.filler);
  const filler = standing.filter((b) => b.filler);
  const order: Book[] = [];
  for (let i = 0; i < Math.max(real.length, filler.length); i++) {
    const r = real[i];
    if (r) order.push(r);
    const f = filler[i];
    if (f) order.push(f);
  }
  return order;
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

// Offset (and optionally swap, for grain direction) a geometry's UVs so the
// merged carcass boards don't all show the same clone of the grain tile.
function shiftUV(g: THREE.BufferGeometry, du: number, dv: number, swap = false): void {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, (swap ? v : u) + du, (swap ? u : v) + dv);
  }
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
    throw new Error(`FloorBookcase: ${label} merge failed.`);
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
// Canvas textures (book passes mirror Bookshelf.tsx; the case grain is new)

function caseGrainTexture(seed: number): THREE.CanvasTexture {
  return makeCanvasTexture(
    1024,
    1024,
    (ctx, w, h) => {
      const rnd = mulberry32(seed);
      ctx.fillStyle = CASE_WOOD;
      ctx.fillRect(0, 0, w, h);
      // long, nearly straight ribbons — quarter-sawn temper, unlike the
      // desk's wavy cathedral figure
      for (let i = 0; i < 95; i++) {
        const y = rnd() * h;
        ctx.strokeStyle = rnd() > 0.62 ? CASE_STREAK_LIGHT : CASE_STREAK_DARK;
        ctx.globalAlpha = 0.05 + rnd() * 0.1;
        ctx.lineWidth = 0.8 + rnd() * 3.2;
        ctx.beginPath();
        let yy = y;
        ctx.moveTo(0, yy);
        for (let x = 64; x <= w; x += 64) {
          yy += (rnd() - 0.5) * 2.2;
          ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      // open walnut pores: short dark dashes along the grain
      for (let i = 0; i < 1700; i++) {
        ctx.globalAlpha = 0.04 + rnd() * 0.05;
        ctx.fillStyle = rnd() > 0.5 ? "#2e1d10" : "#7a5635";
        ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 7, 1);
      }
      ctx.globalAlpha = 1;
    },
    { repeat: [1, 1], anisotropy: 8 }
  );
}

function terracottaTexture(seed: number): THREE.CanvasTexture {
  return makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      const rnd = mulberry32(seed);
      ctx.fillStyle = "#9c5236";
      ctx.fillRect(0, 0, w, h);
      // throwing rings + fired blotches
      for (let y = 0; y < h; y += 4) {
        ctx.globalAlpha = 0.05 + rnd() * 0.06;
        ctx.fillStyle = rnd() > 0.5 ? "#7e3f28" : "#b06a48";
        ctx.fillRect(0, y, w, 1.5);
      }
      for (let i = 0; i < 40; i++) {
        ctx.globalAlpha = 0.04 + rnd() * 0.05;
        ctx.fillStyle = rnd() > 0.5 ? "#86452c" : "#ad6543";
        ctx.beginPath();
        ctx.ellipse(rnd() * w, rnd() * h, 8 + rnd() * 22, 5 + rnd() * 12, rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    { repeat: [1, 1], anisotropy: 4 }
  );
}

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
// merged mesh — instead of six. Per-column content matches Bookshelf's
// filler pass: sun-fade, blind-embossed bands, scuffs.
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

// Front cover for the stack-top display copy: simple type and a rule line.
function coverArtTexture(book: Book, seed: number): THREE.CanvasTexture {
  return makeCanvasTexture(
    1280,
    2048,
    (ctx, w, h) => {
      const rnd = mulberry32(seed);
      const ink = book.textColor;
      const accent = book.bandColor ?? tone(book.spineColor, 0.6);
      ctx.fillStyle = book.spineColor;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2400; i++) {
        ctx.globalAlpha = 0.02 + rnd() * 0.035;
        ctx.fillStyle = rnd() > 0.5 ? "#000000" : "#ffffff";
        ctx.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
      // edge wear and a darker hinge at the spine side (u=0)
      const hinge = ctx.createLinearGradient(0, 0, w * 0.12, 0);
      hinge.addColorStop(0, "rgba(0,0,0,0.2)");
      hinge.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hinge;
      ctx.fillRect(0, 0, w * 0.12, h);
      const vig = ctx.createLinearGradient(w, 0, w - w * 0.06, 0);
      vig.addColorStop(0, "rgba(0,0,0,0.12)");
      vig.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = vig;
      ctx.fillRect(w * 0.9, 0, w * 0.1, h);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const font = (px: number) =>
        `800 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      const words = book.title.toUpperCase().split(" ");
      const lines: string[] = [];
      for (const word of words) {
        const last = lines[lines.length - 1];
        if (last !== undefined && (last + " " + word).length <= 8) {
          lines[lines.length - 1] = `${last} ${word}`;
        } else {
          lines.push(word);
        }
      }
      let px = 250;
      for (const line of lines) {
        px = Math.min(px, fitPx(ctx, line, 250, w * 0.78, font));
      }
      ctx.font = font(px);
      const lineH = px * 1.12;
      const y0 = h * 0.3;
      lines.forEach((line, i) => {
        ctx.fillStyle = "rgba(0,0,0,0.16)";
        ctx.fillText(line, w / 2 + 4, y0 + i * lineH + 5);
        ctx.fillStyle = ink;
        ctx.fillText(line, w / 2, y0 + i * lineH);
      });
      const yRule = y0 + lines.length * lineH + 60;
      ctx.fillStyle = accent;
      ctx.fillRect(w / 2 - w * 0.21, yRule, w * 0.42, 12);
      const apx = fitPx(
        ctx,
        book.author.toUpperCase(),
        92,
        w * 0.66,
        (p) => `600 ${p}px "Helvetica Neue", Helvetica, Arial, sans-serif`
      );
      ctx.font = `600 ${apx}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      ctx.fillStyle = ink;
      ctx.fillText(book.author.toUpperCase(), w / 2, yRule + 150);
    },
    { anisotropy: 8 }
  );
}

// ---------------------------------------------------------------------------

type RealSpine = {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhysicalMaterial;
};

type ArtCover = {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
};

export default function FloorBookcase() {
  const built = useMemo(() => {
    const rand = mulberry32(20260611);

    // -- case materials ------------------------------------------------------
    const grain = caseGrainTexture(811);
    const caseWood = new THREE.MeshPhysicalMaterial({
      map: grain,
      bumpMap: grain,
      bumpScale: 0.0011,
      roughness: 0.5,
      metalness: 0.02,
      clearcoat: 0.16,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.7
    });
    // back panel sits dark and barely answers the env — the bays read as
    // shadowed air behind the books
    const backMat = new THREE.MeshStandardMaterial({
      map: grain,
      color: "#7d7d7d",
      roughness: 0.85,
      envMapIntensity: 0.3
    });
    const darkMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      envMapIntensity: 0.25
    });
    const steel = (() => {
      const m = brushedMetalMaterial("#b6babd");
      m.roughness = 0.34;
      m.envMapIntensity = 1.1;
      return m;
    })();

    // -- carcass: sides + top + plinth merged into bookcaseFrame -------------
    const frameParts: BakedPart[] = [];
    const sideL = plateGeometry(SIDE_D, SIDE_H, SIDE_T, 0.0035, "x");
    const sideR = plateGeometry(SIDE_D, SIDE_H, SIDE_T, 0.0035, "x");
    const topCap = plateGeometry(WIDTH - 0.002, SIDE_D, TOP_T, 0.004, "y");
    const plinth = plateGeometry(0.824, 0.248, PLINTH_H, 0.003, "y");
    // grain runs up the sides (UV swap), along the top — offsets keep the
    // boards from showing the same clone of the tile
    shiftUV(sideL, 0.1, 0, true);
    shiftUV(sideR, 0.45, 0.3, true);
    shiftUV(topCap, 0.2, 0.55);
    shiftUV(plinth, 0.7, 0.8);
    frameParts.push(
      { geometry: sideL, matrix: new THREE.Matrix4().makeTranslation(-SIDE_X, SIDE_YC, 0) },
      { geometry: sideR, matrix: new THREE.Matrix4().makeTranslation(SIDE_X, SIDE_YC, 0) },
      { geometry: topCap, matrix: new THREE.Matrix4().makeTranslation(0, HEIGHT - TOP_T / 2, 0) },
      // plinth recessed front and sides for the toe-kick shadow
      { geometry: plinth, matrix: new THREE.Matrix4().makeTranslation(0, PLINTH_H / 2, -0.01) }
    );
    const frameGeo = bakeParts(frameParts, "frame");

    const backGeo = plateGeometry(BACK_W, BACK_H, BACK_T, 0.002, "z");

    // shelf boards: one per bay floor, each with its own slice of the grain
    const shelfGeos = [0, 1, 2].map((i) => {
      const g = plateGeometry(SHELF_W, SHELF_D, SHELF_T, 0.0025, "y");
      shiftUV(g, 0.07 + i * 0.31, 0.12 + i * 0.36);
      return g;
    });
    const shelfYs = [SHELF1_Y, SHELF2_Y, SHELF3_Y];

    // -- dark details: shelf-pin holes, bookend felt, plant soil -------------
    const darkParts: BakedPart[] = [];
    const holeColor = new THREE.Color("#1a120b");
    const holeGeo = new THREE.CylinderGeometry(0.0024, 0.0024, 0.0022, 10);
    holeGeo.rotateZ(Math.PI / 2);
    // two 32mm-system-ish columns per side, marching up bays 2 and 3;
    // buried all but 0.2mm so each reads as a flush dark bore, not a peg head
    for (const sx of [-1, 1]) {
      for (const cz of [-0.082, 0.082]) {
        for (let y = 0.36; y <= 1.165; y += 0.08) {
          darkParts.push({
            geometry: holeGeo.clone(),
            matrix: new THREE.Matrix4().makeTranslation(sx * (INNER_X + 0.0009), y, cz),
            colors: [holeColor]
          });
        }
      }
    }

    // -- books ----------------------------------------------------------------
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

    // batch materials: tint rides vertex color, so one material per finish
    // covers every book of that binding
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

    const fillerList = BOOKS.filter((b) => b.filler);
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
    let artCover: ArtCover | null = null;

    const spineInnerColor = new THREE.Color("#241a12");
    let bookIndex = 0;
    let fillerFinishIndex = 0;

    const placeBook = (
      book: Book,
      position: [number, number, number],
      rotation: [number, number, number],
      artFaceUp = false
    ): void => {
      const t = book.thicknessM;
      const h = book.heightM;
      const d = BOOK_DEPTH;
      const seed = 31 + bookIndex * 17;
      bookIndex++;
      const finish: Finish = book.filler
        ? FILLER_FINISHES[fillerFinishIndex++ % FILLER_FINISHES.length] ?? "cloth"
        : REAL_FINISH[book.title] ?? "cloth";
      const m = bookMatrix(position, rotation);

      const tint = new THREE.Color(book.spineColor).multiplyScalar(0.92 + rand() * 0.14);
      tint.r = Math.min(1, tint.r * 1.05);
      tint.g = Math.min(1, tint.g * 1.05);
      tint.b = Math.min(1, tint.b * 1.05);
      const edgeTint = tint.clone().multiplyScalar(0.88);
      const sheenTint = new THREE.Color("#f6f2e9").lerp(tint, 0.42);

      // cover boards — into the finish batch; the art copy's front face
      // stays its own mesh so its jacket can carry the painted cover
      const frontGeo = plateGeometry(d, h, COVER_T, 0.0008, "x");
      frontGeo.translate((t - COVER_T) / 2, 0, 0);
      const backGeoB = plateGeometry(d, h, COVER_T, 0.0008, "x");
      backGeoB.translate(-(t - COVER_T) / 2, 0, 0);
      if (artFaceUp) {
        frontGeo.applyMatrix4(m);
        artCover = {
          geometry: frontGeo,
          materials: [
            new THREE.MeshPhysicalMaterial({
              map: coverArtTexture(book, 53),
              roughness: 0.48,
              clearcoat: 0.18,
              clearcoatRoughness: 0.32,
              envMapIntensity: 1.0
            }),
            new THREE.MeshPhysicalMaterial({
              color: edgeTint,
              roughness: 0.6,
              clearcoat: 0.05,
              clearcoatRoughness: 0.3,
              envMapIntensity: 0.7
            })
          ]
        };
      } else {
        coverParts[finish].push({ geometry: frontGeo, matrix: m, colors: [tint, edgeTint] });
      }
      coverParts[finish].push({ geometry: backGeoB, matrix: m, colors: [tint, edgeTint] });

      // page block — vertex colors per face: sides, dust-bright top, shadowed
      // bottom, dark inner fold (+z), deckled fore-edge (-z)
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

      // real spine: full Bookshelf pipeline — color pass plus a linear G/B
      // response pass so the stamped type glints under its own lobe
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

    // -- shelf layout ---------------------------------------------------------
    // An upright run with a settled lean — same packing rules as Bookshelf.
    const placeRun = (
      order: Book[],
      surfaceY: number,
      startX: number
    ): { start: number; end: number } => {
      // ~7.5-9.5 degrees: a real settled-against-the-neighbor lean
      const leanAngle = 0.13 + rand() * 0.035;
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
      const pullIndex = leanIndex === 0 ? 2 : 0; // one spine eased forward

      let cursor = startX;
      order.forEach((book, i) => {
        const t = book.thicknessM;
        const bh = book.heightM;
        let z = BOOK_Z + (rand() - 0.5) * 0.006;
        if (i === pullIndex && i !== leanIndex) z += 0.006;

        if (i === leanIndex) {
          const footprint = t * Math.cos(leanAngle) + bh * Math.sin(leanAngle);
          placeBook(
            book,
            [
              cursor + footprint / 2,
              surfaceY + (bh * Math.cos(leanAngle) + t * Math.sin(leanAngle)) / 2,
              z
            ],
            [0, 0, -leanAngle]
          );
          cursor += footprint + 0.0006;
        } else {
          placeBook(
            book,
            [cursor + t / 2, surfaceY + bh / 2, z],
            [0, (rand() - 0.5) * 0.02, 0]
          );
          cursor += t + BOOK_GAP;
        }
      });
      return { start: startX, end: cursor - BOOK_GAP };
    };

    // top bay: the favorites run, weighted to the left, air to the right
    const favoritesOrder = shelfOrder("favorites");
    const stackFromFavorites = favoritesOrder.pop(); // last filler joins the stack
    placeRun(favoritesOrder, SURFACE_3, -0.36);

    // middle bay: short current-reads run held between the bookend pair
    const currentOrder = shelfOrder("current");
    const stackFromCurrent = currentOrder.pop();
    const midRun = placeRun(currentOrder, SURFACE_2, -0.1);

    // bottom bay: horizontal stack, On the Edge displayed cover-up on top
    const flatBook = BOOKS.find((b) => b.displayFlat && !b.filler);
    const stackBooks = [stackFromFavorites, stackFromCurrent, flatBook].filter(
      (b): b is Book => Boolean(b)
    );
    const STACK_X = -0.19;
    const STACK_Z = 0.02;
    const stackYaws = [-0.05, 0.06, 0.12];
    const stackXJit = [0, -0.006, 0.005];
    let stackTop = SURFACE_1;
    stackBooks.forEach((book, i) => {
      placeBook(
        book,
        [
          STACK_X + (stackXJit[i] ?? 0),
          stackTop + book.thicknessM / 2 + 0.0003,
          STACK_Z + (i - 1) * 0.004
        ],
        [0, stackYaws[i] ?? 0, Math.PI / 2],
        Boolean(book.displayFlat)
      );
      stackTop += book.thicknessM + 0.0004;
    });

    // -- bookends: two simple folded-steel L's, bases facing away ------------
    const bookendParts: BakedPart[] = [];
    const feltColor = new THREE.Color("#2c2724");
    for (const side of [-1, 1]) {
      const edgeX = side < 0 ? midRun.start : midRun.end;
      const upright = plateGeometry(0.112, 0.132, 0.0025, 0.0007, "x");
      bookendParts.push({
        geometry: upright,
        matrix: new THREE.Matrix4().makeTranslation(
          edgeX + side * 0.00125,
          SURFACE_2 + 0.0028 + 0.066,
          BOOK_Z
        )
      });
      const base = plateGeometry(0.078, 0.112, 0.0018, 0.0005, "y");
      bookendParts.push({
        geometry: base,
        matrix: new THREE.Matrix4().makeTranslation(
          edgeX + side * 0.0415,
          SURFACE_2 + 0.0019,
          BOOK_Z
        )
      });
      const felt = new THREE.BoxGeometry(0.07, 0.001, 0.104);
      darkParts.push({
        geometry: felt,
        matrix: new THREE.Matrix4().makeTranslation(
          edgeX + side * 0.0415,
          SURFACE_2 + 0.0005,
          BOOK_Z
        ),
        colors: [feltColor]
      });
    }
    const bookendsGeo = bakeParts(bookendParts, "bookends");

    // -- plant: terracotta pot + a small succulent rosette --------------------
    const POT_X = 0.21;
    const POT_Z = 0.018;
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
    const potGeo = new THREE.LatheGeometry(potProfile, 28);
    potGeo.translate(POT_X, SURFACE_1, POT_Z);
    const potMat = new THREE.MeshStandardMaterial({
      map: terracottaTexture(83),
      roughness: 0.88,
      envMapIntensity: 0.4
    });
    const soil = new THREE.CylinderGeometry(0.0315, 0.0315, 0.006, 20);
    darkParts.push({
      geometry: soil,
      matrix: new THREE.Matrix4().makeTranslation(POT_X, SURFACE_1 + 0.065, POT_Z),
      colors: [new THREE.Color("#2e2218")]
    });

    // rosette: two whorls of flattened ellipsoid blades plus a center bud
    const leafParts: BakedPart[] = [];
    const whorls = [
      { n: 5, tilt: 0.52, len: 0.05, phase: 0 },
      { n: 4, tilt: 0.26, len: 0.06, phase: 0.63 }
    ];
    for (const ring of whorls) {
      for (let i = 0; i < ring.n; i++) {
        const angle = ring.phase + (i / ring.n) * Math.PI * 2 + rand() * 0.2;
        const leaf = new THREE.SphereGeometry(0.012, 8, 6);
        leaf.scale(0.45, ring.len / 0.024, 0.16);
        leaf.translate(0, ring.len / 2, 0);
        const lm = new THREE.Matrix4()
          .makeRotationY(angle)
          .multiply(new THREE.Matrix4().makeRotationX(ring.tilt + rand() * 0.1));
        lm.setPosition(POT_X, SURFACE_1 + 0.066, POT_Z);
        leafParts.push({ geometry: leaf, matrix: lm });
      }
    }
    const bud = new THREE.SphereGeometry(0.009, 8, 6);
    bud.scale(1, 1.4, 1);
    leafParts.push({
      geometry: bud,
      matrix: new THREE.Matrix4().makeTranslation(POT_X, SURFACE_1 + 0.072, POT_Z)
    });
    const leavesGeo = bakeParts(leafParts, "leaves");
    const leavesMat = new THREE.MeshStandardMaterial({
      color: "#5f7c4b",
      roughness: 0.62,
      envMapIntensity: 0.6
    });

    // -- bake the shared book batches -----------------------------------------
    return {
      frameGeo,
      backGeo,
      shelfGeos,
      shelfYs,
      darkGeo: bakeParts(darkParts, "dark details"),
      caseWood,
      backMat,
      darkMat,
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
      artCover: artCover as ArtCover | null,
      bookendsGeo,
      steel,
      potGeo,
      potMat,
      leavesGeo,
      leavesMat
    };
  }, []);

  return (
    <group name="floorBookcase">
      {/* carcass */}
      <mesh name="bookcaseFrame" geometry={built.frameGeo} material={built.caseWood} castShadow receiveShadow />
      <mesh
        name="bookcaseBack"
        geometry={built.backGeo}
        material={built.backMat}
        position={[0, BACK_YC, BACK_ZC]}
        receiveShadow
      />
      {built.shelfGeos.map((g, i) => (
        <mesh
          key={`shelf-${i + 1}`}
          name={`bookcaseShelf${i + 1}`}
          geometry={g}
          material={built.caseWood}
          position={[0, built.shelfYs[i] ?? 0, SHELF_ZC]}
          castShadow
          receiveShadow
        />
      ))}
      {/* pin holes + felt pads + soil, one matte dark draw */}
      <mesh name="bookcaseDarkDetails" geometry={built.darkGeo} material={built.darkMat} />

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
      {built.artCover ? (
        <mesh
          name="bookCoverArt"
          geometry={built.artCover.geometry}
          material={built.artCover.materials}
          castShadow
        />
      ) : null}

      {/* middle-shelf bookend pair */}
      <mesh name="bookendsSteel" geometry={built.bookendsGeo} material={built.steel} castShadow />

      {/* bottom-shelf plant */}
      <mesh name="plantPot" geometry={built.potGeo} material={built.potMat} castShadow receiveShadow />
      <mesh name="plantLeaves" geometry={built.leavesGeo} material={built.leavesMat} castShadow />
    </group>
  );
}

export {
  WIDTH as FLOOR_BOOKCASE_WIDTH,
  DEPTH as FLOOR_BOOKCASE_DEPTH,
  HEIGHT as FLOOR_BOOKCASE_HEIGHT
};
