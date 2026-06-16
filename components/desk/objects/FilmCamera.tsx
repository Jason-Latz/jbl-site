"use client";

// Vintage 35mm rangefinder film camera, standing ready on the desk —
// black leatherette body wrapped between brushed-chrome top and bottom
// plates, a 40mm lens with knurled focus ring pointing at +z (the room).
// Everything is procedural: the body is a rounded-rect extrusion, the
// pebble grain / engraved scales / lens coating are canvas textures, and
// all static chrome jewelry (hot shoe, strap lugs, bezels, rewind crank)
// bakes into a single merged geometry so the whole camera stays cheap.
//
// Conventions: meters, base at y=0, bounding box centered on the origin
// (the body sits toward -z so the lens snout still lands inside ±0.0375).
// Export-safe: only Standard/Physical materials, no transmission.

import { useMemo } from "react";
import * as THREE from "three";
import { mergeBufferGeometries, RoundedBoxGeometry } from "three-stdlib";
import { RoundedBox } from "@react-three/drei";
import {
  PALETTE,
  makeCanvasTexture,
  chromeMaterial,
  plasticMaterial
} from "@/lib/three/materials";

// Body envelope. Plates overhang the leatherette midsection by ~0.4mm a
// side; strap lugs poke past the rounded ends, lens past the front plate.
const BODY_W = 0.128;
const BODY_D = 0.034;
const PLATE_W = 0.1288;
const PLATE_D = 0.0348;
const BEVEL = 0.0003;

const TOP_PLATE_Y0 = 0.0565; // top plate base
const TOP_Y = 0.0685; // top plate surface — dials and knobs sit on this
const ZC = -0.0198; // body z-center; back of plates lands at -0.0375
const BACK_Z = ZC - PLATE_D / 2 - BEVEL; // rear plate face

// Lens: axis slightly right of center and above body mid-height, like the
// real rangefinders this is modeled after. Stack runs 0..0.0402 in local z.
const LENS_X = 0.0055;
const LENS_Y = 0.0335;
const LENS_Z = -0.004; // flange tail buried ~1.2mm into the body front

const GLASS_R = 0.0125;
const GLASS_SAG = 0.0012; // shallow convex dome on the front element

// Advance lever rests kicked out over the back edge. At -0.3 the thumb tip
// clipped ~4mm into the shutter dial drum (hub-to-dial is only 30mm and the
// lever reaches 32.6mm); -0.8 swings the tip's worst corner ~14mm from the
// dial axis (drum r=7.8mm) — real ready-stance geometry.
const LEVER_SWING = -0.8;

// Rounded-rectangle plan of the body — near-semicircular ends, the classic
// rangefinder silhouette. Drawn in XY, extruded along +Z, stood up later.
function roundedPlanShape(w: number, d: number, r: number): THREE.Shape {
  const hw = w / 2;
  const hd = d / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hw, hd - r);
  s.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hw + r, hd);
  s.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hd + r);
  s.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// Extrude a plan shape into a horizontal slab: rotate the +Z extrusion up
// into +Y and translate so the slab's base sits at yBase. Extrude UVs are
// world-unit, so the pebble/brushed textures tile by physical repeat.
function slabGeometry(
  w: number,
  d: number,
  r: number,
  height: number,
  yBase: number,
  bevel: boolean
): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(roundedPlanShape(w, d, r), {
    depth: bevel ? height - BEVEL * 2 : height,
    bevelEnabled: bevel,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 2,
    curveSegments: 28
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, yBase + (bevel ? BEVEL : 0), ZC);
  return geometry;
}

// Static same-material decorations bake into one draw (Chessboard pattern).
type Part = {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
};

function bakeParts(parts: Part[]): THREE.BufferGeometry {
  const merged = mergeBufferGeometries(
    parts.map((p) => {
      const geometry = p.geometry.index
        ? p.geometry.toNonIndexed()
        : p.geometry.clone();
      if (p.rotation) {
        geometry.applyMatrix4(
          new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...p.rotation))
        );
      }
      geometry.translate(...p.position);
      return geometry;
    })
  );
  if (!merged) {
    throw new Error("FilmCamera: chrome detail merge failed.");
  }
  return merged;
}

// Characters marched around a circle — for the engraved lens name ring.
function ringText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number
): void {
  const step = (Math.PI * 2) / text.length;
  for (let i = 0; i < text.length; i++) {
    const angle = i * step;
    ctx.save();
    ctx.translate(cx + Math.sin(angle) * radius, cy - Math.cos(angle) * radius);
    ctx.rotate(angle);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
}

export default function FilmCamera() {
  const geo = useMemo(() => {
    // Chrome bottom plate / leatherette midsection / chrome top plate.
    // The midsection over-runs 0.3mm into both plates so no caps are
    // coplanar (no z-fighting at the seams).
    const bottomPlate = slabGeometry(PLATE_W, PLATE_D, 0.0166, 0.0045, 0, true);
    const body = slabGeometry(BODY_W, BODY_D, 0.0162, 0.0526, 0.0042, false);
    const topPlate = slabGeometry(PLATE_W, PLATE_D, 0.0166, 0.012, TOP_PLATE_Y0, true);

    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
    const cyl = (rt: number, rb: number, h: number, seg = 32) =>
      new THREE.CylinderGeometry(rt, rb, h, seg);
    const ring = (r: number, tube: number, a = 10, b = 40) =>
      new THREE.TorusGeometry(r, tube, a, b);

    // Every static chrome bauble in one geometry: hot shoe (base, two
    // risers, two inward flanges), strap lug bosses + D-rings, the frame
    // counter and eyepiece bezels, shutter button collar, and the rewind
    // knob's cap + folded crank arm + handle nub.
    const chromeDetails = bakeParts([
      { geometry: box(0.0128, 0.0012, 0.0128), position: [0, 0.0691, ZC] },
      { geometry: box(0.0016, 0.0024, 0.0128), position: [0.0056, 0.0709, ZC] },
      { geometry: box(0.0016, 0.0024, 0.0128), position: [-0.0056, 0.0709, ZC] },
      { geometry: box(0.0034, 0.0008, 0.0128), position: [0.0047, 0.0717, ZC] },
      { geometry: box(0.0034, 0.0008, 0.0128), position: [-0.0047, 0.0717, ZC] },
      {
        geometry: cyl(0.0032, 0.0032, 0.003, 24),
        position: [0.064, 0.05, ZC],
        rotation: [0, 0, Math.PI / 2]
      },
      {
        geometry: cyl(0.0032, 0.0032, 0.003, 24),
        position: [-0.064, 0.05, ZC],
        rotation: [0, 0, Math.PI / 2]
      },
      { geometry: ring(0.0024, 0.0008, 10, 32), position: [0.0655, 0.05, ZC] },
      { geometry: ring(0.0024, 0.0008, 10, 32), position: [-0.0655, 0.05, ZC] },
      {
        geometry: ring(0.0028, 0.0006, 8, 32),
        position: [0.033, 0.0686, -0.03],
        rotation: [Math.PI / 2, 0, 0]
      },
      { geometry: ring(0.004, 0.0009, 10, 40), position: [-0.039, 0.0625, -0.0376] },
      { geometry: cyl(0.004, 0.0044, 0.0026, 28), position: [0.035, 0.0698, -0.0115] },
      { geometry: cyl(0.008, 0.008, 0.001, 32), position: [-0.0485, 0.0758, ZC] },
      { geometry: box(0.013, 0.0016, 0.004), position: [-0.0485, 0.0768, ZC] },
      { geometry: cyl(0.0016, 0.0016, 0.0026, 16), position: [-0.0437, 0.0788, ZC] }
    ]);

    // The two dark glass windows on the top plate's front face (viewfinder
    // + rangefinder) share a material, so they merge too. The frosted
    // frameline window between them stays its own mesh.
    const vfGlass = bakeParts([
      {
        geometry: new RoundedBoxGeometry(0.0125, 0.0072, 0.0014, 2, 0.0005),
        position: [-0.039, 0.0625, -0.0024]
      },
      {
        geometry: new RoundedBoxGeometry(0.005, 0.005, 0.0014, 2, 0.0005),
        position: [0.0275, 0.0625, -0.0024]
      }
    ]);

    // Front element: a shallow spherical dome lathed from a circle arc.
    // Opaque polished near-black — the painted coating map below carries
    // the iris/reflection illusion (no transmission allowed for export).
    const sphereR = (GLASS_R * GLASS_R + GLASS_SAG * GLASS_SAG) / (2 * GLASS_SAG);
    const thetaMax = Math.asin(GLASS_R / sphereR);
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const theta = thetaMax * (1 - i / 12);
      profile.push(
        new THREE.Vector2(
          Math.max(sphereR * Math.sin(theta), 0.0001),
          sphereR * Math.cos(theta) - (sphereR - GLASS_SAG)
        )
      );
    }
    const glassDome = new THREE.LatheGeometry(profile, 64);

    // Trim ring: open outer wall + annular front face with a 12.7mm bore
    // (a capped cylinder here would wall off the recess and hide the front
    // element entirely). Built along +Y, stood up to +Z at the call site.
    const trimRing = bakeParts([
      {
        geometry: new THREE.CylinderGeometry(0.0179, 0.0179, 0.0056, 48, 1, true),
        position: [0, 0, 0]
      },
      {
        geometry: new THREE.RingGeometry(0.0127, 0.0179, 48),
        position: [0, 0.0028, 0],
        rotation: [-Math.PI / 2, 0, 0]
      }
    ]);

    // Recess liner: open tube lining the trim ring's bore front-to-back,
    // sealed by a matte disc behind the glass rim so the 0.2mm rim/wall
    // sliver never reads through to the barrel interior.
    const lensRecess = bakeParts([
      {
        geometry: new THREE.CylinderGeometry(0.0127, 0.0127, 0.0054, 48, 1, true),
        position: [0, 0, 0]
      },
      {
        geometry: new THREE.CircleGeometry(0.0127, 48),
        position: [0, -0.0025, 0],
        rotation: [-Math.PI / 2, 0, 0]
      }
    ]);

    return {
      bottomPlate,
      body,
      topPlate,
      chromeDetails,
      vfGlass,
      glassDome,
      trimRing,
      lensRecess
    };
  }, []);

  const mats = useMemo(() => {
    // Leatherette: fine pebble grain. Extrude UVs are in meters, so at
    // repeat 85 one tile spans ~12mm — pebbles land at ~0.5mm, real grain
    // scale. Color mottle and bump come from sibling canvases.
    const pebbleColor = makeCanvasTexture(
      256,
      256,
      (ctx, w, h) => {
        ctx.fillStyle = "#191613";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 620; i++) {
          const tone = 20 + Math.floor(Math.random() * 14);
          ctx.fillStyle = `rgb(${tone + 9},${tone + 5},${tone})`;
          ctx.globalAlpha = 0.25 + Math.random() * 0.4;
          ctx.beginPath();
          ctx.arc(
            Math.random() * w,
            Math.random() * h,
            3.5 + Math.random() * 3,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
      { repeat: [85, 85], anisotropy: 8 }
    );

    const pebbleBump = makeCanvasTexture(
      256,
      256,
      (ctx, w, h) => {
        ctx.fillStyle = "#6f6f6f";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 620; i++) {
          const x = Math.random() * w;
          const y = Math.random() * h;
          const r = 3.5 + Math.random() * 3;
          const dome = ctx.createRadialGradient(x, y, 0.5, x, y, r);
          dome.addColorStop(0, "rgba(180,180,180,0.9)");
          dome.addColorStop(0.7, "rgba(140,140,140,0.45)");
          dome.addColorStop(1, "rgba(110,110,110,0)");
          ctx.fillStyle = dome;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        // Crease pits between pebbles.
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = "#4c4c4c";
        for (let i = 0; i < 240; i++) {
          ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;
      },
      { srgb: false, repeat: [85, 85], anisotropy: 8 }
    );

    const leatherette = new THREE.MeshStandardMaterial({
      map: pebbleColor,
      bumpMap: pebbleBump,
      bumpScale: 0.00045,
      roughness: 0.8,
      metalness: 0.05
    });

    // Brushed variation across the chrome plates: faint horizontal streaks
    // in a roughness map (green channel multiplies material roughness).
    const brushedRough = makeCanvasTexture(
      256,
      256,
      (ctx, w, h) => {
        ctx.fillStyle = "#bababa";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 220; i++) {
          const y = Math.random() * h;
          const length = w * (0.2 + Math.random() * 0.8);
          ctx.strokeStyle = Math.random() < 0.5 ? "#9e9e9e" : "#d4d4d4";
          ctx.globalAlpha = 0.05 + Math.random() * 0.09;
          ctx.lineWidth = 0.8 + Math.random() * 0.8;
          ctx.beginPath();
          ctx.moveTo(Math.random() * (w - length), y);
          ctx.lineTo(Math.random() * (w - length) + length, y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
      { srgb: false, repeat: [14, 14], anisotropy: 8 }
    );

    const plate = new THREE.MeshStandardMaterial({
      color: "#e9e6df",
      metalness: 0.9,
      roughness: 0.34,
      roughnessMap: brushedRough
    });
    plate.envMapIntensity = 1.15;

    const chrome = chromeMaterial();
    chrome.envMapIntensity = 1.2;

    const darkChrome = new THREE.MeshStandardMaterial({
      color: "#8b8880",
      metalness: 0.9,
      roughness: 0.28
    });

    const blackMetal = new THREE.MeshStandardMaterial({
      color: "#23211d",
      metalness: 0.85,
      roughness: 0.34
    });

    // Knurling: vertical ridge strips wrapped around cylinders by repeat.
    const knurl = (repeatX: number) =>
      makeCanvasTexture(
        64,
        64,
        (ctx, w, h) => {
          ctx.fillStyle = "#585858";
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = "#b8b8b8";
          for (let x = 0; x < w; x += 8) {
            ctx.fillRect(x, 0, 4, h);
          }
        },
        { srgb: false, repeat: [repeatX, 1], anisotropy: 8 }
      );

    const knurlFocus = new THREE.MeshStandardMaterial({
      color: "#26241f",
      metalness: 0.85,
      roughness: 0.4,
      bumpMap: knurl(96),
      bumpScale: 0.0004
    });

    const knurlRewind = new THREE.MeshStandardMaterial({
      color: "#cfccc5",
      metalness: 0.92,
      roughness: 0.3,
      bumpMap: knurl(56),
      bumpScale: 0.0003
    });

    const knurlDial = new THREE.MeshStandardMaterial({
      color: "#c6c3bc",
      metalness: 0.92,
      roughness: 0.32,
      bumpMap: knurl(44),
      bumpScale: 0.00025
    });

    // Shutter speed dial face: engraved-look radial speeds (double-draw —
    // light fill offset below dark fill reads as stamped metal).
    const dialFaceMap = makeCanvasTexture(
      256,
      256,
      (ctx, w, h) => {
        const c = w / 2;
        ctx.fillStyle = "#8e8b84";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#5d5a54";
        ctx.lineWidth = 3;
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          ctx.globalAlpha = i % 4 === 0 ? 0.8 : 0.35;
          ctx.beginPath();
          ctx.moveTo(c + Math.sin(a) * 112, c - Math.cos(a) * 112);
          ctx.lineTo(c + Math.sin(a) * 122, c - Math.cos(a) * 122);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const speeds = ["1000", "500", "250", "125", "60", "30", "15", "8", "4", "2", "1", "B"];
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 21px Helvetica, Arial, sans-serif";
        speeds.forEach((s, i) => {
          const a = (i / speeds.length) * Math.PI * 2;
          ctx.save();
          ctx.translate(c + Math.sin(a) * 86, c - Math.cos(a) * 86);
          ctx.rotate(a);
          ctx.fillStyle = "#c4c0b6";
          ctx.fillText(s, 0, 2);
          ctx.fillStyle = "#2d2a25";
          ctx.fillText(s, 0, 0);
          ctx.restore();
        });
        // Center retaining screw with a slot.
        ctx.fillStyle = "#75726b";
        ctx.beginPath();
        ctx.arc(c, c, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#3c3933";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(c - 22, c - 9);
        ctx.lineTo(c + 22, c + 9);
        ctx.stroke();
      },
      { anisotropy: 8 }
    );

    const dialFace = new THREE.MeshStandardMaterial({
      map: dialFaceMap,
      metalness: 0.75,
      roughness: 0.35
    });

    // Aperture ring band: f-stops with index ticks, wrapped once around.
    const apertureMap = makeCanvasTexture(
      1024,
      96,
      (ctx, w, h) => {
        ctx.fillStyle = "#1b1916";
        ctx.fillRect(0, 0, w, h);
        const stops = ["2", "2.8", "4", "5.6", "8", "11", "16"];
        ctx.textAlign = "center";
        ctx.font = "bold 38px Helvetica, Arial, sans-serif";
        stops.forEach((s, i) => {
          const x = ((i + 0.5) / stops.length) * w;
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillText(s, x, h * 0.62 + 3);
          ctx.fillStyle = "#e8e1d2";
          ctx.fillText(s, x, h * 0.62);
          ctx.fillRect(x - 2, 6, 4, 16);
          // Intermediate half-stop dot.
          ctx.beginPath();
          ctx.arc(x + w / stops.length / 2, h * 0.25, 4, 0, Math.PI * 2);
          ctx.fill();
        });
      },
      { anisotropy: 8 }
    );

    const apertureBand = new THREE.MeshStandardMaterial({
      map: apertureMap,
      metalness: 0.6,
      roughness: 0.42
    });

    // Distance scale band: meters in cream, feet in coral, center index.
    const distanceMap = makeCanvasTexture(
      1024,
      96,
      (ctx, w, h) => {
        ctx.fillStyle = "#16140f";
        ctx.fillRect(0, 0, w, h);
        const meters = ["0.9", "1", "1.2", "1.5", "2", "3", "5", "10", "∞"];
        const feet = ["3", "3.5", "4", "5", "7", "10", "15", "30", "ft"];
        ctx.textAlign = "center";
        ctx.font = "bold 30px Helvetica, Arial, sans-serif";
        meters.forEach((s, i) => {
          const x = ((i + 0.5) / meters.length) * w;
          ctx.fillStyle = "#e8e1d2";
          ctx.fillText(s, x, h * 0.38);
          ctx.fillStyle = PALETTE.accentCoral;
          ctx.fillText(feet[i], x, h * 0.82);
        });
        // Focus index triangle on the leading edge.
        ctx.fillStyle = "#e8e1d2";
        ctx.beginPath();
        ctx.moveTo(w / 2 - 8, 2);
        ctx.lineTo(w / 2 + 8, 2);
        ctx.lineTo(w / 2, 16);
        ctx.closePath();
        ctx.fill();
      },
      { anisotropy: 8 }
    );

    const distanceBand = new THREE.MeshStandardMaterial({
      map: distanceMap,
      metalness: 0.6,
      roughness: 0.42
    });

    // Engraved name ring around the front element. RingGeometry UVs are
    // planar with the rim at uv-radius 0.5, so text walks a 221px circle.
    const nameRingMap = makeCanvasTexture(
      512,
      512,
      (ctx, w, h) => {
        ctx.fillStyle = "#131110";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#2c2823";
        ctx.lineWidth = 2;
        for (const r of [196, 246]) {
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 27px Helvetica, Arial, sans-serif";
        ctx.fillStyle = "#ded8ca";
        ringText(ctx, "JL OPTIK · LATZAR 40mm 1:2 · No.081599 · ", w / 2, h / 2, 221);
      },
      { anisotropy: 8 }
    );

    const nameRing = new THREE.MeshStandardMaterial({
      map: nameRingMap,
      metalness: 0.7,
      roughness: 0.32
    });

    // Lens coating, painted in POLAR space (the dome lathe's UVs run
    // u=angle, v=rim->center; flipY puts canvas-top at the center). Deep
    // near-black base, magenta/green coating bands at the rim, faint
    // radial iris-blade seams near the center, one soft arc reflection.
    const coatMap = makeCanvasTexture(
      256,
      256,
      (ctx, w, h) => {
        const depth = ctx.createLinearGradient(0, 0, 0, h);
        depth.addColorStop(0, "#06070c");
        depth.addColorStop(0.75, "#090b13");
        depth.addColorStop(1, "#131630");
        ctx.fillStyle = depth;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#3a1d4d";
        ctx.fillRect(0, h * 0.86, w, h * 0.07);
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = "#143524";
        ctx.fillRect(0, h * 0.8, w, h * 0.045);
        // Iris blade seams, visible deep in the barrel.
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = "#010108";
        ctx.lineWidth = 2;
        for (let i = 0; i < 9; i++) {
          const x = ((i + 0.5) / 9) * w;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h * 0.34);
          ctx.stroke();
        }
        // Soft window reflection — a blob in polar space smears into an arc.
        ctx.globalAlpha = 1;
        const glint = ctx.createRadialGradient(w * 0.3, h * 0.52, 2, w * 0.3, h * 0.52, 42);
        glint.addColorStop(0, "rgba(190,205,235,0.12)");
        glint.addColorStop(1, "rgba(190,205,235,0)");
        ctx.fillStyle = glint;
        ctx.fillRect(0, 0, w, h);
        const dot = ctx.createRadialGradient(w * 0.34, h * 0.45, 1, w * 0.34, h * 0.45, 10);
        dot.addColorStop(0, "rgba(225,232,245,0.2)");
        dot.addColorStop(1, "rgba(225,232,245,0)");
        ctx.fillStyle = dot;
        ctx.fillRect(0, 0, w, h);
      },
      { anisotropy: 8 }
    );

    const glass = new THREE.MeshPhysicalMaterial({
      map: coatMap,
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04
    });
    glass.envMapIntensity = 1.5;

    const windowGlass = new THREE.MeshPhysicalMaterial({
      color: "#0a0c12",
      roughness: 0.07,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05
    });
    windowGlass.envMapIntensity = 1.2;

    // Frameline illumination window: frosted, milky, lit by the room.
    const frosted = new THREE.MeshStandardMaterial({
      color: "#ddd5c4",
      roughness: 0.55,
      metalness: 0
    });

    const recess = new THREE.MeshStandardMaterial({
      color: "#0b0a09",
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide
    });

    return {
      leatherette,
      plate,
      chrome,
      darkChrome,
      blackMetal,
      knurlFocus,
      knurlRewind,
      knurlDial,
      dialFace,
      apertureBand,
      distanceBand,
      nameRing,
      glass,
      windowGlass,
      frosted,
      recess,
      blackPlastic: plasticMaterial("#1b1916", 0.5)
    };
  }, []);

  return (
    <group name="filmCamera">
      <mesh
        name="cameraBottomPlate"
        geometry={geo.bottomPlate}
        castShadow
        receiveShadow
        material={mats.plate}
      />
      <mesh
        name="cameraBody"
        geometry={geo.body}
        castShadow
        receiveShadow
        material={mats.leatherette}
      />
      <mesh
        name="cameraTopPlate"
        geometry={geo.topPlate}
        castShadow
        receiveShadow
        material={mats.plate}
      />
      <mesh
        name="cameraChromeDetails"
        geometry={geo.chromeDetails}
        castShadow
        material={mats.chrome}
      />

      {/* Viewfinder + rangefinder windows (front), frameline window between. */}
      <mesh name="cameraViewfinderGlass" geometry={geo.vfGlass} material={mats.windowGlass} />
      <RoundedBox
        name="cameraFramelineWindow"
        args={[0.009, 0.0064, 0.0014]}
        radius={0.0005}
        smoothness={2}
        position={[-0.0115, 0.0625, -0.0024]}
        material={mats.frosted}
      />
      {/* Eyepiece glass, recessed in its merged chrome bezel on the back. */}
      <mesh
        name="cameraEyepieceGlass"
        position={[-0.039, 0.0625, BACK_Z - 0.0004]}
        rotation={[0, Math.PI, 0]}
        material={mats.windowGlass}
      >
        <circleGeometry args={[0.0036, 32]} />
      </mesh>

      {/* Rewind knob: knurled chrome drum; cap + folded crank live in the
          merged chrome geometry above. */}
      <mesh
        name="cameraRewindKnob"
        position={[-0.0485, 0.072, ZC]}
        castShadow
        material={mats.knurlRewind}
      >
        <cylinderGeometry args={[0.0082, 0.0082, 0.007, 48]} />
      </mesh>

      {/* Shutter speed dial: knurled drum + engraved face. */}
      <mesh
        name="cameraShutterDial"
        position={[0.0185, 0.0712, ZC]}
        castShadow
        material={mats.knurlDial}
      >
        <cylinderGeometry args={[0.0078, 0.0078, 0.0054, 48]} />
      </mesh>
      <mesh
        name="cameraShutterDialFace"
        position={[0.0185, 0.074, ZC]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={mats.dialFace}
      >
        <circleGeometry args={[0.0074, 48]} />
      </mesh>

      {/* Shutter button inside its collar, cable-release socket on top. */}
      <mesh
        name="cameraShutterButton"
        position={[0.035, 0.0711, -0.0115]}
        castShadow
        material={mats.chrome}
      >
        <cylinderGeometry args={[0.0026, 0.0026, 0.0052, 24]} />
      </mesh>
      <mesh
        position={[0.035, 0.07375, -0.0115]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={mats.blackPlastic}
      >
        <circleGeometry args={[0.0012, 16]} />
      </mesh>

      {/* Hot shoe contact dot (shoe itself is merged chrome). */}
      <mesh position={[0, 0.0701, ZC]} material={mats.blackPlastic}>
        <cylinderGeometry args={[0.0016, 0.0016, 0.0008, 16]} />
      </mesh>

      {/* Frame counter glass inside its merged bezel. */}
      <mesh
        name="cameraCounterGlass"
        position={[0.033, 0.0688, -0.03]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={mats.windowGlass}
      >
        <circleGeometry args={[0.0026, 24]} />
      </mesh>

      {/* Film advance lever, swung out to its ready stance. */}
      <group name="cameraAdvanceLever" position={[0.0485, TOP_Y, ZC]} rotation={[0, LEVER_SWING, 0]}>
        <mesh position={[0, 0.0015, 0]} castShadow material={mats.chrome}>
          <cylinderGeometry args={[0.0056, 0.0056, 0.003, 32]} />
        </mesh>
        <mesh
          position={[0, 0.00305, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={mats.darkChrome}
        >
          <circleGeometry args={[0.0018, 16]} />
        </mesh>
        <RoundedBox
          args={[0.026, 0.0022, 0.0056]}
          radius={0.0008}
          smoothness={2}
          position={[-0.0125, 0.003, 0]}
          castShadow
          material={mats.chrome}
        />
        <RoundedBox
          args={[0.0128, 0.003, 0.007]}
          radius={0.0012}
          smoothness={2}
          position={[-0.0262, 0.0033, 0.0008]}
          rotation={[0, 0.22, 0]}
          castShadow
          material={mats.blackPlastic}
        />
      </group>

      {/* Lens: flange, aperture ring, chrome DOF ring, knurled focus ring,
          distance barrel, trim ring, name ring, recess wall, glass dome. */}
      <group name="cameraLens" position={[LENS_X, LENS_Y, LENS_Z]}>
        <mesh
          name="cameraLensFlange"
          position={[0, 0, 0.0018]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          material={mats.plate}
        >
          <cylinderGeometry args={[0.0226, 0.0236, 0.0036, 48]} />
        </mesh>
        <mesh
          name="cameraApertureRing"
          position={[0, 0, 0.0071]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          material={mats.apertureBand}
        >
          <cylinderGeometry args={[0.0212, 0.0212, 0.007, 48]} />
        </mesh>
        <mesh
          name="cameraDofRing"
          position={[0, 0, 0.0121]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          material={mats.chrome}
        >
          <cylinderGeometry args={[0.0202, 0.0202, 0.003, 48]} />
        </mesh>
        <mesh
          name="cameraFocusRing"
          position={[0, 0, 0.0198]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          material={mats.knurlFocus}
        >
          <cylinderGeometry args={[0.0222, 0.0222, 0.0124, 64]} />
        </mesh>
        <mesh
          name="cameraLensBarrel"
          position={[0, 0, 0.0303]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          material={mats.distanceBand}
        >
          <cylinderGeometry args={[0.0188, 0.0188, 0.0086, 48]} />
        </mesh>
        <mesh
          name="cameraTrimRing"
          geometry={geo.trimRing}
          position={[0, 0, 0.0374]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          material={mats.blackMetal}
        />
        <mesh name="cameraNameRing" position={[0, 0, 0.0403]} material={mats.nameRing}>
          <ringGeometry args={[0.0126, 0.0172, 64]} />
        </mesh>
        <mesh
          name="cameraLensRecess"
          geometry={geo.lensRecess}
          position={[0, 0, 0.0375]}
          rotation={[Math.PI / 2, 0, 0]}
          material={mats.recess}
        />
        <mesh
          name="cameraGlass"
          geometry={geo.glassDome}
          position={[0, 0, 0.0357]}
          rotation={[Math.PI / 2, 0, 0]}
          material={mats.glass}
        />
      </group>
    </group>
  );
}
