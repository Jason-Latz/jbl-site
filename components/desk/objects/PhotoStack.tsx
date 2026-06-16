"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { makeCanvasTexture } from "@/lib/three/materials";

// A loose fanned stack of 4x6" prints — the travel doorway. Seven sheets of
// matte photo stock, each a thin BOX (paper edges must catch light, planes
// read as decals), fanned with hand-tuned yaws like someone just flipped
// through them and set the pile back down. The photo faces are deliberately
// generic warm abstract landscapes (placeholders; real travel shots get
// pressed in later) — nothing identifiable, just horizon + light + grain.

// Print lies flat: long edge along local x, short edge along z.
const PRINT_W = 0.152; // 6"
const PRINT_D = 0.102; // 4"
const PRINT_T = 0.0004; // one sheet of photo stock
const BORDER = 0.005; // white border width on the printed face

// Vertical pitch between sheets. A hair more than the sheet thickness so no
// two faces ever share a plane (z-fighting) while the pile still reads as
// touching paper. 6 steps + one sheet ≈ 3.2 mm of stack.
const LIFT_STEP = 0.00046;

// Top print only: corner curl baked into the geometry (no shaders — this
// exports to glTF and gets path-traced). Quadratic ease from a 5 cm radius
// around the front-right corner, plus a faint full-sheet bow so the top
// sheet doesn't sit machine-flat.
const CURL_RADIUS = 0.05;
const CURL_LIFT = 0.0045;
const BOW_LIFT = 0.0005;

// Material slots after regrouping the box: cut paper edges / printed face /
// lab backprint.
const MAT_EDGE = 0;
const MAT_FACE = 1;
const MAT_BACK = 2;

// Hand-fanned placements, bottom to top. The fan alternates unevenly —
// a casual riffle, not a card trick — and drifts a few millimeters so the
// stack edge is ragged from every angle. Index 6 (top) carries the curl.
const PRINTS: { yaw: number; dx: number; dz: number }[] = [
  { yaw: 0.05, dx: 0.001, dz: 0.002 },
  { yaw: -0.17, dx: -0.006, dz: 0.004 },
  { yaw: 0.12, dx: 0.007, dz: -0.003 },
  { yaw: 0.23, dx: 0.003, dz: 0.006 },
  { yaw: -0.09, dx: -0.008, dz: -0.005 },
  { yaw: -0.24, dx: -0.002, dz: 0.007 },
  { yaw: 0.1, dx: 0.005, dz: -0.002 }
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

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Warm placeholder palettes — golden hour, dusty dusk, pale morning, ember
// evening. All stay inside the desk's paper/coral temperature range.
type FacePalette = {
  skyTop: string;
  skyMid: string;
  horizon: string;
  glow: string;
  ridges: [string, string, string];
};

const FACE_PALETTES: FacePalette[] = [
  {
    skyTop: "#f2dcb8",
    skyMid: "#ecb87f",
    horizon: "#df8f55",
    glow: "#ffd9a0",
    ridges: ["#a06b42", "#82533a", "#5e3d27"]
  },
  {
    skyTop: "#ecd9c8",
    skyMid: "#ddae8f",
    horizon: "#c97f5e",
    glow: "#f3c2a0",
    ridges: ["#8e5f4b", "#714939", "#553628"]
  },
  {
    skyTop: "#f4e9d2",
    skyMid: "#e6c9a1",
    horizon: "#d3a06d",
    glow: "#ffe9c2",
    ridges: ["#a5825d", "#84653f", "#66492c"]
  },
  {
    skyTop: "#e8c9a6",
    skyMid: "#d49a6a",
    horizon: "#b76b43",
    glow: "#e9a366",
    ridges: ["#7e4f33", "#623a26", "#482a1c"]
  }
];

// PLACEHOLDER landscape: white border, sky gradient down to a low sun,
// 2-3 atmospheric ridge silhouettes, haze band on the horizon, film grain,
// vignette. Every parameter is seeded so each print differs but the stack
// is identical on every load (and in the Cycles export).
function drawPrintFace(
  seed: number
): (ctx: CanvasRenderingContext2D, w: number, h: number) => void {
  return (ctx, w, h) => {
    const rand = mulberry32(seed);

    // Warm-white border stock.
    ctx.fillStyle = "#f8f5ee";
    ctx.fillRect(0, 0, w, h);

    const bx = Math.round((BORDER / PRINT_W) * w);
    const by = Math.round((BORDER / PRINT_D) * h);
    const px = bx;
    const py = by;
    const pw = w - bx * 2;
    const ph = h - by * 2;

    const pal = FACE_PALETTES[Math.floor(rand() * FACE_PALETTES.length)];
    const horizon = py + ph * (0.36 + rand() * 0.26);

    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();

    // Sky: pale at the top, saturating toward the horizon.
    const sky = ctx.createLinearGradient(0, py, 0, horizon);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(0.62, pal.skyMid);
    sky.addColorStop(1, pal.horizon);
    ctx.fillStyle = sky;
    ctx.fillRect(px, py, pw, horizon - py);

    // Ground base — the deepest ridge tone carries the foreground.
    ctx.fillStyle = pal.ridges[2];
    ctx.fillRect(px, horizon, pw, py + ph - horizon);

    // Low sun glow sitting on (or just above) the horizon.
    const sunX = px + pw * (0.22 + rand() * 0.56);
    const sunY = horizon - ph * (0.03 + rand() * 0.1);
    const sunR = ph * (0.24 + rand() * 0.16);
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
    glow.addColorStop(0, withAlpha(pal.glow, 0.85));
    glow.addColorStop(0.35, withAlpha(pal.glow, 0.4));
    glow.addColorStop(1, withAlpha(pal.glow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(px, py, pw, ph);

    // Ridge silhouettes, far to near. Farther ridges are paler (alpha lets
    // the sky bleed through, cheap aerial perspective).
    const ridgeCount = 2 + (rand() > 0.45 ? 1 : 0);
    for (let r = 0; r < ridgeCount; r++) {
      const crest = horizon + ph * (-0.04 + r * 0.1);
      ctx.fillStyle = pal.ridges[Math.min(r, 2)];
      ctx.globalAlpha = r === 0 ? 0.55 : r === 1 ? 0.8 : 1;
      ctx.beginPath();
      ctx.moveTo(px, crest + (rand() - 0.5) * ph * 0.04);
      const bumps = 4 + Math.floor(rand() * 3);
      for (let b = 1; b <= bumps; b++) {
        const x = px + (pw * b) / bumps;
        const amp = ph * (0.02 + rand() * 0.05) * (r === 0 ? 1 : 0.7);
        ctx.quadraticCurveTo(
          x - pw / bumps / 2,
          crest - amp + (rand() - 0.5) * ph * 0.02,
          x,
          crest + (rand() - 0.5) * ph * 0.05
        );
      }
      ctx.lineTo(px + pw, py + ph);
      ctx.lineTo(px, py + ph);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Haze band straddling the horizon, softening the ridge lines into it.
    const haze = ctx.createLinearGradient(
      0,
      horizon - ph * 0.1,
      0,
      horizon + ph * 0.12
    );
    haze.addColorStop(0, withAlpha(pal.glow, 0));
    haze.addColorStop(0.5, withAlpha(pal.glow, 0.28));
    haze.addColorStop(1, withAlpha(pal.glow, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(px, py, pw, ph);

    // Foreground falls into shadow toward the bottom edge.
    const fg = ctx.createLinearGradient(0, horizon, 0, py + ph);
    fg.addColorStop(0, "rgba(30,16,8,0)");
    fg.addColorStop(1, "rgba(30,16,8,0.34)");
    ctx.fillStyle = fg;
    ctx.fillRect(px, horizon, pw, py + ph - horizon);

    // Film grain: light and dark specks at low alpha.
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = rand() > 0.5 ? "#fff3e0" : "#241308";
      ctx.globalAlpha = 0.03 + rand() * 0.05;
      ctx.fillRect(px + rand() * pw, py + rand() * ph, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;

    // Vignette.
    const cx = px + pw / 2;
    const cy = py + ph / 2;
    const vig = ctx.createRadialGradient(
      cx,
      cy,
      Math.min(pw, ph) * 0.45,
      cx,
      cy,
      Math.max(pw, ph) * 0.72
    );
    vig.addColorStop(0, "rgba(46,24,12,0)");
    vig.addColorStop(1, "rgba(46,24,12,0.22)");
    ctx.fillStyle = vig;
    ctx.fillRect(px, py, pw, ph);

    ctx.restore();

    // Crisp hairline where the emulsion meets the border.
    ctx.strokeStyle = "rgba(60,38,20,0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
  };
}

// Back of the print: photo-paper white with faint diagonal lab backprint
// rows ("4R" is the trade name for a 4x6), the way a minilab roller lays
// them down. Shared by all seven sheets.
function drawBackprint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  const rand = mulberry32(0xbacc5eed);
  ctx.fillStyle = "#f6f3ec";
  ctx.fillRect(0, 0, w, h);

  // Paper fiber flecks.
  ctx.strokeStyle = "#e3ddd0";
  ctx.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    ctx.globalAlpha = 0.2 + rand() * 0.3;
    const x = rand() * w;
    const y = rand() * h;
    const a = rand() * Math.PI;
    const l = 2 + rand() * 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.31);
  ctx.fillStyle = "#9db3c4";
  ctx.globalAlpha = 0.32;
  ctx.font = "500 17px Helvetica, Arial, sans-serif";
  ctx.textBaseline = "middle";
  const stamp = "JL PHOTO LAB  ·  MATTE  ·  4R";
  const stampW = ctx.measureText(stamp).width + 90;
  let row = 0;
  for (let y = -h * 0.75; y <= h * 0.75; y += 58) {
    const offset = (row % 2) * (stampW / 2);
    for (let x = -w * 0.85 - offset; x < w * 0.85; x += stampW) {
      ctx.fillText(stamp, x, y);
    }
    row++;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// The default camera looks down the -z axis, so a print at yaw 0 should hold
// its sky on the far (-z) edge to read right-side-up from the rest pose.
// BoxGeometry puts uv.y=1 at +z on the +y face — rotate the top-face UVs
// 180° (flip both axes, no mirroring) instead of flipping every canvas.
function flipTopFaceUVs(geo: THREE.BufferGeometry): void {
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < nor.count; i++) {
    if (nor.getY(i) > 0.9) {
      uv.setXY(i, 1 - uv.getX(i), 1 - uv.getY(i));
    }
  }
  uv.needsUpdate = true;
}

// Bend the whole slab (top, bottom, AND the segmented side walls, so the
// paper edge follows the curl): quadratic lift around the front-right
// corner plus a faint center bow. BoxGeometry never shares vertices across
// faces, so recomputed normals smooth along the sheet but the 90° paper
// edges stay crisp.
function applyCornerCurl(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const corner = Math.hypot(PRINT_W / 2 - x, PRINT_D / 2 - z);
    const t = Math.max(0, 1 - corner / CURL_RADIUS);
    // Parabolic dome: zero at all four edges, BOW_LIFT at the center.
    const u = (2 * x) / PRINT_W;
    const v = (2 * z) / PRINT_D;
    const bow = BOW_LIFT * (1 - u * u) * (1 - v * v);
    pos.setY(i, pos.getY(i) + CURL_LIFT * t * t + bow);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// BoxGeometry ships six material groups (one per face = six draw calls).
// Reorder the index so the four edge walls are contiguous, then regroup to
// three slots: edges / printed face / backprint. Three draws per print.
function regroupPrintBox(geo: THREE.BoxGeometry): void {
  const index = geo.getIndex();
  if (!index) return;
  const groups = geo.groups; // BoxGeometry order: +x, -x, +y, -y, +z, -z
  const topCount = groups[2].count;
  const bottomCount = groups[3].count;
  const sideCount =
    groups[0].count + groups[1].count + groups[4].count + groups[5].count;
  const order = [0, 1, 4, 5, 2, 3]; // sides first, then top, then bottom
  const merged: number[] = [];
  for (const gi of order) {
    const g = groups[gi];
    for (let i = 0; i < g.count; i++) {
      merged.push(index.getX(g.start + i));
    }
  }
  geo.setIndex(merged);
  geo.clearGroups();
  geo.addGroup(0, sideCount, MAT_EDGE);
  geo.addGroup(sideCount, topCount, MAT_FACE);
  geo.addGroup(sideCount + topCount, bottomCount, MAT_BACK);
}

// One sheet, base at y=0 like every desk object. The six flat prints share
// a single unsegmented box; the curled top print gets its own segmented one.
function makePrintGeometry(curled: boolean): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(
    PRINT_W,
    PRINT_T,
    PRINT_D,
    curled ? 36 : 1,
    1,
    curled ? 26 : 1
  );
  flipTopFaceUVs(geo);
  if (curled) applyCornerCurl(geo);
  regroupPrintBox(geo);
  geo.translate(0, PRINT_T / 2, 0);
  return geo;
}

export default function PhotoStack() {
  const geo = useMemo(
    () => ({
      flat: makePrintGeometry(false),
      curled: makePrintGeometry(true)
    }),
    []
  );

  const materialSets = useMemo(() => {
    // Border stock is bare paper (full roughness); the emulsion area is a
    // touch smoother. roughnessMap multiplies the scalar, so 0.62 lands the
    // photo area at ~0.53 and the border at 0.62. Border geometry is
    // identical on every print, so one map serves all faces (and survives
    // the 180° top-face UV rotation because it's symmetric).
    const roughnessMap = makeCanvasTexture(
      192,
      128,
      (ctx, w, h) => {
        ctx.fillStyle = "rgb(255,255,255)";
        ctx.fillRect(0, 0, w, h);
        const bx = Math.round((BORDER / PRINT_W) * w);
        const by = Math.round((BORDER / PRINT_D) * h);
        ctx.fillStyle = "rgb(216,216,216)";
        ctx.fillRect(bx, by, w - bx * 2, h - by * 2);
      },
      { srgb: false }
    );

    // Raw cut edge of the stock — slightly warmer than the coated face.
    const edge = new THREE.MeshStandardMaterial({
      color: "#ece5d6",
      roughness: 0.9,
      metalness: 0
    });

    const back = new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(768, 512, drawBackprint, { anisotropy: 8 }),
      roughness: 0.8,
      metalness: 0
    });

    // Matte photo paper: mostly diffuse with the faint sheen a matte coat
    // still has when the lamp rakes it — a whisper of clearcoat, no metal.
    return PRINTS.map((_, i) => {
      const face = new THREE.MeshPhysicalMaterial({
        map: makeCanvasTexture(768, 512, drawPrintFace(0x9043 + i * 0x21f), {
          anisotropy: 8
        }),
        roughnessMap,
        roughness: 0.62,
        metalness: 0,
        clearcoat: 0.15,
        clearcoatRoughness: 0.45
      });
      return [edge, face, back] as THREE.Material[];
    });
  }, []);

  return (
    <group name="photoStack">
      {PRINTS.map((p, i) => (
        <mesh
          key={i}
          name={`photoPrint${i}`}
          geometry={i === PRINTS.length - 1 ? geo.curled : geo.flat}
          material={materialSets[i]}
          position={[p.dx, i * LIFT_STEP, p.dz]}
          rotation={[0, p.yaw, 0]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
