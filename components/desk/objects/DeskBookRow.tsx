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
// Realism pass: the canonical book DATA stays fixed (titles, authors, base
// heights/thicknesses live in content/books.ts and are never altered here),
// but the ROW is staged like a real shelf. Per-slot thickness/height jitter
// breaks the CAD-array feel, every book leans a hair off true, the text block
// is a deckled fore-edge with a concave swale (not a flat cream face), cover
// boards warp a touch and darken at the worn edges, two hardcovers wear paper
// dust jackets that sit proud of the boards with head/tail gaps and a printed
// spine, and hardcovers get woven head/tail bands. Spines keep the two-pass
// foil pipeline (a color pass plus a linear G/B response pass so foil glints
// under its own lobe).
//
// Conventions: meters, base at y=0 (sits directly on the desk top), centered
// on the row-footprint origin, row along local x. Everything inside
// 0.535 x 0.165 x 0.24. Export-safe: Standard/Physical materials only.

import { useMemo } from "react";
import * as THREE from "three";
import { mergeBufferGeometries } from "three-stdlib";
import { makeCanvasTexture } from "@/lib/three/materials";
import { BOOKS, type Book } from "@/content/books";

// Declared footprint (the bookend base sets the left edge; The Power Law
// sets the height; spine bulge plus the pulled book set the depth). The row
// recenters on its own span at build time, so this WIDTH is documentation —
// the group always sits centered at its layout position regardless.
const WIDTH = 0.535;
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

// A couple of books wear a paper dust jacket — a printed wrapper that sits a
// hair proud of the boards with small head/tail gaps. These read as glossy
// laminated trade jackets regardless of the board finish underneath.
const JACKETED = new Set<string>(["Moonwalking with Einstein", "The Power Law"]);

// Spine textures draw twice: a color pass and a linear "response" pass
// encoding roughness in G / metalness in B, so foil type glints under a
// separate lobe from the cover it's stamped into.
type SpinePass = "color" | "response";

const RESP_BASE: Record<Finish, string> = {
  cloth: "rgb(0,212,0)",
  matte: "rgb(0,143,0)",
  gloss: "rgb(0,92,0)"
};

// A jacketed (laminated) spine reads smoother/glossier than the same color
// would on bare board — drop the roughness floor of its base coat.
const RESP_BASE_JACKET = "rgb(0,78,0)";

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

// A cover board with a hair of cylindrical warp baked across its width (z),
// so it doesn't read as a perfect plane — old boards cup toward the block.
// Same group/UV layout as plateGeometry. `warp` is the peak deflection (m),
// signed: positive bows the outer face toward +x.
function warpedCoverGeometry(
  d: number,
  h: number,
  t: number,
  warp: number
): THREE.ExtrudeGeometry {
  const geo = plateGeometry(d, h, t, 0.0008, "x");
  if (Math.abs(warp) < EPS) return geo;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // after the "x" rotate, the board's broad face spans (z = old depth, y),
  // thickness rides x. Bow x by a cosine across z.
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const u = THREE.MathUtils.clamp((z / d) * 2, -1, 1); // -1..1 across width
    pos.setX(i, pos.getX(i) + warp * (1 - u * u));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
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

// The text block: a box whose fore-edge (+z face) and the two long faces are
// pulled into a shallow concave swale, the way a stack of leaves dishes
// inward between the cover boards. UVs on the three open faces run so the
// deckled page texture's striations lie ACROSS the leaves (banding climbs the
// block). Returned untranslated, centered on its own origin.
//
// Face order from BoxGeometry groups: +x, -x, +y, -y, +z, -z.
//   +x / -x  → long faces (top/bottom of the leaves seen edge-on)
//   +y / -y  → head (top) / tail (bottom)
//   +z       → fore-edge (toward the viewer over the spine roll)
//   -z       → inner fold (hidden against the spine, kept dark)
function textBlockGeometry(
  t: number,
  h: number,
  d: number
): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(t, h, d, 10, 1, 14);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const dish = Math.min(0.0016, t * 0.06); // peak inward pull at the fore-edge
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = nor.getY(i);
    // depth fraction 0 (inner fold, -d/2) .. 1 (fore-edge, +d/2)
    const dfrac = (z + d / 2) / d;
    // swale is deepest mid-height, eases to nothing at head/tail
    const vert = 1 - Math.pow(Math.abs(y) / (h / 2), 2);
    if (Math.abs(ny) < 0.5) {
      // a long face: dish the leaves inward toward x=0 near the fore-edge
      const pull = dish * dfrac * vert;
      pos.setX(i, x - Math.sign(x) * pull);
    }
    // pull the fore-edge face itself in a touch at mid-height (concave)
    if (nor.getZ(i) > 0.5) {
      pos.setZ(i, z - dish * 0.7 * vert);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
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

// Deckled fore-edge: hundreds of leaves stacked across the texture's V (which
// the geometry maps up the block height), each leaf a faint warmer/cooler
// hairline, plus broad foxing bands, a head/tail soften, and a centre-gutter
// shadow where the swale dishes inward. seed varies per book so no two blocks
// share a leaf pattern.
function pageEdgeTexture(seed: number, tintHex: string): THREE.CanvasTexture {
  return makeCanvasTexture(
    512,
    1024,
    (ctx, w, h) => {
      const rnd = mulberry32(seed);
      const base = new THREE.Color(tintHex);
      ctx.fillStyle = `#${base.getHexString()}`;
      ctx.fillRect(0, 0, w, h);

      // broad uneven banding so the block doesn't read like one flat slab
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = rnd() > 0.5 ? "rgba(150,118,72,0.06)" : "rgba(255,250,236,0.07)";
        const by = rnd() * h;
        ctx.fillRect(0, by, w, 8 + rnd() * 44);
      }

      // individual leaves: thin horizontal striations running across the block
      let y = 0;
      const tones = ["#fdf7e7", "#efe4c6", "#e1d4ad", "#f6efda", "#d4c49d"];
      while (y < h) {
        const tHex = tones[Math.floor(rnd() * tones.length)] ?? "#efe4c6";
        ctx.strokeStyle = tHex;
        ctx.globalAlpha = 0.22 + rnd() * 0.4;
        ctx.lineWidth = 0.7 + rnd() * 1.4;
        const wob = rnd() * 6.3;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += w / 16) {
          ctx.lineTo(x, y + Math.sin(x * 0.018 + wob) * 0.8 + (rnd() - 0.5) * 0.9);
        }
        ctx.stroke();
        y += 1.6 + rnd() * 2.6;
      }
      ctx.globalAlpha = 1;

      // a few darker grouped leaves (signature gatherings / a dog-ear)
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = "rgba(120,92,52,0.14)";
        ctx.fillRect(0, rnd() * h, w, 1.5 + rnd() * 2.5);
      }

      // centre swale: the fore-edge dishes inward, so its trough catches less
      // light — a soft vertical shadow down the middle of the U-axis (which
      // wraps the block's width). Plus head/tail darkening at top & bottom V.
      const swale = ctx.createLinearGradient(0, 0, w, 0);
      swale.addColorStop(0, "rgba(110,84,48,0.20)");
      swale.addColorStop(0.18, "rgba(110,84,48,0)");
      swale.addColorStop(0.5, "rgba(70,52,30,0.16)");
      swale.addColorStop(0.82, "rgba(110,84,48,0)");
      swale.addColorStop(1, "rgba(110,84,48,0.20)");
      ctx.fillStyle = swale;
      ctx.fillRect(0, 0, w, h);

      const ends = ctx.createLinearGradient(0, 0, 0, h);
      ends.addColorStop(0, "rgba(120,90,50,0.18)");
      ends.addColorStop(0.1, "rgba(120,90,50,0)");
      ends.addColorStop(0.9, "rgba(120,90,50,0)");
      ends.addColorStop(1, "rgba(140,100,55,0.22)"); // tail sat on the desk longest
      ctx.fillStyle = ends;
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
      // book-cloth weave: a tight over/under grid, warp and weft slightly
      // uneven so it reads woven rather than printed
      for (let y = 0; y < h; y += 3) {
        ctx.globalAlpha = 0.05 + rnd() * 0.06;
        ctx.fillStyle = rnd() > 0.5 ? "#b3ac9d" : "#f6f1e8";
        ctx.fillRect(0, y, w, 1.4);
      }
      for (let x = 0; x < w; x += 3) {
        ctx.globalAlpha = 0.05 + rnd() * 0.06;
        ctx.fillStyle = rnd() > 0.5 ? "#b1a99a" : "#f3eee5";
        ctx.fillRect(x, 0, 1.4, h);
      }
      // slubs and nap flecks
      for (let i = 0; i < 1100; i++) {
        ctx.globalAlpha = 0.03 + rnd() * 0.05;
        ctx.fillStyle = rnd() > 0.5 ? "#9f9787" : "#ffffff";
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
  // debossed letterpress feel: a bright lip above, dark valley below
  ctx.fillStyle = lum > 0.45 ? "rgba(18,8,2,0.55)" : "rgba(255,246,224,0.42)";
  ctx.fillText(text, x + 2, y + 2.4);
  ctx.fillStyle = lum > 0.45 ? "rgba(255,247,222,0.22)" : "rgba(0,0,0,0.18)";
  ctx.fillText(text, x - 1, y - 1.2);
  const g = ctx.createLinearGradient(0, y - px * 0.55, 0, y + px * 0.45);
  g.addColorStop(0, tone(foil, 1.42));
  g.addColorStop(0.42, tone(foil, 1.08));
  g.addColorStop(0.6, foil);
  g.addColorStop(1, tone(foil, 0.66));
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
  finish: Finish = "cloth",
  jacketed = false
): void {
  const respBase = jacketed ? RESP_BASE_JACKET : RESP_BASE[finish];
  ctx.fillStyle = pass === "color" ? book.spineColor : respBase;
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

  // head/tail rubbing: the most-handled extremities of the spine darken and
  // (in the response pass) scuff rougher — the classic shelf-wear signature
  if (pass === "color") {
    for (const y0 of [0, h - h * 0.06]) {
      const g = ctx.createLinearGradient(0, y0, 0, y0 + h * 0.06);
      const inv = y0 === 0;
      g.addColorStop(inv ? 0 : 1, "rgba(0,0,0,0.22)");
      g.addColorStop(inv ? 1 : 0, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y0, w, h * 0.06);
    }
  }
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
  finish: Finish = "cloth",
  jacketed = false
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

      spineBase(ctx, w, h, book, rnd, pass, finish, jacketed);

      // A jacketed spine wears the printed wrapper, not raised head/tail
      // bands — those belong to the bare hardcover. Cloth/board cases keep
      // their woven bands at head and tail.
      if (!jacketed) {
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
      } else {
        // jacketed: a thin printed publisher band near the foot instead, and
        // a hint of the jacket's gloss laminate as a soft vertical sheen
        if (pass === "color") {
          const lam = ctx.createLinearGradient(w * 0.32, 0, w * 0.62, 0);
          lam.addColorStop(0, "rgba(255,255,255,0)");
          lam.addColorStop(0.5, "rgba(255,255,255,0.07)");
          lam.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = lam;
          ctx.fillRect(0, 0, w, h);
        }
      }

      // title/author rules
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
        // a couple of fillers get a thin blind-stamped horizontal title bar
        // and a faint author rule, so the eye reads "unread book" not "block"
        if (col % 2 === 0) {
          ctx.fillStyle = "rgba(0,0,0,0.16)";
          ctx.fillRect(colW * 0.2, colH * 0.34, colW * 0.6, 7);
          ctx.fillStyle = "rgba(255,250,235,0.12)";
          ctx.fillRect(colW * 0.2, colH * 0.34 + 7, colW * 0.6, 2);
        }
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
  // presentation-only multipliers — the canonical book DATA is never changed,
  // but the same title can stand a hair thicker/taller on the desk than the
  // shelf copy, so the row doesn't read like a uniform CAD array
  tMul?: number;
  hMul?: number;
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
    // square for the rail corner. Per-slot t/h multipliers stagger the
    // thicknesses and heights so the silhouette reads like a lived-in shelf:
    // a chunky text, a couple of slim ones, varied tops.
    const slots: RowSlot[] = [
      { book: realBook("Moonwalking with Einstein"), lean: 0.16, gap: 0.0012, tMul: 0.96, hMul: 1.0 },
      { book: fillerBook(fillerList, 0), lean: 0, gap: 0.003, tMul: 1.22, hMul: 1.04 },
      { book: realBook("The Wise Man's Fear"), lean: 0, pull: true, gap: 0.004, yaw: 0.024, tMul: 1.0, hMul: 1.0 },
      { book: fillerBook(fillerList, 1), lean: 0, gap: 0.0026, tMul: 0.8, hMul: 0.96 },
      { book: fillerBook(fillerList, 2), lean: -0.13, gap: 0.0006, tMul: 1.14, hMul: 1.02 },
      { book: realBook("The Power Law"), lean: 0, gap: 0.0034, tMul: 0.96, hMul: 0.985 },
      { book: fillerBook(fillerList, 3), lean: -0.15, gap: 0.0006, tMul: 0.76, hMul: 0.92 },
      { book: realBook("On the Edge"), lean: 0, gap: 0.003, tMul: 0.96, hMul: 1.0 },
      { book: fillerBook(fillerList, 4), lean: 0, gap: 0.0026, tMul: 1.14, hMul: 1.05 },
      { book: fillerBook(fillerList, 5), lean: 0, gap: 0, yaw: 0, tMul: 1.0, hMul: 1.0 }
    ];

    // Per-slot resolved dims (the data dims, scaled by the presentation
    // multipliers, plus a hair of independent jitter so even repeats differ).
    const dims = slots.map((slot) => {
      const tj = 1 + (rand() - 0.5) * 0.05;
      const hj = 1 + (rand() - 0.5) * 0.025;
      return {
        t: slot.book.thicknessM * (slot.tMul ?? 1) * tj,
        h: slot.book.heightM * (slot.hMul ?? 1) * hj
      };
    });

    // -- cursor walk: bbox-accurate placement, origin fixed up afterwards ----
    type Placement = {
      book: Book;
      t: number;
      h: number;
      jacketed: boolean;
      position: [number, number, number];
      rotation: [number, number, number];
    };
    const placements: Placement[] = [];
    let cursor = 0;
    slots.forEach((slot, i) => {
      const { t, h } = dims[i] ?? { t: slot.book.thicknessM, h: slot.book.heightM };
      const jacketed = JACKETED.has(slot.book.title);
      let z = BOOK_ZC + (rand() - 0.5) * 0.003;
      if (slot.pull) z += 0.005; // pulled out of line, spine proud of the row
      // every upright book still leans a hair off true — a real shelf has no
      // perfectly plumb spine — even when the slot didn't author a big lean
      const microLean = slot.lean !== 0 ? slot.lean : (rand() - 0.5) * 0.012;
      if (slot.lean !== 0) {
        const a = Math.abs(microLean);
        const footprint = t * Math.cos(a) + h * Math.sin(a);
        const cy = (h * Math.cos(a) + t * Math.sin(a)) / 2;
        placements.push({
          book: slot.book,
          t,
          h,
          jacketed,
          position: [cursor + footprint / 2, cy, z],
          rotation: [0, 0, microLean]
        });
        cursor += footprint + slot.gap;
      } else {
        // tiny tip plus tiny yaw — a leaf of imperfection on the plumb books
        const a = Math.abs(microLean);
        const footprint = t * Math.cos(a) + h * Math.sin(a);
        placements.push({
          book: slot.book,
          t,
          h,
          jacketed,
          position: [cursor + footprint / 2, h / 2, z],
          rotation: [0, slot.yaw ?? (rand() - 0.5) * 0.02, microLean]
        });
        cursor += footprint + slot.gap;
      }
    });

    // -- bookend contact: the leaning book's left face meets the upright's
    // top edge; everything else (fold, base, felt) hangs off that line ------
    const lead = placements[0];
    if (!lead) throw new Error("DeskBookRow: empty row.");
    const a0 = lead.rotation[2];
    const cx0 = lead.position[0];
    const cy0 = lead.position[1];
    const t0 = lead.t;
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
        bumpScale: 0.0009,
        vertexColors: true,
        roughness: 0.8,
        sheen: 0.6,
        sheenRoughness: 0.55,
        sheenColor: new THREE.Color("#e9e3d4"),
        envMapIntensity: 0.55
      }),
      matte: new THREE.MeshPhysicalMaterial({
        bumpMap: paperTex,
        bumpScale: 0.0002,
        vertexColors: true,
        roughness: 0.58,
        clearcoat: 0.05,
        clearcoatRoughness: 0.5,
        envMapIntensity: 0.8
      }),
      gloss: new THREE.MeshPhysicalMaterial({
        bumpMap: paperTex,
        bumpScale: 0.0001,
        vertexColors: true,
        roughness: 0.34,
        clearcoat: 0.45,
        clearcoatRoughness: 0.12,
        envMapIntensity: 1.1
      })
    };

    // jacket boards: laminated paper wrapper, glossier than bare board, a
    // touch of clearcoat so the room streaks across the spine
    const jacketMat = new THREE.MeshPhysicalMaterial({
      bumpMap: paperTex,
      bumpScale: 0.00008,
      vertexColors: true,
      roughness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.15
    });

    // per-book page material would mean a draw per book, so instead the page
    // tint rides vertex color and one striated map serves the whole batch;
    // the striations read as leaves regardless of tint
    const pagesTex = pageEdgeTexture(77, "#efe6cd");
    const pagesMat = new THREE.MeshPhysicalMaterial({
      map: pagesTex,
      bumpMap: pagesTex,
      bumpScale: 0.0006,
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      sheen: 0.12,
      sheenRoughness: 0.92,
      sheenColor: new THREE.Color("#fff0db"),
      envMapIntensity: 0.5
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
    const jacketParts: BakedPart[] = [];
    const pageParts: BakedPart[] = [];
    const capParts: BakedPart[] = [];
    const fillerSpineParts: BakedPart[] = [];
    const realSpines: RealSpine[] = [];

    const spineInnerColor = new THREE.Color("#241a12");
    let bookIndex = 0;
    let fillerFinishIndex = 0;

    const placeBook = (p: Placement): void => {
      const book = p.book;
      const t = p.t;
      const h = p.h;
      const d = BOOK_DEPTH;
      const seed = 131 + bookIndex * 17;
      bookIndex++;
      const finish: Finish = book.filler
        ? FILLER_FINISHES[fillerFinishIndex++ % FILLER_FINISHES.length] ?? "cloth"
        : REAL_FINISH[book.title] ?? "cloth";
      const m = bookMatrix(p.position, p.rotation);
      const jr = mulberry32(seed * 3 + 5); // per-book wear/warp rng

      const tint = new THREE.Color(book.spineColor).multiplyScalar(0.92 + jr() * 0.14);
      tint.r = Math.min(1, tint.r * 1.05);
      tint.g = Math.min(1, tint.g * 1.05);
      tint.b = Math.min(1, tint.b * 1.05);
      const edgeTint = tint.clone().multiplyScalar(0.86); // worn board edges darken
      const sheenTint = new THREE.Color("#f6f2e9").lerp(tint, 0.42);

      // ---- cover boards: a hair of cylindrical warp, slight edge darkening
      const warp = (jr() - 0.5) * 0.0009; // tiny cup toward the block
      const frontGeo = warpedCoverGeometry(d, h, COVER_T, warp);
      frontGeo.translate((t - COVER_T) / 2, 0, 0);
      const backGeo = warpedCoverGeometry(d, h, COVER_T, -warp);
      backGeo.translate(-(t - COVER_T) / 2, 0, 0);
      if (p.jacketed) {
        // the boards under a jacket read as the printed jacket paper
        jacketParts.push({ geometry: frontGeo, matrix: m, colors: [tint, edgeTint] });
        jacketParts.push({ geometry: backGeo, matrix: m, colors: [tint, edgeTint] });
      } else {
        coverParts[finish].push({ geometry: frontGeo, matrix: m, colors: [tint, edgeTint] });
        coverParts[finish].push({ geometry: backGeo, matrix: m, colors: [tint, edgeTint] });
      }

      // ---- text block: deckled fore-edge with a concave swale, recessed
      // from the cover edges. (+z is the fore-edge; spine bulges +z so the
      // fold sits behind at -z. Box face order: +x,-x,+y,-y,+z,-z.)
      const pageHex = book.pageTint ?? "#f5edd8";
      const blockH = h - 2 * OVERHANG;
      const blockD = d - OVERHANG - 0.002;
      const pagesGeo = textBlockGeometry(t - 2 * COVER_T - 0.0006, blockH, blockD);
      pagesGeo.translate(0, 0, (OVERHANG - 0.002) / 2);
      // re-map the three open faces' UVs so the striated map's V climbs the
      // block height (leaves stack across the height); +x/-x long faces and
      // the +y/-y head/tail and the +z fore-edge all sample the leaf texture
      remapPageUVs(pagesGeo, t, blockH, blockD);
      const pageSide = new THREE.Color(pageHex);
      const headTint = toneColor(pageHex, 1.07); // top catches dust-light
      const tailTint = toneColor(pageHex, 0.86); // bottom in shadow
      pageParts.push({
        geometry: pagesGeo,
        matrix: m,
        colors: [
          pageSide, // +x long face
          pageSide, // -x long face
          headTint, // +y head
          tailTint, // -y tail
          toneColor(pageHex, 0.98), // +z fore-edge (swale shades it in the map)
          spineInnerColor // -z inner fold, hidden against the spine
        ]
      });

      // ---- spine roll + woven caps
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

      // ---- real spine: full pipeline — color pass plus a linear G/B
      // response pass so the stamped type glints under its own lobe
      const spineMat = new THREE.MeshPhysicalMaterial({
        map: realSpineTexture(book, seed, "color", finish, p.jacketed)
      });
      const response = realSpineTexture(book, seed, "response", finish, p.jacketed);
      spineMat.roughnessMap = response;
      spineMat.metalnessMap = response;
      spineMat.roughness = 1;
      spineMat.metalness = 1;
      if (p.jacketed) {
        // laminated jacket: smooth gloss skin over the printed spine
        spineMat.clearcoat = 0.62;
        spineMat.clearcoatRoughness = 0.1;
        spineMat.envMapIntensity = 1.2;
      } else if (finish === "cloth") {
        spineMat.sheen = 0.5;
        spineMat.sheenRoughness = 0.58;
        spineMat.sheenColor.copy(sheenTint);
        spineMat.bumpMap = clothTex;
        spineMat.bumpScale = 0.0005;
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

      // ---- dust-jacket head/tail gap shells: a thin paper wrapper sitting a
      // hair proud of the boards, with the board showing in the small gaps at
      // head and tail. We model this as two thin "lip" rings (one at head, one
      // at tail) of the jacket paper, slightly outside the board edges, so the
      // jacket reads as a separate proud layer. Cheap (two boxes per face) and
      // it sells the wrapper.
      if (p.jacketed) {
        const lipH = 0.004; // jacket overlaps the board face only at the ends
        const proud = 0.0006; // jacket stands this far off the board
        for (const side of [1, -1]) {
          const cx = side * ((t - COVER_T) / 2 + proud);
          for (const sy of [blockH / 2 - lipH / 2 + 0.0006, -blockH / 2 + lipH / 2 - 0.0006]) {
            const lip = new THREE.BoxGeometry(0.0004, lipH, d * 0.96);
            lip.translate(cx, sy, 0);
            jacketParts.push({ geometry: lip, matrix: m, colors: [tint, tint] });
          }
        }
      }
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
      jacketGeo: jacketParts.length ? bakeParts(jacketParts, "jacket covers") : null,
      jacketMat,
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
      {built.jacketGeo && (
        <mesh name="bookJackets" geometry={built.jacketGeo} material={built.jacketMat} castShadow receiveShadow />
      )}
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

// Remap the text block's open faces so the deckled leaf texture stacks the
// right way: V should climb the book HEIGHT on every visible face (so the
// hairline leaves run across the stack, head to tail), and U should wrap the
// face width. Box face groups are ordered +x,-x,+y,-y,+z,-z.
function remapPageUVs(
  geo: THREE.BoxGeometry,
  t: number,
  h: number,
  d: number
): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    if (nx > 0.5) {
      // long faces: U across depth, V up the height → leaves run vertically
      uv.setXY(i, (z + d / 2) / d, (y + h / 2) / h);
    } else if (nz > 0.5) {
      // fore-edge / fold: U across thickness, V up the height
      uv.setXY(i, (x + t / 2) / t, (y + h / 2) / h);
    } else if (ny > 0.5) {
      // head / tail: leaves stack across depth, so V across depth, U across t
      uv.setXY(i, (x + t / 2) / t, (z + d / 2) / d);
    }
  }
  uv.needsUpdate = true;
}

export {
  WIDTH as DESK_BOOK_ROW_WIDTH,
  DEPTH as DESK_BOOK_ROW_DEPTH,
  HEIGHT as DESK_BOOK_ROW_HEIGHT
};
