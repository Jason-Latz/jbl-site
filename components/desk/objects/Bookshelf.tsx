"use client";

import { useMemo } from "react";
import * as THREE from "three";
import {
  brushedMetalMaterial,
  lacqueredWoodMaterial,
  makeCanvasTexture
} from "@/lib/three/materials";
import { BOOKS, type Book, type BookShelfName } from "@/content/books";

const WIDTH = 0.46;
const DEPTH = 0.165;
const SIDE_T = 0.016;
const BOARD_T = 0.015;
const BACK_T = 0.007;
const BAY_CLEARANCE = 0.014;
const BOOK_DEPTH = 0.15;
const BOOK_GAP = 0.0024;
const COVER_T = 0.0022;
const OVERHANG = 0.0025; // cover-board square past the text block
const MAHOGANY = "#4a2417";
const MAHOGANY_STREAK = "#321505";

// Bay heights derive from the standing books: the carcass grows to fit its
// contents, so book data stays the single source of truth for proportions.
function shelfMaxHeight(shelf: BookShelfName): number {
  return BOOKS.reduce(
    (m, b) => (b.shelf === shelf && !b.displayFlat ? Math.max(m, b.heightM) : m),
    0
  );
}

const BOTTOM_BAY = shelfMaxHeight("current") + BAY_CLEARANCE;
const TOP_BAY = shelfMaxHeight("favorites") + BAY_CLEARANCE;
const BOTTOM_SHELF_Y = BOARD_T;
const TOP_SHELF_Y = BOARD_T + BOTTOM_BAY + BOARD_T;
const MID_BOARD_Y = BOARD_T + BOTTOM_BAY + BOARD_T / 2;
const SIDE_H = TOP_SHELF_Y + TOP_BAY;
const TOTAL_H = SIDE_H + BOARD_T;
const INNER_W = WIDTH - 2 * SIDE_T;
const BOARD_Z = (BACK_T + 0.001) / 2;
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

function tone(hex: string, mul: number): string {
  const c = new THREE.Color(hex).multiplyScalar(mul);
  c.r = Math.min(1, c.r);
  c.g = Math.min(1, c.g);
  c.b = Math.min(1, c.b);
  return `#${c.getHexString()}`;
}

// ---------------------------------------------------------------------------
// Cover finishes
//
// Real shelved books are a riot of material variety — that variety is what
// reads as "real" from across the room. Three finishes, assigned
// deterministically: cloth/linen case bindings (fabric sheen), matte paper
// dust jackets (whisper of clearcoat), and one glossier jacket that catches
// the environment as a long soft streak. The spine HUE stays per the books
// data; only the finish varies.

type Finish = "cloth" | "matte" | "gloss";

const REAL_FINISH: Record<string, Finish> = {
  "The Wise Man's Fear": "cloth", // classic cloth case with gold stamping
  "Moonwalking with Einstein": "gloss", // modern trade jacket, laminated
  "The Power Law": "matte",
  "On the Edge": "matte" // flat display copy; art face carries its own gloss
};
const FILLER_FINISHES: Finish[] = ["cloth", "matte", "cloth", "gloss", "cloth", "matte"];

// Spine textures are drawn twice: a color pass (what's there now) and a
// linear "response" pass encoding roughness in G and metalness in B, so the
// foil type glints under a separate lobe from the cover it's stamped into.
type SpinePass = "color" | "response";

// Base cover roughness per finish, carried by the response map's G channel.
const RESP_BASE: Record<Finish, string> = {
  cloth: "rgb(0,212,0)",
  matte: "rgb(0,143,0)",
  gloss: "rgb(0,92,0)"
};

// Bright foil = stamped metal leaf (smooth, metallic). Dark "foil" is gloss
// ink — smooth but dielectric, so it flashes the clearcoat instead of
// mirroring the room.
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
// normalized 0..1 UVs, so textures map exactly onto the visible face.
// Groups: material 0 = caps, material 1 = edge band.
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
    bevelSegments: 4,
    curveSegments: 5
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
  const g = new THREE.CylinderGeometry(t / 2, t / 2, h, 48, 1, true, -Math.PI / 2, Math.PI);
  g.scale(1, 1, bulge / (t / 2));
  return g;
}

function spineCapGeometry(t: number, bulge: number): THREE.CircleGeometry {
  const g = new THREE.CircleGeometry(t / 2, 24, 0, Math.PI);
  g.rotateX(Math.PI / 2);
  g.scale(1, 1, bulge / (t / 2));
  return g;
}

// Carcass side with a routed front edge: thumbnail cove into a center bead.
function sidePanelGeometry(): THREE.ExtrudeGeometry {
  const HT = SIDE_T / 2;
  const F = -DEPTH / 2; // shape +y maps to world -z after rotateX(-PI/2)
  const B = DEPTH / 2;
  const ch = 0.002;
  const s = new THREE.Shape();
  s.moveTo(-HT + ch, B);
  s.lineTo(HT - ch, B);
  s.quadraticCurveTo(HT, B, HT, B - ch);
  s.lineTo(HT, F + 0.012);
  s.quadraticCurveTo(HT, F + 0.0052, HT - 0.0044, F + 0.0046);
  s.quadraticCurveTo(HT - 0.0058, F + 0.0044, HT - 0.006, F + 0.0032);
  s.quadraticCurveTo(HT - 0.006, F + 0.0006, 0, F);
  s.quadraticCurveTo(-(HT - 0.006), F + 0.0006, -(HT - 0.006), F + 0.0032);
  s.quadraticCurveTo(-(HT - 0.0058), F + 0.0044, -(HT - 0.0044), F + 0.0046);
  s.quadraticCurveTo(-HT, F + 0.0052, -HT, F + 0.012);
  s.lineTo(-HT, B - ch);
  s.quadraticCurveTo(-HT, B, -HT + ch, B);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: SIDE_H,
    steps: 1,
    curveSegments: 6,
    bevelEnabled: true,
    bevelThickness: 0.001,
    bevelSize: 0.0008,
    bevelOffset: -0.0008,
    bevelSegments: 2
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.001, 0);
  return g;
}

// Flat satin strip swept along a curve with a slow twist.
function ribbonGeometry(
  pts: THREE.Vector3[],
  width: number,
  twist: number
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.6);
  const N = 40;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = curve.getPoint(u);
    const tan = curve.getTangent(u).normalize();
    side.crossVectors(up, tan);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    q.setFromAxisAngle(tan, twist * u);
    side.applyQuaternion(q);
    const hw = width / 2;
    positions.push(
      p.x - side.x * hw, p.y - side.y * hw, p.z - side.z * hw,
      p.x + side.x * hw, p.y + side.y * hw, p.z + side.z * hw
    );
    uvs.push(0, u, 1, u);
    if (i < N) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Canvas textures

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
    { anisotropy: 8 }
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
// the type reads stamped instead of printed. The response pass lays the same
// glyphs down flat in G/B response ink — alignment with the color pass is
// what makes the glint read as the type itself.
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

// Both passes consume the rng in the same order, so the speckle and scuffs
// land on the same texels in color and response — wear that darkens is the
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
    // hinge wear: the curl-away edges read rougher, which also stops the
    // clearcoat streak from wrapping the whole roll
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
      // scuffs scatter the finish: matte streaks across the gloss
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
      // u is mapped over the unwrapped spine arc; compensate the pixel-density
      // mismatch so type keeps a true aspect on narrow and wide spines alike.
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

function fillerSpineTexture(book: Book, seed: number): THREE.CanvasTexture {
  return makeCanvasTexture(
    256,
    1024,
    (ctx, w, h) => {
      const rnd = mulberry32(seed);
      spineBase(ctx, w, h, book, rnd);
      // sun-fade toward the head
      const fade = ctx.createLinearGradient(0, 0, 0, h * 0.5);
      fade.addColorStop(0, "rgba(255,244,220,0.1)");
      fade.addColorStop(1, "rgba(255,244,220,0)");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, w, h * 0.5);
      // blind-embossed bands
      const bands = [70 + rnd() * 30, 120 + rnd() * 30, h - 120 - rnd() * 40];
      for (const y of bands) {
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(w * 0.12, y, w * 0.76, 5);
        ctx.fillStyle = "rgba(255,250,235,0.16)";
        ctx.fillRect(w * 0.12, y + 5, w * 0.76, 2);
      }
      spineScuffs(ctx, w, h, rnd);
    },
    { anisotropy: 8 }
  );
}

// Front cover for the flat display copy: simple type and a rule line.
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

function plaqueTexture(label: string, seed: number): THREE.CanvasTexture {
  return makeCanvasTexture(
    512,
    128,
    (ctx, w, h) => {
      const rnd = mulberry32(seed);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#cba75c");
      g.addColorStop(0.45, "#a8843f");
      g.addColorStop(1, "#86662c");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 110; i++) {
        ctx.globalAlpha = 0.03 + rnd() * 0.05;
        ctx.fillStyle = rnd() > 0.5 ? "#ffe9b0" : "#54390f";
        ctx.fillRect(0, rnd() * h, w, 1);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(40,22,2,0.55)";
      ctx.lineWidth = 3;
      ctx.strokeRect(11, 11, w - 22, h - 22);
      ctx.strokeStyle = "rgba(255,235,180,0.4)";
      ctx.lineWidth = 1.5;
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
        ctx.fillStyle = "rgba(255,240,200,0.45)";
        ctx.fillText(c, x, h / 2 + 2.5);
        ctx.fillStyle = "#241502";
        ctx.fillText(c, x, h / 2);
        x += (widths[i] ?? 0) + spacing;
      });
    },
    { anisotropy: 8 }
  );
}

// ---------------------------------------------------------------------------

type BookEntry = {
  key: string;
  t: number;
  h: number;
  position: [number, number, number];
  rotation: [number, number, number];
  coverGeo: THREE.ExtrudeGeometry;
  frontMats: THREE.Material[];
  backMats: THREE.Material[];
  spineGeo: THREE.CylinderGeometry;
  capGeo: THREE.CircleGeometry;
  spineMat: THREE.Material;
  capMat: THREE.Material;
  pagesMats: THREE.Material[];
  pagesSize: [number, number, number];
  pagesZ: number;
};

type BookendEntry = {
  key: string;
  x: number;
  surfaceY: number;
};

const sideX = WIDTH / 2 - SIDE_T / 2;
const FLAT_YAW = 0.09;
const FLAT_POS: [number, number] = [-0.075, 0.008];

export default function Bookshelf() {
  const carcass = useMemo(() => {
    const rand = mulberry32(471);
    // Same lacquered-mahogany family as the desk; env per part so the case
    // reads as one piece that meets the room differently plane by plane.
    const wood = (mul: number, clearcoat: number, env = 0.9) => {
      const m = lacqueredWoodMaterial({
        base: tone(MAHOGANY, mul),
        streak: tone(MAHOGANY_STREAK, mul),
        roughness: 0.38,
        clearcoat,
        clearcoatRoughness: 0.18,
        bumpScale: 0.001
      });
      m.envMapIntensity = env;
      if (m.map) m.map.anisotropy = 8;
      return m;
    };

    const side = wood(0.96 + rand() * 0.06, 0.8, 0.95);
    if (side.map) {
      side.map.wrapS = side.map.wrapT = THREE.RepeatWrapping;
      side.map.center.set(0.5, 0.5);
      side.map.rotation = Math.PI / 2; // grain runs up the panel
      side.map.repeat.set(5, 5);
    }

    const brassEdge = new THREE.MeshStandardMaterial({
      color: "#7a5c26",
      metalness: 1,
      roughness: 0.4,
      envMapIntensity: 1.1
    });
    const plaqueFace = (label: string, seed: number) =>
      new THREE.MeshStandardMaterial({
        map: plaqueTexture(label, seed),
        metalness: 0.9,
        roughness: 0.32,
        envMapIntensity: 1.2
      });

    return {
      sideGeo: sidePanelGeometry(),
      boardGeo: plateGeometry(INNER_W + 0.006, DEPTH - BACK_T - 0.001, BOARD_T, 0.003, "y"),
      topBandGeo: plateGeometry(WIDTH + 0.002, DEPTH + 0.002, 0.006, 0.0015, "y"),
      topCapGeo: plateGeometry(WIDTH + 0.016, DEPTH + 0.008, 0.0095, 0.0028, "y"),
      backGeo: plateGeometry(INNER_W + 0.006, SIDE_H - 0.004, BACK_T, 0.0015, "z"),
      plaqueGeo: plateGeometry(0.062, 0.0125, 0.0026, 0.0008, "z"),
      uprightGeo: plateGeometry(0.112, 0.132, 0.0025, 0.0007, "x"),
      lipGeo: plateGeometry(0.112, 0.02, 0.0025, 0.0007, "x"),
      bookendBaseGeo: plateGeometry(0.078, 0.112, 0.0018, 0.0005, "y"),
      sideMat: side,
      boardMatA: wood(0.92 + rand() * 0.08, 0.75, 0.8),
      boardMatB: wood(0.95 + rand() * 0.08, 0.75, 0.8),
      // the top cap is the case's one horizontal plane to the window — it
      // carries the long env streak the way the turntable's plinth does
      topMat: wood(1.0 + rand() * 0.08, 0.9, 1.15),
      bandMat: wood(0.86 + rand() * 0.06, 0.7, 0.85),
      // interior depth: the back panel sits dark and barely answers the env,
      // so the bays read as shadowed air behind the books (N8AO finishes it)
      backMat: wood(0.62, 0.35, 0.4),
      plaqueMats: {
        favorites: [plaqueFace("favorites", 91), brassEdge],
        current: [plaqueFace("current", 92), brassEdge]
      },
      pinBrass: new THREE.MeshStandardMaterial({
        color: "#6b5122",
        metalness: 1,
        roughness: 0.45,
        envMapIntensity: 1.1
      }),
      steel: (() => {
        const m = brushedMetalMaterial("#b6babd");
        m.roughness = 0.34;
        m.envMapIntensity = 1.1;
        return m;
      })(),
      felt: new THREE.MeshStandardMaterial({ color: "#2c2724", roughness: 1 })
    };
  }, []);

  const { entries, flat, bookends, ribbonGeo, ribbonMat } = useMemo(() => {
    const rand = mulberry32(20260610);
    const pagesTex = pageEdgeTexture(77);
    const clothTex = clothTexture(78);
    // Shared micro-grain bump for jacketed covers (linear, bump-only): keeps
    // the clearcoat streak from reading as injection-molded plastic.
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
      { srgb: false, anisotropy: 4 }
    );
    const spineInner = new THREE.MeshStandardMaterial({ color: "#241a12", roughness: 0.9 });

    let bookIndex = 0;
    let fillerIndex = 0;
    const buildBook = (
      book: Book,
      key: string,
      position: [number, number, number],
      rotation: [number, number, number],
      coverArt: THREE.Texture | null
    ): BookEntry => {
      const t = book.thicknessM;
      const h = book.heightM;
      const d = BOOK_DEPTH;
      const seed = 31 + bookIndex * 17;
      bookIndex++;
      const finish: Finish = book.filler
        ? FILLER_FINISHES[fillerIndex++ % FILLER_FINISHES.length] ?? "cloth"
        : REAL_FINISH[book.title] ?? "cloth";
      // Per-book micro-variation rides its own stream so the shared layout
      // rng (z jitter, yaw, lean) stays byte-identical to the built look.
      const brand = mulberry32(seed * 13 + 5);

      const tint = new THREE.Color(book.spineColor).multiplyScalar(0.92 + rand() * 0.14);
      tint.r = Math.min(1, tint.r * 1.05);
      tint.g = Math.min(1, tint.g * 1.05);
      tint.b = Math.min(1, tint.b * 1.05);
      const sheenTint = new THREE.Color("#f6f2e9").lerp(tint, 0.42);

      // Cover boards answer the light per finish: cloth scatters it through a
      // fabric sheen lobe, matte jackets barely film it, the gloss jacket
      // pulls a long soft clearcoat streak off the environment.
      let coverFace: THREE.MeshPhysicalMaterial;
      let edgeRough = 0.82;
      let edgeCoat = 0;
      if (finish === "cloth") {
        coverFace = new THREE.MeshPhysicalMaterial({
          map: clothTex,
          color: tint,
          bumpMap: clothTex,
          bumpScale: 0.0007,
          roughness: 0.76 + brand() * 0.06,
          sheen: 0.5 + brand() * 0.25,
          sheenRoughness: 0.58,
          sheenColor: sheenTint,
          envMapIntensity: 0.55
        });
      } else if (finish === "matte") {
        coverFace = new THREE.MeshPhysicalMaterial({
          color: tint,
          bumpMap: paperTex,
          bumpScale: 0.00018,
          roughness: 0.52 + brand() * 0.06,
          clearcoat: 0.05,
          clearcoatRoughness: 0.5,
          envMapIntensity: 0.8
        });
        edgeRough = 0.6;
      } else {
        coverFace = new THREE.MeshPhysicalMaterial({
          color: tint,
          bumpMap: paperTex,
          bumpScale: 0.0001,
          roughness: 0.34 + brand() * 0.04,
          clearcoat: 0.42,
          clearcoatRoughness: 0.12 + brand() * 0.05,
          envMapIntensity: 1.15
        });
        edgeRough = 0.45;
        edgeCoat = 0.3;
      }
      const edge = new THREE.MeshPhysicalMaterial({
        color: tint.clone().multiplyScalar(0.9),
        roughness: edgeRough,
        clearcoat: edgeCoat,
        clearcoatRoughness: 0.3,
        envMapIntensity: 0.7
      });
      // Flat display copy: modern matte-laminate jacket with spot-gloss feel —
      // enough clearcoat to catch the MacBook's cool screen leak at night.
      const artFace = coverArt
        ? new THREE.MeshPhysicalMaterial({
            map: coverArt,
            roughness: 0.48,
            clearcoat: 0.18,
            clearcoatRoughness: 0.32,
            envMapIntensity: 1.0
          })
        : null;

      const spineMat = new THREE.MeshPhysicalMaterial({
        map: book.filler
          ? fillerSpineTexture(book, seed)
          : realSpineTexture(book, seed, "color", finish)
      });
      if (book.filler) {
        spineMat.roughness = finish === "cloth" ? 0.78 : finish === "matte" ? 0.55 : 0.38;
      } else {
        // The spine canvas drawn a second time as a linear G/B response map:
        // rough dielectric cover, smooth metallic foil. The type itself
        // glints when the env — or the night screen leak — sweeps it.
        const response = realSpineTexture(book, seed, "response", finish);
        spineMat.roughnessMap = response;
        spineMat.metalnessMap = response;
        spineMat.roughness = 1;
        spineMat.metalness = 1;
      }
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
      const capMat = new THREE.MeshStandardMaterial({
        color: tone(book.spineColor, 0.5),
        roughness: 0.85,
        side: THREE.DoubleSide,
        envMapIntensity: 0.5
      });

      // Page block: hairline striations all around, but the faces differ —
      // the top edge catches the room dust-soft, the fore-edge deckle and the
      // shelf-shadowed bottom sit darker and fully matte.
      const pageHex = book.pageTint ?? "#f5edd8";
      const pagesSide = new THREE.MeshStandardMaterial({
        map: pagesTex,
        color: pageHex,
        bumpMap: pagesTex,
        bumpScale: 0.0004,
        roughness: 0.95,
        envMapIntensity: 0.5
      });
      const pagesTop = new THREE.MeshStandardMaterial({
        map: pagesTex,
        color: tone(pageHex, 1.06),
        bumpMap: pagesTex,
        bumpScale: 0.0003,
        roughness: 0.82,
        envMapIntensity: 0.8
      });
      const pagesDeckle = new THREE.MeshStandardMaterial({
        map: pagesTex,
        color: tone(pageHex, 0.9),
        bumpMap: pagesTex,
        bumpScale: 0.0005,
        roughness: 0.98,
        envMapIntensity: 0.4
      });

      const bulge = Math.min(0.0065, Math.max(0.0035, t * 0.16));
      const pagesW = t - 2 * COVER_T - 0.0004;
      return {
        key,
        t,
        h,
        position,
        rotation,
        coverGeo: plateGeometry(d, h, COVER_T, 0.0008, "x"),
        frontMats: [artFace ?? coverFace, edge],
        backMats: [coverFace, edge],
        spineGeo: spineGeometry(t, h, bulge),
        capGeo: spineCapGeometry(t, bulge),
        spineMat,
        capMat,
        // box faces: +x, -x, +y (top), -y (bottom), +z (spine side), -z (fore-edge)
        pagesMats: [pagesSide, pagesSide, pagesTop, pagesDeckle, spineInner, pagesDeckle],
        pagesSize: [pagesW, h - 2 * OVERHANG, d - OVERHANG - 0.002],
        pagesZ: (OVERHANG - 0.002) / 2
      };
    };

    const list: BookEntry[] = [];
    const ends: BookendEntry[] = [];
    const shelves: { name: BookShelfName; surfaceY: number }[] = [
      { name: "favorites", surfaceY: TOP_SHELF_Y },
      { name: "current", surfaceY: BOTTOM_SHELF_Y }
    ];

    for (const shelf of shelves) {
      const order = shelfOrder(shelf.name);
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

      let cursor = -WIDTH / 2 + SIDE_T + 0.004;
      order.forEach((book, i) => {
        const t = book.thicknessM;
        const bh = book.heightM;
        let z = BOOK_BASE_Z + (rand() - 0.5) * 0.006;
        if (i === pullIndex && i !== leanIndex) z += 0.0075;

        if (i === leanIndex) {
          // rotated footprint keeps the tipped book clear of both neighbors;
          // base rests on its bottom edge, top corner kisses the next spine
          const footprint = t * Math.cos(leanAngle) + bh * Math.sin(leanAngle);
          list.push(
            buildBook(
              book,
              `${shelf.name}-${i}`,
              [
                cursor + footprint / 2,
                shelf.surfaceY + (bh * Math.cos(leanAngle) + t * Math.sin(leanAngle)) / 2,
                z
              ],
              [0, 0, -leanAngle],
              null
            )
          );
          cursor += footprint + 0.0006;
        } else {
          list.push(
            buildBook(
              book,
              `${shelf.name}-${i}`,
              [cursor + t / 2, shelf.surfaceY + bh / 2, z],
              [0, (rand() - 0.5) * 0.02, 0],
              null
            )
          );
          cursor += t + BOOK_GAP;
        }
      });

      ends.push({
        key: `${shelf.name}-end`,
        x: cursor - BOOK_GAP + 0.0008,
        surfaceY: shelf.surfaceY
      });
    }

    // the current read lies flat on the carcass top, cover up
    const flatBook = BOOKS.find((b) => b.displayFlat && !b.filler) ?? null;
    let flatEntry: BookEntry | null = null;
    let ribbon: THREE.BufferGeometry | null = null;
    if (flatBook) {
      const tF = flatBook.thicknessM;
      const [fx, fz] = FLAT_POS;
      flatEntry = buildBook(
        flatBook,
        "flat-top",
        [fx, TOTAL_H + tF / 2 + 0.0003, fz],
        [0, FLAT_YAW, Math.PI / 2],
        coverArtTexture(flatBook, 53)
      );
      // satin bookmark trailing from the tail of the text block
      const dx = Math.cos(FLAT_YAW);
      const dz = -Math.sin(FLAT_YAW);
      const hh = flatBook.heightM / 2;
      const midY = TOTAL_H + tF / 2 + 0.0003;
      ribbon = ribbonGeometry(
        [
          new THREE.Vector3(fx + dx * (hh - 0.012), midY, fz + dz * (hh - 0.012)),
          new THREE.Vector3(fx + dx * (hh + 0.006), midY - 0.001, fz + dz * (hh + 0.006)),
          new THREE.Vector3(fx + dx * (hh + 0.022), TOTAL_H + 0.004, fz + dz * (hh + 0.022) + 0.004),
          new THREE.Vector3(fx + dx * (hh + 0.048), TOTAL_H + 0.0016, fz + dz * (hh + 0.048) + 0.014),
          new THREE.Vector3(fx + dx * (hh + 0.078), TOTAL_H + 0.0012, fz + dz * (hh + 0.078) + 0.03),
          new THREE.Vector3(fx + dx * (hh + 0.102), TOTAL_H + 0.006, fz + dz * (hh + 0.102) + 0.02)
        ],
        0.009,
        1.1
      );
    }

    const satin = new THREE.MeshPhysicalMaterial({
      color: "#8c2630",
      roughness: 0.62,
      sheen: 1,
      sheenColor: new THREE.Color("#e8a0a8"),
      sheenRoughness: 0.55,
      side: THREE.DoubleSide
    });

    return {
      entries: list,
      flat: flatEntry,
      bookends: ends,
      ribbonGeo: ribbon,
      ribbonMat: satin
    };
  }, []);

  const renderBook = (e: BookEntry) => (
    <group key={e.key} position={e.position} rotation={e.rotation}>
      <mesh
        geometry={e.coverGeo}
        material={e.frontMats}
        position={[(e.t - COVER_T) / 2, 0, 0]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={e.coverGeo}
        material={e.backMats}
        position={[-(e.t - COVER_T) / 2, 0, 0]}
        castShadow
        receiveShadow
      />
      <mesh geometry={e.spineGeo} material={e.spineMat} position={[0, 0, BOOK_DEPTH / 2]} castShadow />
      <mesh geometry={e.capGeo} material={e.capMat} position={[0, e.h / 2 - 0.0006, BOOK_DEPTH / 2]} />
      <mesh geometry={e.capGeo} material={e.capMat} position={[0, -e.h / 2 + 0.0006, BOOK_DEPTH / 2]} />
      <mesh material={e.pagesMats} position={[0, 0, e.pagesZ]} castShadow receiveShadow>
        <boxGeometry args={e.pagesSize} />
      </mesh>
    </group>
  );

  return (
    <group>
      {/* carcass */}
      <mesh geometry={carcass.sideGeo} material={carcass.sideMat} position={[-sideX, 0, 0]} castShadow receiveShadow />
      <mesh geometry={carcass.sideGeo} material={carcass.sideMat} position={[sideX, 0, 0]} castShadow receiveShadow />
      <mesh geometry={carcass.boardGeo} material={carcass.boardMatA} position={[0, BOARD_T / 2, BOARD_Z]} castShadow receiveShadow />
      <mesh geometry={carcass.boardGeo} material={carcass.boardMatB} position={[0, MID_BOARD_Y, BOARD_Z]} castShadow receiveShadow />
      <mesh geometry={carcass.topBandGeo} material={carcass.bandMat} position={[0, SIDE_H + 0.003, 0.001]} castShadow />
      <mesh geometry={carcass.topCapGeo} material={carcass.topMat} position={[0, TOTAL_H - 0.00475, 0.004]} castShadow receiveShadow />
      <mesh
        geometry={carcass.backGeo}
        material={carcass.backMat}
        position={[0, SIDE_H / 2 - 0.001, -DEPTH / 2 + BACK_T / 2]}
        castShadow
        receiveShadow
      />

      {/* brass shelf plaques, pinned at both ends */}
      {(
        [
          { label: "favorites" as const, y: MID_BOARD_Y },
          { label: "current" as const, y: BOARD_T / 2 }
        ]
      ).map((p) => (
        <group key={p.label} position={[0, p.y, DEPTH / 2 + 0.0013]}>
          <mesh geometry={carcass.plaqueGeo} material={carcass.plaqueMats[p.label]} castShadow />
          {[-0.0245, 0.0245].map((px) => (
            <mesh key={px} material={carcass.pinBrass} position={[px, 0, 0.0013]} scale={[1, 1, 0.55]}>
              <sphereGeometry args={[0.0015, 12, 8]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* shelved books */}
      {entries.map(renderBook)}

      {/* display copy on top + its bookmark */}
      {flat ? renderBook(flat) : null}
      {ribbonGeo ? <mesh geometry={ribbonGeo} material={ribbonMat} castShadow /> : null}

      {/* folded-steel bookends with felt pads */}
      {bookends.map((b) => {
        const baseTop = b.surfaceY + 0.0028;
        return (
          <group key={b.key}>
            <mesh material={carcass.felt} position={[b.x + 0.039, b.surfaceY + 0.0005, BOOK_BASE_Z]}>
              <boxGeometry args={[0.07, 0.001, 0.104]} />
            </mesh>
            <mesh
              geometry={carcass.bookendBaseGeo}
              material={carcass.steel}
              position={[b.x + 0.039, b.surfaceY + 0.0019, BOOK_BASE_Z]}
              castShadow
            />
            <mesh
              geometry={carcass.uprightGeo}
              material={carcass.steel}
              position={[b.x + 0.00125, baseTop + 0.066, BOOK_BASE_Z]}
              castShadow
            />
            <mesh
              material={carcass.steel}
              position={[b.x + 0.00125, baseTop + 0.1312, BOOK_BASE_Z]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
            >
              <cylinderGeometry args={[0.0019, 0.0019, 0.108, 12]} />
            </mesh>
            <mesh
              geometry={carcass.lipGeo}
              material={carcass.steel}
              position={[b.x + 0.00125 + 0.008, baseTop + 0.1312 + 0.0051, BOOK_BASE_Z]}
              rotation={[0, 0, -1.0]}
              castShadow
            />
          </group>
        );
      })}
    </group>
  );
}

export { TOTAL_H as BOOKSHELF_HEIGHT };
