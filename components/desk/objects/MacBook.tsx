"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { Html, RoundedBox } from "@react-three/drei";
import { RoundedBoxGeometry } from "three-stdlib";
import { PALETTE, makeCanvasTexture } from "@/lib/three/materials";
import { useDeskTheme } from "../DeskThemeContext";

const BASE_W = 0.31;
const BASE_D = 0.22;
const BASE_T = 0.016;
const FOOT_H = 0.0025;
const BASE_TOP = FOOT_H + BASE_T;
const LID_W = 0.306;
const LID_H = 0.215;
const LID_T = 0.0045;
const HINGE_Y = BASE_TOP - 0.001;
const HINGE_Z = BASE_D / 2 - 0.012;
const LID_CY = LID_H / 2 - 0.002;

// Keyboard plan: 14.5 key-units across, function row half height, 5 full rows.
const KB_W = 0.272;
const KB_D = 0.105;
const KB_CZ = 0.042;
const KB_BACK = KB_CZ + KB_D / 2;
const UNIT = KB_W / 14.5;
const KEY_GAP = 0.0018;
const ROW_PITCH = 0.0187;
const FN_PITCH = KB_D - 5 * ROW_PITCH;
const CAP_D = ROW_PITCH - KEY_GAP;
const FN_CAP_D = FN_PITCH - KEY_GAP;
const HALF_CAP_D = (CAP_D - KEY_GAP) / 2;
const KEY_T = 0.0018;
const WELL_TOP = BASE_TOP + 0.001;
const KEY_PROUD = 0.0012;
const KEY_CY = WELL_TOP + KEY_PROUD - KEY_T / 2;

const TP_W = 0.118;
const TP_D = 0.0795;
const TP_CZ = -0.0542;

const FEET: [number, number][] = [
  [-0.136, -0.092],
  [0.136, -0.092],
  [-0.136, 0.092],
  [0.136, 0.092]
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

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// ---------------------------------------------------------------------------
// Key layout — 78 caps sharing a handful of rounded-box geometries.

type KeyStyle = "glyph" | "word" | "fn" | "power" | "arrow" | "none";
type KeyDef = {
  x: number;
  z: number;
  w: number;
  d: number;
  legend: string;
  style: KeyStyle;
};
type RowKey = {
  u: number;
  legend: string;
  style: KeyStyle;
  stack?: boolean;
  halfBottom?: boolean;
};

const SHIFT_SYMS: Record<string, string> = {
  "`": "~",
  "1": "!",
  "2": "@",
  "3": "#",
  "4": "$",
  "5": "%",
  "6": "^",
  "7": "&",
  "8": "*",
  "9": "(",
  "0": ")",
  "-": "_",
  "=": "+",
  "[": "{",
  "]": "}",
  "\\": "|",
  ";": ":",
  "'": '"',
  ",": "<",
  ".": ">",
  "/": "?"
};

function buildKeys(): KeyDef[] {
  const g = (legend: string): RowKey => ({ u: 1, legend, style: "glyph" });
  const fnRow: RowKey[] = [
    { u: 1.5, legend: "esc", style: "word" },
    ...Array.from({ length: 12 }, (_, i) => ({
      u: 1,
      legend: `F${i + 1}`,
      style: "fn" as KeyStyle
    })),
    { u: 1, legend: "", style: "power" }
  ];
  const numRow: RowKey[] = [
    g("`"),
    ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="].map(g),
    { u: 1.5, legend: "delete", style: "word" }
  ];
  const tabRow: RowKey[] = [
    { u: 1.5, legend: "tab", style: "word" },
    ...["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"].map(g)
  ];
  const capsRow: RowKey[] = [
    { u: 1.75, legend: "caps lock", style: "word" },
    ...["A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"].map(g),
    { u: 1.75, legend: "return", style: "word" }
  ];
  const shiftRow: RowKey[] = [
    { u: 2.25, legend: "shift", style: "word" },
    ...["Z", "X", "C", "V", "B", "N", "M", ",", ".", "/"].map(g),
    { u: 2.25, legend: "shift", style: "word" }
  ];
  const bottomRow: RowKey[] = [
    { u: 1, legend: "fn", style: "word" },
    { u: 1, legend: "control", style: "word" },
    { u: 1, legend: "option", style: "word" },
    { u: 1.25, legend: "command", style: "word" },
    { u: 5, legend: "", style: "none" },
    { u: 1.25, legend: "command", style: "word" },
    { u: 1, legend: "option", style: "word" },
    { u: 1, legend: "left", style: "arrow", halfBottom: true },
    { u: 1, legend: "", style: "arrow", stack: true },
    { u: 1, legend: "right", style: "arrow", halfBottom: true }
  ];

  const rows: { keys: RowKey[]; z: number; d: number }[] = [
    { keys: fnRow, z: KB_BACK - FN_PITCH / 2, d: FN_CAP_D }
  ];
  [numRow, tabRow, capsRow, shiftRow, bottomRow].forEach((keys, i) => {
    rows.push({
      keys,
      z: KB_BACK - FN_PITCH - i * ROW_PITCH - ROW_PITCH / 2,
      d: CAP_D
    });
  });

  // User-left is +x in this scene, so the cursor walks from +x toward -x.
  const out: KeyDef[] = [];
  for (const row of rows) {
    let cx = KB_W / 2;
    for (const k of row.keys) {
      const span = k.u * UNIT;
      const x = cx - span / 2;
      const w = span - KEY_GAP;
      if (k.stack) {
        out.push({
          x,
          z: row.z + row.d / 2 - HALF_CAP_D / 2,
          w,
          d: HALF_CAP_D,
          legend: "up",
          style: "arrow"
        });
        out.push({
          x,
          z: row.z - row.d / 2 + HALF_CAP_D / 2,
          w,
          d: HALF_CAP_D,
          legend: "down",
          style: "arrow"
        });
      } else if (k.halfBottom) {
        out.push({
          x,
          z: row.z - row.d / 2 + HALF_CAP_D / 2,
          w,
          d: HALF_CAP_D,
          legend: k.legend,
          style: "arrow"
        });
      } else {
        out.push({ x, z: row.z, w, d: row.d, legend: k.legend, style: k.style });
      }
      cx -= span;
    }
  }
  return out;
}

const KEYS = buildKeys();
const WORN_LEGENDS = new Set(["", "A", "S", "D", "F", "J", "K", "L", "E", "command"]);

function keyGeoId(k: KeyDef): string {
  return `${k.w.toFixed(5)}|${k.d.toFixed(5)}`;
}

// ---------------------------------------------------------------------------
// Canvas art.

function drawAluminum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number,
  tone: string,
  light: string,
  dark: string
): void {
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 380; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const len = 60 + rng() * 320;
    ctx.strokeStyle = rng() > 0.5 ? light : dark;
    ctx.globalAlpha = 0.015 + rng() * 0.03;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + len);
    ctx.stroke();
  }
  // blasted-anodize speckle
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rng() > 0.5 ? light : dark;
    ctx.globalAlpha = 0.02 + rng() * 0.05;
    ctx.fillRect(rng() * w, rng() * h, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function drawSunburstSticker(
  ctx: CanvasRenderingContext2D,
  size: number,
  rotationDeg: number,
  rayCount: number,
  shape: "circle" | "squircle",
  paper: string,
  rng: () => number
): void {
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 320; i++) {
    ctx.fillStyle = rng() > 0.5 ? "rgba(120,110,90,0.06)" : "rgba(255,255,255,0.07)";
    ctx.fillRect(rng() * size, rng() * size, 1.6, 1.6);
  }

  const r = size / 2;
  ctx.save();
  ctx.translate(r, r);
  ctx.rotate((rotationDeg * Math.PI) / 180);

  const trace = (radius: number) => {
    if (shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
    } else {
      roundedRectPath(ctx, -radius, -radius, radius * 2, radius * 2, radius * 0.42);
    }
  };
  trace(r * 0.93);
  ctx.strokeStyle = "#b3ad9d";
  ctx.lineWidth = size * 0.012;
  ctx.stroke();

  // hand-drawn sunburst: tapered petal rays with per-ray jitter
  const inner = r * 0.1;
  const outer = r * 0.62;
  for (let i = 0; i < rayCount; i++) {
    ctx.save();
    ctx.rotate((i / rayCount) * Math.PI * 2 + (rng() - 0.5) * 0.09);
    const len = outer * (0.9 + rng() * 0.18);
    const wBase = r * (0.075 + rng() * 0.03);
    ctx.globalAlpha = 0.9 + rng() * 0.1;
    ctx.beginPath();
    ctx.moveTo(inner, -wBase);
    ctx.quadraticCurveTo(len * 0.55, -wBase * 1.12, len, 0);
    ctx.quadraticCurveTo(len * 0.55, wBase * 1.12, inner, wBase);
    ctx.closePath();
    ctx.fillStyle = PALETTE.claudeOrange;
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.075, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.claudeOrange;
  ctx.fill();
  ctx.restore();
}

// Keyboard legends + per-key concave shading. The overlay is drawn rotated
// 180deg so glyphs read upright for someone seated at the laptop's front.
function drawLegends(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w, h);
  ctx.rotate(Math.PI);

  const sx = w / KB_W;
  const sy = h / KB_D;
  const font = "-apple-system, 'Helvetica Neue', Arial, sans-serif";

  for (const k of KEYS) {
    const px = (0.5 - k.x / KB_W) * w;
    const py = ((KB_BACK - k.z) / KB_D) * h;
    const kw = k.w * sx;
    const kh = k.d * sy;

    // hairline plateau line + faint dished center
    ctx.strokeStyle = "rgba(0,0,0,0.26)";
    ctx.lineWidth = 1.6;
    roundedRectPath(ctx, px - kw / 2 + 4, py - kh / 2 + 4, kw - 8, kh - 8, 9);
    ctx.stroke();
    const dish = ctx.createRadialGradient(px, py, kw * 0.1, px, py, kw * 0.55);
    dish.addColorStop(0, "rgba(0,0,0,0.10)");
    dish.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = dish;
    roundedRectPath(ctx, px - kw / 2 + 3, py - kh / 2 + 3, kw - 6, kh - 6, 10);
    ctx.fill();

    const ink = 0.82 + rng() * 0.12;
    ctx.fillStyle = `rgba(214,217,222,${ink.toFixed(3)})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (k.style === "glyph") {
      const sym = SHIFT_SYMS[k.legend];
      if (sym) {
        ctx.font = `500 19px ${font}`;
        ctx.fillText(sym, px, py - kh * 0.2);
        ctx.font = `500 23px ${font}`;
        ctx.fillText(k.legend, px, py + kh * 0.22);
      } else {
        ctx.font = `500 29px ${font}`;
        ctx.fillText(k.legend, px, py + 1);
      }
    } else if (k.style === "word") {
      ctx.font = `400 17px ${font}`;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(k.legend, px, py + kh / 2 - 10);
    } else if (k.style === "fn") {
      ctx.font = `400 15px ${font}`;
      ctx.globalAlpha = 0.78;
      ctx.fillText(k.legend, px, py + 1);
      ctx.globalAlpha = 1;
    } else if (k.style === "power") {
      ctx.strokeStyle = `rgba(214,217,222,${ink.toFixed(3)})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.stroke();
    } else if (k.style === "arrow") {
      const s = 7;
      ctx.beginPath();
      if (k.legend === "up") {
        ctx.moveTo(px, py - s);
        ctx.lineTo(px - s, py + s * 0.8);
        ctx.lineTo(px + s, py + s * 0.8);
      } else if (k.legend === "down") {
        ctx.moveTo(px, py + s);
        ctx.lineTo(px - s, py - s * 0.8);
        ctx.lineTo(px + s, py - s * 0.8);
      } else if (k.legend === "left") {
        ctx.moveTo(px - s, py);
        ctx.lineTo(px + s * 0.8, py - s);
        ctx.lineTo(px + s * 0.8, py + s);
      } else {
        ctx.moveTo(px + s, py);
        ctx.lineTo(px - s * 0.8, py - s);
        ctx.lineTo(px - s * 0.8, py + s);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Display — a believable editor at 2048x1280.

type CodeSeg = [color: string, text: string];
type CodeLine = { ind: number; segs: CodeSeg[] };

const C_KW = "#c678dd";
const C_FN = "#61afef";
const C_STR = "#98c379";
const C_NUM = "#d19a66";
const C_TYP = "#e5c07b";
const C_VAR = "#abb2bf";
const C_PUN = "#7a818c";
const C_CMT = "#5f6672";
const C_TAG = "#e06c75";

function codeLines(): CodeLine[] {
  const L = (ind: number, ...segs: CodeSeg[]): CodeLine => ({ ind, segs });
  return [
    L(0, [C_KW, "import"], [C_PUN, " * "], [C_KW, "as"], [C_VAR, " THREE "], [C_KW, "from"], [C_STR, ' "three"'], [C_PUN, ";"]),
    L(0, [C_KW, "import"], [C_PUN, " { "], [C_VAR, "useMemo"], [C_PUN, ", "], [C_VAR, "useRef"], [C_PUN, " } "], [C_KW, "from"], [C_STR, ' "react"'], [C_PUN, ";"]),
    L(0, [C_KW, "import"], [C_PUN, " { "], [C_VAR, "RoundedBox"], [C_PUN, " } "], [C_KW, "from"], [C_STR, ' "@react-three/drei"'], [C_PUN, ";"]),
    L(0),
    L(0, [C_CMT, "// 78 keys, one shared geometry per cap size"]),
    L(0, [C_KW, "const"], [C_VAR, " KEY_PITCH "], [C_PUN, "= "], [C_NUM, "0.0187"], [C_PUN, ";"]),
    L(0, [C_KW, "const"], [C_VAR, " LID_TILT "], [C_PUN, "= "], [C_NUM, "110"], [C_PUN, ";"]),
    L(0),
    L(0, [C_KW, "export default function"], [C_FN, " MacBook"], [C_PUN, "() {"]),
    L(1, [C_KW, "const"], [C_PUN, " { "], [C_VAR, "mixRef"], [C_PUN, " } = "], [C_FN, "useDeskTheme"], [C_PUN, "();"]),
    L(1, [C_KW, "const"], [C_VAR, " glowRef "], [C_PUN, "= "], [C_FN, "useRef"], [C_PUN, "<"], [C_TYP, "THREE.PointLight"], [C_PUN, ">("], [C_KW, "null"], [C_PUN, ");"]),
    L(0),
    L(1, [C_KW, "const"], [C_VAR, " keys "], [C_PUN, "= "], [C_FN, "useMemo"], [C_PUN, "(() => {"]),
    L(2, [C_KW, "const"], [C_VAR, " rng "], [C_PUN, "= "], [C_FN, "mulberry32"], [C_PUN, "("], [C_NUM, "0x5eed"], [C_PUN, ");"]),
    L(2, [C_KW, "return"], [C_VAR, " KEY_ROWS"], [C_PUN, "."], [C_FN, "flatMap"], [C_PUN, "(("], [C_VAR, "row"], [C_PUN, ", "], [C_VAR, "i"], [C_PUN, ") =>"]),
    L(3, [C_FN, "layoutRow"], [C_PUN, "("], [C_VAR, "row"], [C_PUN, ", "], [C_VAR, "i"], [C_PUN, ")."], [C_FN, "map"], [C_PUN, "(("], [C_VAR, "key"], [C_PUN, ") => ({"]),
    L(4, [C_PUN, "..."], [C_VAR, "key"], [C_PUN, ","]),
    L(4, [C_VAR, "yaw"], [C_PUN, ": ("], [C_FN, "rng"], [C_PUN, "() - "], [C_NUM, "0.5"], [C_PUN, ") * "], [C_NUM, "0.006"], [C_PUN, ","]),
    L(3, [C_PUN, "}))"]),
    L(2, [C_PUN, ");"]),
    L(1, [C_PUN, "}, []);"]),
    L(0),
    L(1, [C_FN, "useFrame"], [C_PUN, "(() => {"]),
    L(2, [C_KW, "const"], [C_VAR, " mix "], [C_PUN, "= "], [C_VAR, "mixRef"], [C_PUN, "."], [C_VAR, "current"], [C_PUN, ";"]),
    L(2, [C_VAR, "screen"], [C_PUN, "."], [C_VAR, "emissiveIntensity"], [C_PUN, " = "], [C_FN, "lerp"], [C_PUN, "("], [C_NUM, "1.5"], [C_PUN, ", "], [C_NUM, "0.35"], [C_PUN, ", "], [C_VAR, "mix"], [C_PUN, ");"]),
    L(1, [C_PUN, "});"]),
    L(0),
    L(1, [C_KW, "return"], [C_PUN, " ("]),
    L(2, [C_PUN, "<"], [C_TAG, "group"], [C_PUN, ">"])
  ];
}

type TreeRow = {
  label: string;
  depth: number;
  kind: "folder" | "file";
  active?: boolean;
};

const TREE_ROWS: TreeRow[] = [
  { label: "website", depth: 0, kind: "folder" },
  { label: "app", depth: 1, kind: "folder" },
  { label: "page.tsx", depth: 2, kind: "file" },
  { label: "components", depth: 1, kind: "folder" },
  { label: "desk", depth: 2, kind: "folder" },
  { label: "objects", depth: 3, kind: "folder" },
  { label: "MacBook.tsx", depth: 4, kind: "file", active: true },
  { label: "DeskLamp.tsx", depth: 4, kind: "file" },
  { label: "Turntable.tsx", depth: 4, kind: "file" },
  { label: "Chessboard.tsx", depth: 4, kind: "file" },
  { label: "layout.ts", depth: 3, kind: "file" },
  { label: "lib", depth: 1, kind: "folder" },
  { label: "three", depth: 2, kind: "folder" },
  { label: "materials.ts", depth: 3, kind: "file" },
  { label: "package.json", depth: 1, kind: "file" },
  { label: "tsconfig.json", depth: 1, kind: "file" }
];

function drawDisplay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const mono = "'SF Mono', Menlo, Consolas, monospace";
  const ui = "-apple-system, 'Helvetica Neue', Arial, sans-serif";
  const SIDEBAR = 330;
  const TITLE_H = 64;
  const TAB_H = 48;
  const STATUS_Y = h - 64;
  const GUTTER_R = 430;
  const CODE_X = 446;
  const MINIMAP_X = 1912;
  const LH = 38;
  const lines = codeLines();
  const caretLine = 17;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  roundedRectPath(ctx, 0, 0, w, h, 36);
  ctx.clip();

  // panes
  ctx.fillStyle = "#1d1e23";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#17181d";
  ctx.fillRect(0, TITLE_H, SIDEBAR, STATUS_Y - TITLE_H);
  ctx.fillRect(SIDEBAR, TITLE_H, w - SIDEBAR, TAB_H);
  ctx.fillStyle = "#191a1f";
  ctx.fillRect(MINIMAP_X, TITLE_H + TAB_H, w - MINIMAP_X, STATUS_Y - TITLE_H - TAB_H);
  ctx.fillStyle = "#212229";
  ctx.fillRect(0, 0, w, TITLE_H);
  ctx.fillStyle = "#131419";
  ctx.fillRect(0, STATUS_Y, w, h - STATUS_Y);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(0, 0, w, 2);

  // title bar: traffic lights, title, status glyphs
  [
    ["#ff5f57", 36],
    ["#febc2e", 68],
    ["#28c840", 100]
  ].forEach(([color, x]) => {
    ctx.beginPath();
    ctx.arc(x as number, 32, 11, 0, Math.PI * 2);
    ctx.fillStyle = color as string;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  ctx.font = `500 24px ${ui}`;
  ctx.fillStyle = "#83878f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("MacBook.tsx — website", 560, 33);
  // battery + time at right
  ctx.strokeStyle = "#7d818a";
  ctx.lineWidth = 2;
  roundedRectPath(ctx, 1856, 22, 42, 20, 5);
  ctx.stroke();
  ctx.fillStyle = "#7d818a";
  ctx.fillRect(1860, 26, 26, 12);
  ctx.fillRect(1899, 28, 4, 8);
  ctx.font = `500 22px ${ui}`;
  ctx.textAlign = "left";
  ctx.fillText("9:41", 1928, 33);

  // camera notch over the menu bar
  roundedRectPath(ctx, w / 2 - 210, -16, 420, 66, 16);
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w / 2, 25, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#0b0c10";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w / 2 - 2, 23, 2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(110,135,180,0.6)";
  ctx.fill();

  // sidebar file tree
  ctx.font = `600 19px ${ui}`;
  ctx.fillStyle = "#6a6e76";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("EXPLORER", 26, 110);
  TREE_ROWS.forEach((row, i) => {
    const y = 168 + i * 44;
    const x = 24 + row.depth * 26;
    if (row.active) {
      ctx.fillStyle = "#2a2c34";
      ctx.fillRect(0, y - 22, SIDEBAR, 44);
      ctx.fillStyle = PALETTE.claudeOrange;
      ctx.fillRect(0, y - 22, 4, 44);
    }
    if (row.kind === "folder") {
      ctx.fillStyle = "#878c95";
      ctx.beginPath();
      ctx.moveTo(x - 1, y - 4);
      ctx.lineTo(x + 11, y - 4);
      ctx.lineTo(x + 5, y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#b7bcc4";
      ctx.font = `500 22px ${ui}`;
      ctx.fillText(row.label, x + 22, y);
    } else {
      const tint = row.label.endsWith(".tsx")
        ? "#61afef"
        : row.label.endsWith(".json")
          ? "#98c379"
          : "#e5c07b";
      ctx.strokeStyle = tint;
      ctx.lineWidth = 2;
      roundedRectPath(ctx, x, y - 10, 14, 19, 3);
      ctx.stroke();
      ctx.fillStyle = row.active ? "#e8eaee" : "#989ea8";
      ctx.font = `400 22px ${ui}`;
      ctx.fillText(row.label, x + 26, y);
    }
  });

  // tabs
  const tabs: [string, number, boolean][] = [
    ["MacBook.tsx", 340, true],
    ["materials.ts", 320, false],
    ["layout.ts", 290, false]
  ];
  let tx = SIDEBAR;
  for (const [label, tw, active] of tabs) {
    ctx.fillStyle = active ? "#1d1e23" : "#15161a";
    ctx.fillRect(tx, TITLE_H, tw, TAB_H);
    if (active) {
      ctx.fillStyle = PALETTE.claudeOrange;
      ctx.fillRect(tx, TITLE_H, tw, 3);
    }
    ctx.fillStyle = "#0c0d10";
    ctx.fillRect(tx + tw - 1, TITLE_H, 1, TAB_H);
    ctx.font = `${active ? 500 : 400} 24px ${ui}`;
    ctx.fillStyle = active ? "#e6e8ec" : "#84888f";
    ctx.fillText(label, tx + 26, TITLE_H + TAB_H / 2 + 1);
    if (active) {
      ctx.beginPath();
      ctx.arc(tx + tw - 28, TITLE_H + TAB_H / 2, 6, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.claudeOrange;
      ctx.fill();
    }
    tx += tw;
  }

  // editor: current line, indent guides, gutter, tokens, caret
  const baseY = TITLE_H + TAB_H + 28;
  ctx.font = `500 24px ${mono}`;
  lines.forEach((line, i) => {
    const y = baseY + i * LH;
    if (i === caretLine) {
      ctx.fillStyle = "rgba(255,255,255,0.045)";
      ctx.fillRect(GUTTER_R, y - 26, MINIMAP_X - GUTTER_R, LH);
    }
    for (let lvl = 1; lvl <= line.ind; lvl++) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(CODE_X + lvl * 56 - 44, y - 26, 1, LH);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = i === caretLine ? "#9aa0ab" : "#4a4e57";
    ctx.fillText(String(i + 1), GUTTER_R - 18, y);
    ctx.textAlign = "left";
    let x = CODE_X + line.ind * 56;
    for (const [color, text] of line.segs) {
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      x += ctx.measureText(text).width;
    }
    if (i === caretLine) {
      ctx.fillStyle = "#e8eaee";
      ctx.fillRect(x + 3, y - 17, 3, 30);
    }
  });

  // minimap
  lines.forEach((line, i) => {
    const y = TITLE_H + TAB_H + 16 + i * 9;
    let x = MINIMAP_X + 10 + line.ind * 6;
    for (const [color, text] of line.segs) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, Math.min(text.length * 2.4, 90), 4);
      x += text.length * 2.4 + 3;
      if (x > w - 16) break;
    }
  });
  ctx.globalAlpha = 1;

  // status bar: Claude chip, branch, cursor info
  roundedRectPath(ctx, 28, STATUS_Y + 12, 218, 40, 10);
  ctx.fillStyle = PALETTE.claudeOrange;
  ctx.fill();
  ctx.save();
  ctx.translate(62, STATUS_Y + 32);
  ctx.fillStyle = "#3a1c0e";
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(4, -1.6);
    ctx.quadraticCurveTo(9, -2, 13, 0);
    ctx.quadraticCurveTo(9, 2, 4, 1.6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.font = `600 25px ${ui}`;
  ctx.fillStyle = "#2e1810";
  ctx.fillText("Claude", 86, STATUS_Y + 33);
  ctx.strokeStyle = "#858b94";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(282, STATUS_Y + 24, 5, 0, Math.PI * 2);
  ctx.moveTo(282, 29 + STATUS_Y);
  ctx.lineTo(282, STATUS_Y + 40);
  ctx.stroke();
  ctx.font = `400 22px ${ui}`;
  ctx.fillStyle = "#858b94";
  ctx.fillText("main", 298, STATUS_Y + 33);
  ctx.textAlign = "right";
  ctx.fillText("TypeScript JSX", 2012, STATUS_Y + 33);
  ctx.fillText("UTF-8", 1790, STATUS_Y + 33);
  ctx.fillText("Ln 18, Col 31", 1664, STATUS_Y + 33);
  ctx.textAlign = "left";

  // gentle panel falloff toward the edges
  const vig = ctx.createLinearGradient(0, 0, 0, h);
  vig.addColorStop(0, "rgba(0,0,0,0.10)");
  vig.addColorStop(0.12, "rgba(0,0,0,0)");
  vig.addColorStop(0.88, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------------------

// 14" space-gray MacBook. Rests CLOSED with the sticker lid face-up to the
// 45-degree camera (in dark mode it sits ajar, leaking a blade of screen
// light); `open` swings the lid to ~110deg for the work focus. Screen faces
// -z when open. Hovering/tapping the stickers shows the Made-with-Claude
// signature.
type MacBookProps = {
  open: boolean;
};

export default function MacBook({ open }: MacBookProps) {
  const { theme, mixRef } = useDeskTheme();
  const glowRef = useRef<THREE.PointLight>(null);
  const lidRef = useRef<THREE.Group>(null);
  const [creditShown, setCreditShown] = useState(false);

  const baseMetal = useMemo(() => {
    const rng = mulberry32(0xa11_0b01);
    const tex = makeCanvasTexture(
      1024,
      1024,
      (ctx, w, h) => drawAluminum(ctx, w, h, rng, "#8d9095", "#9da0a6", "#7e8186"),
      { anisotropy: 8 }
    );
    const material = new THREE.MeshPhysicalMaterial({
      map: tex,
      metalness: 0.88,
      roughness: 0.42,
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
      envMapIntensity: 1.15
    });
    material.bumpMap = tex;
    material.bumpScale = 0.0004;
    return material;
  }, []);

  const lidMetal = useMemo(() => {
    const rng = mulberry32(0xa11_0b02);
    const tex = makeCanvasTexture(
      1024,
      1024,
      (ctx, w, h) => drawAluminum(ctx, w, h, rng, "#93969b", "#a3a6ac", "#84878d"),
      { anisotropy: 8 }
    );
    const material = new THREE.MeshPhysicalMaterial({
      map: tex,
      metalness: 0.88,
      roughness: 0.4,
      clearcoat: 0.25,
      clearcoatRoughness: 0.32,
      envMapIntensity: 1.15
    });
    material.bumpMap = tex;
    material.bumpScale = 0.0004;
    return material;
  }, []);

  const sharedMats = useMemo(
    () => ({
      well: new THREE.MeshStandardMaterial({
        color: "#141519",
        roughness: 0.55,
        metalness: 0.35
      }),
      rubber: new THREE.MeshStandardMaterial({
        color: "#1b1c1f",
        roughness: 0.92,
        metalness: 0
      }),
      port: new THREE.MeshStandardMaterial({
        color: "#0c0d0f",
        roughness: 0.4,
        metalness: 0.6
      }),
      hinge: new THREE.MeshStandardMaterial({
        color: "#3c3d42",
        metalness: 0.85,
        roughness: 0.34
      }),
      antenna: new THREE.MeshStandardMaterial({
        color: "#232428",
        roughness: 0.55,
        metalness: 0.05
      }),
      vent: new THREE.MeshStandardMaterial({
        color: "#101114",
        roughness: 0.6,
        metalness: 0.3
      }),
      scoopTop: new THREE.MeshStandardMaterial({
        color: "#1f2024",
        roughness: 0.5,
        metalness: 0.4
      }),
      bezel: new THREE.MeshPhysicalMaterial({
        color: "#07080a",
        roughness: 0.32,
        metalness: 0.1,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2
      }),
      stickerRim: new THREE.MeshStandardMaterial({
        color: "#c9c2b0",
        roughness: 0.8,
        metalness: 0
      })
    }),
    []
  );

  const scoopFrontMaterial = useMemo(() => {
    const tex = makeCanvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1d1e22");
      g.addColorStop(1, "#3a3c41");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.5,
      metalness: 0.45
    });
  }, []);

  // 78 caps share one geometry per distinct cap size
  const keyGeometries = useMemo(() => {
    const cache = new Map<string, RoundedBoxGeometry>();
    for (const k of KEYS) {
      const id = keyGeoId(k);
      if (!cache.has(id)) {
        cache.set(id, new RoundedBoxGeometry(k.w, KEY_T, k.d, 4, 0.0006));
      }
    }
    return cache;
  }, []);

  const keyMaterials = useMemo(
    () => [
      new THREE.MeshPhysicalMaterial({
        color: "#19191c",
        roughness: 0.6,
        metalness: 0.04,
        clearcoat: 0.15,
        clearcoatRoughness: 0.45
      }),
      new THREE.MeshPhysicalMaterial({
        color: "#1b1b1f",
        roughness: 0.66,
        metalness: 0.04,
        clearcoat: 0.12,
        clearcoatRoughness: 0.5
      }),
      // finger-polished caps: slightly darker, noticeably glossier
      new THREE.MeshPhysicalMaterial({
        color: "#16161a",
        roughness: 0.45,
        metalness: 0.05,
        clearcoat: 0.3,
        clearcoatRoughness: 0.3
      })
    ],
    []
  );

  // stable per-key imperfections: sub-0.1mm drift + a whisper of yaw
  const keyJitter = useMemo(() => {
    const rng = mulberry32(0x5eed_cab5);
    return KEYS.map((k) => ({
      x: (rng() - 0.5) * 0.00012,
      y: (rng() - 0.5) * 0.00008,
      z: (rng() - 0.5) * 0.00012,
      yaw: (rng() - 0.5) * 0.012,
      mat: WORN_LEGENDS.has(k.legend) ? 2 : rng() > 0.5 ? 0 : 1
    }));
  }, []);

  const legendMaterial = useMemo(() => {
    const rng = mulberry32(0x5eed_1e9e);
    const tex = makeCanvasTexture(
      2048,
      800,
      (ctx, w, h) => drawLegends(ctx, w, h, rng),
      { anisotropy: 8 }
    );
    return new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      roughness: 1,
      metalness: 0,
      emissive: "#dfe6ff",
      emissiveMap: tex,
      emissiveIntensity: 0.5
    });
  }, []);

  const grilleMaterial = useMemo(() => {
    const tex = makeCanvasTexture(
      128,
      824,
      (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        for (let y = 10; y < h - 6; y += 9) {
          for (let x = 8; x < w - 4; x += 9) {
            ctx.fillStyle = "rgba(255,255,255,0.07)";
            ctx.beginPath();
            ctx.arc(x, y + 1.2, 2.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(6,6,8,0.92)";
            ctx.beginPath();
            ctx.arc(x, y, 2.1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      },
      { anisotropy: 8 }
    );
    return new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      roughness: 0.5,
      metalness: 0.3
    });
  }, []);

  const trackpadMaterial = useMemo(() => {
    const tex = makeCanvasTexture(512, 346, (ctx, w, h) => {
      ctx.fillStyle = "#898b90";
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w * 0.3, h);
      g.addColorStop(0, "rgba(255,255,255,0.08)");
      g.addColorStop(0.5, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(0,0,0,0.06)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    return new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: 0.22,
      metalness: 0.5,
      clearcoat: 0.55,
      clearcoatRoughness: 0.15,
      envMapIntensity: 1.2
    });
  }, []);

  const trackpadGroove = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1b1c1f",
        roughness: 0.5,
        metalness: 0.2
      }),
    []
  );

  const screenMaterial = useMemo(() => {
    const texture = makeCanvasTexture(2048, 1280, drawDisplay, { anisotropy: 8 });
    return new THREE.MeshStandardMaterial({
      color: "#000000",
      emissive: "#ffffff",
      emissiveMap: texture,
      emissiveIntensity: 1.5,
      roughness: 0.4,
      metalness: 0
    });
  }, []);

  const screenGlass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#9eb2c8",
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        roughness: 0.05,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.5
      }),
    []
  );

  // raised vinyl sticker decals: Shape + thin bevelled extrude, real parallax
  const stickers = useMemo(() => {
    const rng = mulberry32(0x571c_4e2);
    const defs = [
      { shape: "circle" as const, size: 0.0508, x: -0.051, y: 0.018, rot: -14, rays: 11, paper: "#f0eee5", tilt: -0.06 },
      { shape: "squircle" as const, size: 0.0403, x: 0.048, y: -0.024, rot: 9, rays: 10, paper: "#ece9de", tilt: 0.04 },
      { shape: "circle" as const, size: 0.0329, x: 0.027, y: 0.052, rot: 28, rays: 9, paper: "#f2f0e8", tilt: 0.1 }
    ];
    return defs.map((def) => {
      const shape = new THREE.Shape();
      if (def.shape === "circle") {
        shape.absarc(0.5, 0.5, 0.5, 0, Math.PI * 2, false);
      } else {
        const r = 0.24;
        shape.moveTo(r, 0);
        shape.lineTo(1 - r, 0);
        shape.quadraticCurveTo(1, 0, 1, r);
        shape.lineTo(1, 1 - r);
        shape.quadraticCurveTo(1, 1, 1 - r, 1);
        shape.lineTo(r, 1);
        shape.quadraticCurveTo(0, 1, 0, 1 - r);
        shape.lineTo(0, r);
        shape.quadraticCurveTo(0, 0, r, 0);
      }
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.00026,
        curveSegments: 48,
        bevelEnabled: true,
        bevelThickness: 0.00008,
        bevelSize: 0.008,
        bevelSegments: 2
      });
      geometry.translate(-0.5, -0.5, 0);
      const texture = makeCanvasTexture(512, 512, (ctx, w) =>
        drawSunburstSticker(ctx, w, def.rot, def.rays, def.shape, def.paper, rng)
      );
      const face = new THREE.MeshPhysicalMaterial({
        map: texture,
        roughness: 0.5,
        metalness: 0,
        clearcoat: 0.45,
        clearcoatRoughness: 0.35
      });
      return { def, geometry, face };
    });
  }, []);

  const footGeometry = useMemo(() => {
    const control = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.0042, 0, 0),
      new THREE.Vector3(0.0054, 0.0007, 0),
      new THREE.Vector3(0.0055, 0.0014, 0),
      new THREE.Vector3(0.0045, 0.0021, 0),
      new THREE.Vector3(0.0022, 0.0025, 0),
      new THREE.Vector3(0.0004, 0.0025, 0)
    ];
    const curve = new THREE.CatmullRomCurve3(control);
    const pts = curve
      .getPoints(20)
      .map((p) => new THREE.Vector2(Math.max(p.x, 0), THREE.MathUtils.clamp(p.y, 0, FOOT_H)));
    return new THREE.LatheGeometry(pts, 28);
  }, []);

  const portGeometry = useMemo(
    () => new RoundedBoxGeometry(0.0006, 0.0028, 0.0095, 2, 0.00028),
    []
  );

  const scoopGeometry = useMemo(
    () => new THREE.CircleGeometry(1, 32, Math.PI, Math.PI),
    []
  );

  const bezelGeometry = useMemo(
    () => new THREE.ShapeGeometry(roundedRectShape(0.298, 0.206, 0.007), 12),
    []
  );

  const footJitter = useMemo(() => {
    const rng = mulberry32(0x5eed_f007);
    return FEET.map(() => ({
      s: 0.98 + rng() * 0.04,
      rot: rng() * Math.PI
    }));
  }, []);

  // rotation.x = 0 would be a 90deg pose; jitter keeps the pose human.
  // Closed rests a hair proud so the lid clears the key caps; the dark-mode
  // ajar pose leaks screen light through the wedge.
  const lidPose = useMemo(() => {
    const rng = mulberry32(0x5eed_11d);
    return {
      open: THREE.MathUtils.degToRad(110 + (rng() - 0.5) * 3) - Math.PI / 2,
      closed: -Math.PI / 2 + 0.035,
      ajar: -Math.PI / 2 + 0.13,
      slop: (rng() - 0.5) * 0.008
    };
  }, []);

  useFrame((_, delta) => {
    const mix = mixRef.current;
    const lid = lidRef.current;
    let openFraction = 1;
    if (lid) {
      const target = open
        ? lidPose.open
        : theme === "dark"
          ? lidPose.ajar
          : lidPose.closed;
      lid.rotation.x = THREE.MathUtils.damp(lid.rotation.x, target, 3.2, delta);
      const targetLift = open ? 0 : 0.004;
      lid.position.y = THREE.MathUtils.damp(
        lid.position.y,
        HINGE_Y + targetLift,
        3.2,
        delta
      );
      openFraction = THREE.MathUtils.clamp(
        ((lid.rotation.x - lidPose.closed) / (lidPose.open - lidPose.closed)) * 6,
        0,
        1
      );
    }
    screenMaterial.emissiveIntensity =
      THREE.MathUtils.lerp(1.5, 0.35, mix) * openFraction;
    legendMaterial.emissiveIntensity =
      THREE.MathUtils.lerp(0.5, 0.04, mix) * openFraction;
    if (glowRef.current) {
      glowRef.current.intensity =
        THREE.MathUtils.lerp(0.16, 0, mix) * openFraction;
    }
  });

  return (
    <group>
      {FEET.map((pos, index) => (
        <mesh
          key={index}
          geometry={footGeometry}
          material={sharedMats.rubber}
          position={[pos[0], 0.00002, pos[1]]}
          scale={[footJitter[index].s, 1, 2 - footJitter[index].s]}
          rotation={[0, footJitter[index].rot, 0]}
          castShadow
        />
      ))}

      <RoundedBox
        args={[BASE_W, BASE_T, BASE_D]}
        radius={0.0035}
        smoothness={5}
        position={[0, FOOT_H + BASE_T / 2, 0]}
        castShadow
        receiveShadow
        material={baseMetal}
      />

      {/* thumb scoop illusion: a dark sector caps the front edge round-over,
          meeting a half-ellipse on the face and a crescent on the deck */}
      <mesh
        material={sharedMats.scoopTop}
        position={[0, BASE_TOP - 0.0035, -BASE_D / 2 + 0.0035]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry
          args={[0.00357, 0.00357, 0.052, 24, 1, true, Math.PI / 2 - 0.12, Math.PI / 2 + 0.24]}
        />
      </mesh>
      <mesh
        geometry={scoopGeometry}
        material={scoopFrontMaterial}
        position={[0, BASE_TOP - 0.0034, -BASE_D / 2 - 0.0002]}
        rotation={[0, Math.PI, 0]}
        scale={[0.026, 0.005, 1]}
      />
      <mesh
        geometry={scoopGeometry}
        material={sharedMats.scoopTop}
        position={[0, BASE_TOP + 0.00018, -BASE_D / 2 + 0.0035]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[0.026, 0.0038, 1]}
      />

      {/* keyboard well, keys, backlit legend overlay */}
      <RoundedBox
        args={[0.277, 0.0016, 0.1085]}
        radius={0.0007}
        smoothness={3}
        position={[0, BASE_TOP + 0.0002, KB_CZ]}
        receiveShadow
        material={sharedMats.well}
      />
      {KEYS.map((k, i) => (
        <mesh
          key={`k${i}`}
          geometry={keyGeometries.get(keyGeoId(k))!}
          material={keyMaterials[keyJitter[i].mat]}
          position={[k.x + keyJitter[i].x, KEY_CY + keyJitter[i].y, k.z + keyJitter[i].z]}
          rotation={[0, keyJitter[i].yaw, 0]}
        />
      ))}
      <mesh
        position={[0, WELL_TOP + KEY_PROUD + 0.0002, KB_CZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={legendMaterial}
      >
        <planeGeometry args={[KB_W, KB_D]} />
      </mesh>

      {/* speaker grilles flanking the keyboard */}
      {[-1, 1].map((side) => (
        <mesh
          key={`grille${side}`}
          position={[side * (KB_W / 2 + 0.0105), BASE_TOP + 0.00015, KB_CZ]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={grilleMaterial}
        >
          <planeGeometry args={[0.016, 0.103]} />
        </mesh>
      ))}

      {/* glass trackpad with hairline groove border */}
      <mesh
        position={[0, BASE_TOP + 0.00012, TP_CZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={trackpadGroove}
      >
        <planeGeometry args={[TP_W + 0.0024, TP_D + 0.0024]} />
      </mesh>
      <RoundedBox
        args={[TP_W, 0.0012, TP_D]}
        radius={0.0005}
        smoothness={3}
        position={[0, BASE_TOP - 0.0003, TP_CZ]}
        material={trackpadMaterial}
      />

      {/* side ports: 2 on the user's left (+x), 1 on the right */}
      {[
        [BASE_W / 2 - 0.0001, 0.012],
        [BASE_W / 2 - 0.0001, 0.034],
        [-(BASE_W / 2 - 0.0001), 0.022]
      ].map(([x, z], i) => (
        <mesh
          key={`port${i}`}
          geometry={portGeometry}
          material={sharedMats.port}
          position={[x, 0.0125, z]}
        />
      ))}

      {/* rear thermal slot under the hinge */}
      <RoundedBox
        args={[0.252, 0.005, 0.003]}
        radius={0.0012}
        smoothness={2}
        position={[0, BASE_TOP - 0.0035, BASE_D / 2 - 0.0012]}
        material={sharedMats.vent}
      />

      {/* hinge barrel with aluminum end caps */}
      <mesh
        position={[0, HINGE_Y, HINGE_Z]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        material={sharedMats.hinge}
      >
        <cylinderGeometry args={[0.0046, 0.0046, 0.206, 40]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`cap${side}`}
          position={[side * 0.106, HINGE_Y, HINGE_Z]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
          material={lidMetal}
        >
          <cylinderGeometry args={[0.0052, 0.0052, 0.013, 32]} />
        </mesh>
      ))}

      <group
        ref={lidRef}
        position={[0, HINGE_Y, HINGE_Z]}
        rotation={[lidPose.closed, lidPose.slop, 0]}
      >
        <RoundedBox
          args={[LID_W, LID_H, LID_T]}
          radius={0.0018}
          smoothness={5}
          position={[0, LID_CY, 0]}
          castShadow
          material={lidMetal}
        />

        {/* antenna window wrapping the lid's bottom edge */}
        <RoundedBox
          args={[LID_W - 0.006, 0.0085, LID_T + 0.0006]}
          radius={0.0015}
          smoothness={3}
          position={[0, 0, 0]}
          material={sharedMats.antenna}
        />

        {/* raised sticker decals on the lid back — also the site's signature:
            hovering or tapping them reveals the Made-with-Claude chip */}
        <group
          onPointerOver={(event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation();
            document.body.style.cursor = "pointer";
            setCreditShown(true);
          }}
          onPointerOut={() => {
            document.body.style.cursor = "auto";
            setCreditShown(false);
          }}
          onClick={(event: ThreeEvent<MouseEvent>) => {
            event.stopPropagation();
            setCreditShown((shown) => !shown);
          }}
        >
          {stickers.map(({ def, geometry, face }, i) => (
            <mesh
              key={`sticker${i}`}
              geometry={geometry}
              material={[face, sharedMats.stickerRim]}
              position={[def.x, LID_CY + def.y, LID_T / 2 + 0.0001]}
              rotation={[0, 0, def.tilt]}
              scale={[def.size, def.size, 1]}
            />
          ))}
        </group>
        {creditShown ? (
          <Html
            position={[
              stickers[0]?.def.x ?? 0,
              LID_CY + (stickers[0]?.def.y ?? 0),
              LID_T / 2 + 0.02
            ]}
            center
            distanceFactor={0.5}
            zIndexRange={[6, 1]}
          >
            <a
              className="desk-credit desk-credit-anchored"
              href="https://claude.com/claude-code"
              target="_blank"
              rel="noreferrer"
            >
              <span className="desk-credit-line">Made with Claude</span>
              <span className="desk-credit-sub">
                the stickers are on Jason's real laptop too
              </span>
            </a>
          </Html>
        ) : null}

        {/* screen stack: black bezel, emissive panel, reflective cover glass */}
        <mesh
          geometry={bezelGeometry}
          material={sharedMats.bezel}
          position={[0, LID_CY, -LID_T / 2 - 0.0002]}
          rotation={[0, Math.PI, 0]}
        />
        <mesh
          position={[0, LID_CY + 0.0008, -LID_T / 2 - 0.0005]}
          rotation={[0, Math.PI, 0]}
          material={screenMaterial}
        >
          <planeGeometry args={[0.292, 0.1825]} />
        </mesh>
        <mesh
          position={[0, LID_CY, -LID_T / 2 - 0.0009]}
          rotation={[0, Math.PI, 0]}
          material={screenGlass}
        >
          <planeGeometry args={[0.301, 0.209]} />
        </mesh>

        <pointLight
          ref={glowRef}
          position={[0, 0.115, -0.05]}
          color="#bcd6ff"
          intensity={0.16}
          distance={0.75}
          decay={2}
        />
      </group>
    </group>
  );
}
