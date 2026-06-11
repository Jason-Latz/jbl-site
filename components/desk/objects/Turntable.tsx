"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadProxiedTexture } from "@/lib/three/proxied-texture";
import { markShadowsDirty } from "@/lib/three/shadow-dirty";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import {
  PALETTE,
  makeCanvasTexture,
  chromeMaterial,
  brushedMetalMaterial,
  plasticMaterial,
  feltMaterial,
  lacquerMaterial,
  lacqueredWoodMaterial
} from "@/lib/three/materials";
import { useDeskTheme } from "../DeskThemeContext";

type TurntableProps = {
  playing: boolean;
  armDown: boolean;
  onNeedleClick?: () => void;
  // Album art of the live track, pressed onto the record label when it loads.
  labelArtUrl?: string | null;
};

const RPM_33 = 3.49;
const PLINTH_TOP = 0.056;
const SPINDLE_X = -0.045;
const SPINDLE_Z = 0;
const ARM_PIVOT_X = 0.155;
const ARM_PIVOT_Z = -0.105;
const BEARING_Y = 0.048;

// Yaw values solved so the stylus (effective length ~0.234 m from the
// bearing) lands at groove radius ~0.145 m when down, and clears the
// vinyl (r=0.15) when parked over the rest clip.
const YAW_PLAY = -0.42;
const YAW_PARK = -0.1;
const PITCH_DOWN = 0.012;
const PITCH_UP = -0.028;

const FOOT_POSITIONS: [number, number, number][] = [
  [-0.165, 0, -0.125],
  [0.165, 0, -0.125],
  [-0.165, 0, 0.125],
  [0.165, 0, 0.125]
];

function lathe(points: [number, number][], segments: number): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  );
}

function smoothLathe(
  points: [number, number][],
  samples: number,
  segments: number
): THREE.LatheGeometry {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([r, y]) => new THREE.Vector3(r, y, 0)),
    false,
    "catmullrom",
    0.5
  );
  const profile = curve
    .getPoints(samples)
    .map((p) => new THREE.Vector2(Math.max(p.x, 0.0001), p.y));
  return new THREE.LatheGeometry(profile, segments);
}

export default function Turntable({
  playing,
  armDown,
  onNeedleClick,
  labelArtUrl
}: TurntableProps) {
  const { mixRef } = useDeskTheme();
  const [labelArt, setLabelArt] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    setLabelArt(null);
    if (!labelArtUrl) {
      return;
    }
    return loadProxiedTexture(labelArtUrl, setLabelArt);
  }, [labelArtUrl]);

  const spinRef = useRef<THREE.Group>(null);
  const yawRef = useRef<THREE.Group>(null);
  const pitchRef = useRef<THREE.Group>(null);
  const btn33Ref = useRef<THREE.Group>(null);
  const velocityRef = useRef(0);

  const geo = useMemo(() => {
    // Platter: recessed mat well, flat machined annulus, rolled rim lip.
    const platter = lathe(
      [
        [0.02, 0],
        [0.146, 0],
        [0.152, 0.0006],
        [0.1549, 0.0018],
        [0.1555, 0.0035],
        [0.1555, 0.0198],
        [0.1551, 0.0222],
        [0.154, 0.0234],
        [0.1522, 0.0239],
        [0.1502, 0.0239],
        [0.149, 0.0236],
        [0.1478, 0.0229],
        [0.147, 0.0225],
        [0.018, 0.0225],
        [0.013, 0.0222],
        [0.0125, 0.012]
      ],
      192
    );

    const spindle = lathe(
      [
        [0.0034, 0],
        [0.0034, 0.0145],
        [0.003, 0.0158],
        [0.0017, 0.0168],
        [0.0001, 0.0172]
      ],
      64
    );

    // Vinyl rim: rounded edge bevel revolved separately from the flat faces.
    const vinylRim = lathe(
      [
        [0.1455, 0],
        [0.1482, 0.0001],
        [0.1495, 0.0005],
        [0.15, 0.0011],
        [0.1495, 0.0017],
        [0.1482, 0.00205],
        [0.1455, 0.0022]
      ],
      256
    );

    // Tonearm tube: gentle S-curve passing back through center at the rest.
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.0008, 0.006),
      new THREE.Vector3(0.003, 0.0006, 0.05),
      new THREE.Vector3(0.0052, 0.0002, 0.095),
      new THREE.Vector3(0.002, -0.0006, 0.14),
      new THREE.Vector3(-0.0018, -0.0018, 0.185),
      new THREE.Vector3(-0.0008, -0.0028, 0.207),
      new THREE.Vector3(0, -0.0032, 0.215)
    ]);
    const armTube = new THREE.TubeGeometry(armCurve, 96, 0.0042, 20);

    const counterweight = smoothLathe(
      [
        [0.003, 0],
        [0.009, 0.0004],
        [0.0122, 0.0018],
        [0.0127, 0.006],
        [0.0118, 0.0085],
        [0.0127, 0.011],
        [0.0127, 0.016],
        [0.0112, 0.0185],
        [0.004, 0.0195],
        [0.003, 0.0195]
      ],
      48,
      96
    );

    const foot = smoothLathe(
      [
        [0.006, 0],
        [0.0165, 0.0005],
        [0.0182, 0.003],
        [0.0172, 0.007],
        [0.0148, 0.0105],
        [0.0105, 0.012],
        [0.005, 0.0122]
      ],
      32,
      64
    );

    const pillar = lathe(
      [
        [0.0148, 0],
        [0.0148, 0.0035],
        [0.0132, 0.0055],
        [0.009, 0.0085],
        [0.0086, 0.012],
        [0.0086, 0.0395],
        [0.0096, 0.0425],
        [0.0104, 0.0455],
        [0.0104, 0.0515],
        [0.0088, 0.0535],
        [0.004, 0.0545]
      ],
      96
    );

    const antiSkate = smoothLathe(
      [
        [0.0012, 0],
        [0.0042, 0.0002],
        [0.0048, 0.0014],
        [0.0048, 0.005],
        [0.0038, 0.0062],
        [0.0014, 0.007],
        [0.0002, 0.007]
      ],
      20,
      48
    );

    // Speed button: chamfered cap profile.
    const btnCap = lathe(
      [
        [0.003, 0],
        [0.0055, 0],
        [0.0055, 0.0042],
        [0.0046, 0.0056],
        [0.0032, 0.0062],
        [0.0005, 0.0063]
      ],
      48
    );

    return { platter, spindle, vinylRim, armTube, counterweight, foot, pillar, antiSkate, btnCap };
  }, []);

  const mats = useMemo(() => {
    // Groove field: ~140 fine rings, 4 glossier track gaps, smooth runout
    // and lead-in. Doubles as a radial bump so PCSS light rakes the rings.
    const grooveMap = makeCanvasTexture(
      2048,
      2048,
      (ctx, w, h) => {
        ctx.fillStyle = "#7d7d7d";
        ctx.fillRect(0, 0, w, h);
        const cx = w / 2;
        const cy = h / 2;
        // Grooved program annulus reads rougher than raw vinyl.
        ctx.strokeStyle = "#a9a9a9";
        ctx.lineWidth = 1006 - 452;
        ctx.beginPath();
        ctx.arc(cx, cy, (1006 + 452) / 2, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 140; i++) {
          const r = 458 + (1000 - 458) * (i / 139) + (Math.random() - 0.5) * 1.6;
          const g = 70 + Math.floor(Math.random() * 130);
          ctx.strokeStyle = `rgb(${g},${g},${g})`;
          ctx.globalAlpha = 0.45 + Math.random() * 0.5;
          ctx.lineWidth = 1 + Math.random() * 1.6;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        for (const t of [0.2, 0.44, 0.66, 0.87]) {
          ctx.strokeStyle = "#7a7a7a";
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.arc(cx, cy, 458 + (1000 - 458) * t, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Runout spiral hint + lead-in edge.
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#949494";
        for (const r of [380, 398]) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#8a8a8a";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx, cy, 1012, 0, Math.PI * 2);
        ctx.stroke();
      },
      { srgb: false, anisotropy: 8 }
    );

    // Radial anisotropy field for the vinyl. A record's surface is thousands
    // of concentric grooves, so its specular highlight stretches PERPENDICULAR
    // to them — a radial blade that sweeps the disc as it spins. three r169
    // decodes anisotropyMap.rg as a tangent-space direction ([0,1] -> [-1,1],
    // T_final = x*T + y*B with T along +U, B along +V) and .b as strength.
    // The ring geometry's UVs are planar with the spindle at (0.5, 0.5), and
    // canvas flipY negates y — so each texel stores its own raw radial
    // direction (dx, -dy). Strength follows the pressing: dead under the
    // label, soft in the dead wax, full across the program grooves with a
    // concentric wobble, eased in the four track gaps, tapered at the rim.
    const gapRhos = [0.2, 0.44, 0.66, 0.87].map((t) => (458 + 542 * t) / 1024);
    const grooveStrength = (rho: number): number => {
      if (rho < 0.3) return 0;
      let s: number;
      if (rho < 0.447) {
        s = THREE.MathUtils.mapLinear(rho, 0.3, 0.447, 0.3, 0.95);
      } else if (rho < 0.977) {
        s = 0.9 + 0.08 * Math.sin(rho * 411.7) * Math.sin(rho * 87.3);
        for (const gap of gapRhos) {
          const d = Math.abs(rho - gap);
          if (d < 0.012) {
            s = THREE.MathUtils.lerp(0.62, s, d / 0.012);
          }
        }
      } else {
        s = THREE.MathUtils.mapLinear(rho, 0.977, 1.0, 0.9, 0.4);
      }
      return THREE.MathUtils.clamp(s, 0, 1);
    };
    const vinylAnisoMap = makeCanvasTexture(
      512,
      512,
      (ctx, w, h) => {
        const image = ctx.createImageData(w, h);
        const data = image.data;
        const half = w / 2;
        for (let py = 0; py < h; py++) {
          for (let px = 0; px < w; px++) {
            const dx = px + 0.5 - half;
            const dy = py + 0.5 - half;
            const len = Math.hypot(dx, dy);
            // Default direction at the spindle singularity (strength 0 there)
            // keeps the shader's normalize() away from a zero vector.
            const x = len > 0.5 ? dx / len : 1;
            const y = len > 0.5 ? -dy / len : 0;
            const idx = (py * w + px) * 4;
            data[idx] = Math.round(127.5 + 127.5 * x);
            data[idx + 1] = Math.round(127.5 + 127.5 * y);
            data[idx + 2] = Math.round(255 * grooveStrength(len / half));
            data[idx + 3] = 255;
          }
        }
        ctx.putImageData(image, 0, 0);
      },
      { srgb: false, anisotropy: 8 }
    );

    const labelMap = makeCanvasTexture(
      1024,
      1024,
      (ctx, w, h) => {
        ctx.fillStyle = PALETTE.accentCoral;
        ctx.fillRect(0, 0, w, h);
        const c = w / 2;
        // Fine concentric press marks.
        for (let r = 70; r < 492; r += 9) {
          ctx.strokeStyle = r % 18 < 9 ? "#000000" : "#ffffff";
          ctx.globalAlpha = r % 18 < 9 ? 0.04 : 0.03;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(c, c, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#8f3a1c";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(c, c, 497, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c, c, 340, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = PALETTE.inkDark;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "italic 118px Georgia, 'Times New Roman', serif";
        ctx.fillText("blonded", c, 368);
        ctx.globalAlpha = 0.55;
        ctx.fillRect(c - 96, 580, 192, 2);
        ctx.globalAlpha = 0.92;
        ctx.font = "30px Georgia, serif";
        ctx.fillText("33 1/3 RPM — STEREO", c, 632);
        ctx.globalAlpha = 0.7;
        ctx.font = "26px Georgia, serif";
        ctx.fillText("JL-001 · SIDE A", c, 678);
        ctx.globalAlpha = 1;
        // Spindle hole with pressed paper rim shadow.
        const shadow = ctx.createRadialGradient(c, c, 28, c, c, 62);
        shadow.addColorStop(0, "rgba(20,8,2,0.45)");
        shadow.addColorStop(1, "rgba(20,8,2,0)");
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.arc(c, c, 62, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#171210";
        ctx.beginPath();
        ctx.arc(c, c, 33, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#f0e0cc";
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c, c, 35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      },
      { anisotropy: 8 }
    );

    // Strobe dot rows around the platter rim, three pitches like a 50/60 Hz rim.
    const strobeMap = makeCanvasTexture(
      512,
      64,
      (ctx, w, h) => {
        ctx.fillStyle = "#0f0f0f";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#d8d3c8";
        for (const row of [
          { y: 12, pitch: 18 },
          { y: 32, pitch: 22 },
          { y: 52, pitch: 27 }
        ]) {
          for (let x = row.pitch / 2; x < w; x += row.pitch) {
            ctx.beginPath();
            ctx.arc(x, row.y, 3.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      },
      { repeat: [6, 1], anisotropy: 8 }
    );

    const knurlMap = makeCanvasTexture(
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
      { srgb: false, repeat: [18, 1], anisotropy: 8 }
    );

    const matBump = makeCanvasTexture(
      512,
      512,
      (ctx, w, h) => {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, w, h);
        for (let r = 28; r < 252; r += 6) {
          ctx.strokeStyle = (r / 6) % 2 < 1 ? "#747474" : "#8c8c8c";
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.18;
        for (let i = 0; i < 900; i++) {
          const g = 90 + Math.floor(Math.random() * 80);
          ctx.fillStyle = `rgb(${g},${g},${g})`;
          ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
        }
        ctx.globalAlpha = 1;
      },
      { srgb: false, anisotropy: 8 }
    );

    const engravedCap = (text: string) =>
      makeCanvasTexture(
        128,
        128,
        (ctx, w, h) => {
          ctx.fillStyle = "#8e8b84";
          ctx.fillRect(0, 0, w, h);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "bold 52px Helvetica, Arial, sans-serif";
          ctx.fillStyle = "#b9b5ac";
          ctx.fillText(text, w / 2, h / 2 + 4);
          ctx.fillStyle = "#34302a";
          ctx.fillText(text, w / 2, h / 2 + 1);
        },
        { anisotropy: 8 }
      );

    const walnut = lacqueredWoodMaterial({
      base: "#54381f",
      streak: "#3a2715",
      roughness: 0.36,
      clearcoat: 0.55,
      clearcoatRoughness: 0.24,
      bumpScale: 0.0008
    });

    // Piano-black top plate; lamp pool streaks across the clearcoat.
    const plate = lacquerMaterial("#16140f", {
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      roughness: 0.3
    });
    plate.envMapIntensity = 1.3;

    // Machined platter: lathe-turned, so tool marks run circumferentially.
    // Lathe UVs put U around the rim and V along the profile; rotating the
    // uniform anisotropy by 90deg stretches the highlight along V — radially
    // across the flat annulus, vertically down the rim. Classic turned metal.
    const platter = new THREE.MeshPhysicalMaterial({
      color: "#b6b3ab",
      metalness: 0.9,
      roughness: 0.32,
      anisotropy: 0.5,
      anisotropyRotation: Math.PI / 2
    });
    platter.envMapIntensity = 1.1;

    // Pressed vinyl: near-black with a faint warm cast, a thin glassy
    // clearcoat skin, and the radial anisotropy field above. The groove
    // canvas stays wired as roughness + bump so the blade picks up the
    // ring-to-ring sparkle and the four glossier track gaps.
    const vinyl = lacquerMaterial("#100d0a", {
      clearcoat: 0.55,
      clearcoatRoughness: 0.24,
      roughness: 0.38
    });
    vinyl.roughnessMap = grooveMap;
    vinyl.bumpMap = grooveMap;
    vinyl.bumpScale = 0.0004;
    vinyl.anisotropy = 0.85;
    vinyl.anisotropyMap = vinylAnisoMap;
    vinyl.envMapIntensity = 1.05;

    const vinylEdge = lacquerMaterial("#100d0a", {
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      roughness: 0.34
    });
    vinylEdge.envMapIntensity = 1.2;
    // The rolled rim is a lathe too — same circumferential pressing marks,
    // same 90deg uniform anisotropy as the platter.
    vinylEdge.anisotropy = 0.5;
    vinylEdge.anisotropyRotation = Math.PI / 2;

    // Printed paper label: matte fiber with the faintest semi-gloss from the
    // press — a whisper of clearcoat, deliberately NO anisotropy.
    const label = new THREE.MeshPhysicalMaterial({
      map: labelMap,
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0.06,
      clearcoatRoughness: 0.5
    });

    const mat = feltMaterial("#141312");
    mat.bumpMap = matBump;
    mat.bumpScale = 0.0005;

    const strobe = new THREE.MeshStandardMaterial({
      map: strobeMap,
      metalness: 0.55,
      roughness: 0.42
    });

    const chrome = chromeMaterial();
    chrome.envMapIntensity = 1.15;

    const counterweight = brushedMetalMaterial("#4f4c46");
    counterweight.bumpMap = knurlMap;
    counterweight.bumpScale = 0.0004;

    const knurlKnob = brushedMetalMaterial("#6c6962");
    knurlKnob.bumpMap = knurlMap;
    knurlKnob.bumpScale = 0.0003;

    const led = plasticMaterial("#2a0a04", 0.5);
    led.emissive = new THREE.Color("#ff6a2e");
    led.emissiveIntensity = 1.8;

    const btnLabel = (map: THREE.CanvasTexture) => {
      const m = new THREE.MeshStandardMaterial({
        map,
        metalness: 0.8,
        roughness: 0.42
      });
      return m;
    };

    return {
      walnut,
      plate,
      foot: plasticMaterial("#141210", 0.82),
      platter,
      strobe,
      grooveLine: new THREE.MeshStandardMaterial({
        color: "#3c3a36",
        metalness: 0.8,
        roughness: 0.5
      }),
      mat,
      chrome,
      vinyl,
      vinylEdge,
      label,
      led,
      armMetal: brushedMetalMaterial("#a8a49b"),
      armDark: plasticMaterial("#1d1c1a", 0.45),
      counterweight,
      knurlKnob,
      dial: plasticMaterial("#26241f", 0.5),
      button: brushedMetalMaterial("#8e8b84"),
      btn33: btnLabel(engravedCap("33")),
      btn45: btnLabel(engravedCap("45")),
      panel: plasticMaterial("#1a1816", 0.6),
      hinge: plasticMaterial("#161513", 0.55),
      rcaRed: lacquerMaterial("#a32c22", { clearcoat: 0.8, roughness: 0.35 }),
      rcaWhite: lacquerMaterial("#e7e0d2", { clearcoat: 0.8, roughness: 0.35 })
    };
  }, []);

  const seed = useMemo(
    () => ({
      vinylSpin: Math.random() * Math.PI * 2,
      matSpin: Math.random() * Math.PI * 2,
      labelSpin: Math.random() * Math.PI * 2,
      tiltX: (Math.random() - 0.5) * 0.004,
      tiltZ: (Math.random() - 0.5) * 0.004,
      headYaw: (Math.random() - 0.5) * 0.02
    }),
    []
  );

  useFrame((_, delta) => {
    velocityRef.current = THREE.MathUtils.damp(
      velocityRef.current,
      playing ? RPM_33 : 0,
      1.1,
      delta
    );
    if (spinRef.current) {
      spinRef.current.rotation.y -= velocityRef.current * delta;
    }

    if (yawRef.current && pitchRef.current) {
      const yawTarget = armDown ? YAW_PLAY : YAW_PARK;
      if (Math.abs(yawRef.current.rotation.y - yawTarget) > 0.004) {
        // The tonearm in motion casts a moving shadow — wake the frozen maps.
        markShadowsDirty();
      }
      yawRef.current.rotation.y = THREE.MathUtils.damp(
        yawRef.current.rotation.y,
        yawTarget,
        2.3,
        delta
      );
      // Needle only drops once the swing has mostly settled; lifting is
      // faster than the swing so the move reads lift -> swing -> settle.
      const settled = Math.abs(yawRef.current.rotation.y - yawTarget) < 0.05;
      const pitchTarget = armDown && settled ? PITCH_DOWN : PITCH_UP;
      pitchRef.current.rotation.x = THREE.MathUtils.damp(
        pitchRef.current.rotation.x,
        pitchTarget,
        armDown ? 3.2 : 5.5,
        delta
      );
    }

    if (btn33Ref.current) {
      btn33Ref.current.position.y = THREE.MathUtils.damp(
        btn33Ref.current.position.y,
        playing ? 0.0553 : 0.0565,
        9,
        delta
      );
    }

    mats.led.emissiveIntensity = THREE.MathUtils.lerp(1.8, 0.5, mixRef.current);
  });

  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onNeedleClick?.();
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      {FOOT_POSITIONS.map((position, index) => (
        <mesh
          key={index}
          position={position}
          geometry={geo.foot}
          castShadow
          material={mats.foot}
        />
      ))}

      {/* Plinth: lacquered walnut body under a piano-black top plate. */}
      <RoundedBox
        args={[0.42, 0.03, 0.34]}
        radius={0.005}
        smoothness={4}
        position={[0, 0.027, 0]}
        castShadow
        receiveShadow
        material={mats.walnut}
      />
      <RoundedBox
        args={[0.426, 0.014, 0.346]}
        radius={0.003}
        smoothness={4}
        position={[0, 0.049, 0]}
        castShadow
        receiveShadow
        material={mats.plate}
      />

      {/* Rear connection panel: RCA pair + ground screw, low on the back. */}
      <group position={[0.134, 0.028, 0]}>
        <RoundedBox
          args={[0.062, 0.022, 0.0035]}
          radius={0.0012}
          smoothness={2}
          position={[0, 0, -0.1712]}
          castShadow
          material={mats.panel}
        />
        {(
          [
            [-0.008, mats.rcaRed],
            [0.008, mats.rcaWhite]
          ] as const
        ).map(([x, material], i) => (
          <group key={i} position={[x, 0, 0]}>
            <mesh
              position={[0, 0, -0.1765]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
              material={material}
            >
              <cylinderGeometry args={[0.0042, 0.0042, 0.0075, 24]} />
            </mesh>
            <mesh
              position={[0, 0, -0.179]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
              material={mats.chrome}
            >
              <cylinderGeometry args={[0.0013, 0.0013, 0.013, 12]} />
            </mesh>
          </group>
        ))}
        <mesh
          position={[0.021, 0, -0.175]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          material={mats.knurlKnob}
        >
          <cylinderGeometry args={[0.0026, 0.0026, 0.0045, 24]} />
        </mesh>
        <mesh
          position={[0.021, 0, -0.178]}
          rotation={[Math.PI / 2, 0, 0]}
          material={mats.chrome}
        >
          <cylinderGeometry args={[0.001, 0.001, 0.006, 10]} />
        </mesh>
      </group>

      {/* Dust cover hinge brackets. */}
      {[-0.115, 0.115].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <RoundedBox
            args={[0.014, 0.003, 0.011]}
            radius={0.001}
            smoothness={2}
            position={[0, 0.0575, -0.158]}
            castShadow
            material={mats.hinge}
          />
          <RoundedBox
            args={[0.014, 0.02, 0.0035]}
            radius={0.001}
            smoothness={2}
            position={[0, 0.0685, -0.1625]}
            castShadow
            material={mats.hinge}
          />
          <mesh
            position={[0, 0.076, -0.1625]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
            material={mats.chrome}
          >
            <cylinderGeometry args={[0.0014, 0.0014, 0.018, 12]} />
          </mesh>
        </group>
      ))}

      <group ref={spinRef} position={[SPINDLE_X, PLINTH_TOP, SPINDLE_Z]}>
        <mesh geometry={geo.platter} castShadow receiveShadow material={mats.platter} />
        {/* Strobe dot band around the rim. */}
        <mesh position={[0, 0.0115, 0]} material={mats.strobe}>
          <cylinderGeometry args={[0.1558, 0.1558, 0.012, 192, 1, true]} />
        </mesh>
        {/* Hairline machining groove on the rim lip. */}
        <mesh
          position={[0, 0.02395, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={mats.grooveLine}
        >
          <ringGeometry args={[0.1506, 0.1512, 256]} />
        </mesh>

        <mesh
          position={[0, 0.024, 0]}
          rotation={[0, seed.matSpin, 0]}
          receiveShadow
          material={mats.mat}
        >
          <cylinderGeometry args={[0.146, 0.146, 0.003, 128]} />
        </mesh>

        {/* Record sits with a seeded micro-warp so the rim breathes as it spins. */}
        <group position={[0, 0.0255, 0]} rotation={[seed.tiltX, seed.vinylSpin, seed.tiltZ]}>
          <mesh
            position={[0, 0.0022, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            castShadow
            receiveShadow
            material={mats.vinyl}
          >
            <ringGeometry args={[0.004, 0.1465, 384, 1]} />
          </mesh>
          <mesh geometry={geo.vinylRim} castShadow material={mats.vinylEdge} />
          <mesh
            position={[0, 0.00008, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            material={mats.vinylEdge}
          >
            <ringGeometry args={[0.01, 0.1455, 192, 1]} />
          </mesh>
          <mesh
            position={[0, 0.00235, 0]}
            rotation={[-Math.PI / 2, 0, seed.labelSpin]}
            receiveShadow
            material={mats.label}
          >
            <circleGeometry args={[0.05, 96]} />
          </mesh>
          {labelArt ? (
            <mesh position={[0, 0.00245, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.0455, 96]} />
              {/* Same pressed-paper read as the label under it: matte, a
                  whisper of clearcoat, no anisotropy. */}
              <meshPhysicalMaterial
                map={labelArt}
                roughness={0.6}
                metalness={0}
                clearcoat={0.06}
                clearcoatRoughness={0.5}
              />
            </mesh>
          ) : null}
        </group>

        <mesh geometry={geo.spindle} position={[0, 0.022, 0]} castShadow material={mats.chrome} />
      </group>

      <group position={[ARM_PIVOT_X, PLINTH_TOP, ARM_PIVOT_Z]}>
        {/* Pivot pillar + fixed gimbal yoke ring with side pivot screws. */}
        <mesh geometry={geo.pillar} castShadow material={mats.armDark} />
        <mesh position={[0, BEARING_Y, 0]} castShadow material={mats.armMetal}>
          <torusGeometry args={[0.0125, 0.0017, 16, 96]} />
        </mesh>
        {[-0.0125, 0.0125].map((x) => (
          <mesh
            key={x}
            position={[x, BEARING_Y, 0]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
            material={mats.chrome}
          >
            <cylinderGeometry args={[0.0023, 0.0023, 0.0035, 16]} />
          </mesh>
        ))}

        {/* Anti-skate dial, knurled. */}
        <mesh
          geometry={geo.antiSkate}
          position={[0.027, 0, -0.009]}
          castShadow
          material={mats.knurlKnob}
        />

        {/* Cueing lever. */}
        <group position={[0.025, 0, 0.013]}>
          <RoundedBox
            args={[0.013, 0.0045, 0.0095]}
            radius={0.0012}
            smoothness={2}
            position={[0, 0.0022, 0]}
            castShadow
            material={mats.armDark}
          />
          <mesh position={[0, 0.0085, 0]} castShadow material={mats.armMetal}>
            <cylinderGeometry args={[0.0015, 0.0015, 0.009, 12]} />
          </mesh>
          <RoundedBox
            args={[0.011, 0.0018, 0.0032]}
            radius={0.0006}
            smoothness={2}
            position={[0.0035, 0.0135, 0]}
            rotation={[0, 0, 0.35]}
            castShadow
            material={mats.armDark}
          />
        </group>

        {/* Arm rest clip, aligned with the parked tube direction. */}
        <group position={[-0.0155, 0, 0.1542]} rotation={[0, YAW_PARK, 0]}>
          <mesh position={[0, 0.024, 0]} castShadow material={mats.armDark}>
            <cylinderGeometry args={[0.0024, 0.003, 0.048, 16]} />
          </mesh>
          <RoundedBox
            args={[0.009, 0.003, 0.006]}
            radius={0.0008}
            smoothness={2}
            position={[0, 0.0475, 0]}
            castShadow
            material={mats.armDark}
          />
          <RoundedBox
            args={[0.0012, 0.009, 0.006]}
            radius={0.0004}
            smoothness={2}
            position={[-0.0037, 0.053, 0]}
            castShadow
            material={mats.armDark}
          />
          <RoundedBox
            args={[0.0012, 0.009, 0.006]}
            radius={0.0004}
            smoothness={2}
            position={[0.0037, 0.053, 0]}
            castShadow
            material={mats.armDark}
          />
        </group>

        <group ref={yawRef} position={[0, BEARING_Y, 0]} rotation={[0, YAW_PARK, 0]}>
          {/* Yawing bearing housing + horizontal gimbal ring. */}
          <mesh castShadow material={mats.armDark}>
            <cylinderGeometry args={[0.0082, 0.0082, 0.0125, 32]} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow material={mats.chrome}>
            <torusGeometry args={[0.0102, 0.002, 14, 64]} />
          </mesh>
          <mesh position={[0, 0.0085, 0]} castShadow material={mats.chrome}>
            <cylinderGeometry args={[0.004, 0.0048, 0.003, 24]} />
          </mesh>

          <group ref={pitchRef} rotation={[PITCH_UP, 0, 0]}>
            <mesh geometry={geo.armTube} castShadow material={mats.armMetal} />

            {/* Counterweight stub, tracking-force dial, knurled weight. */}
            <mesh
              position={[0, 0, -0.024]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
              material={mats.armMetal}
            >
              <cylinderGeometry args={[0.0028, 0.0028, 0.044, 16]} />
            </mesh>
            <mesh
              position={[0, 0, -0.019]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
              material={mats.dial}
            >
              <cylinderGeometry args={[0.0095, 0.0095, 0.0055, 32]} />
            </mesh>
            <mesh
              geometry={geo.counterweight}
              position={[0, 0, -0.0265]}
              rotation={[-Math.PI / 2, 0, 0]}
              castShadow
              material={mats.counterweight}
            />

            {/* Offset headshell angled toward the spindle. */}
            <group position={[0, -0.0035, 0.218]} rotation={[0, -0.35 + seed.headYaw, 0]}>
              <RoundedBox
                args={[0.0132, 0.0058, 0.0285]}
                radius={0.0012}
                smoothness={2}
                position={[0, 0, 0.0075]}
                castShadow
                material={mats.armMetal}
              />
              <RoundedBox
                args={[0.0098, 0.0058, 0.0145]}
                radius={0.0008}
                smoothness={2}
                position={[0, -0.0067, 0.0125]}
                castShadow
                material={mats.armDark}
              />
              {/* Cantilever + stylus. */}
              <mesh
                position={[0, -0.0135, 0.016]}
                rotation={[Math.PI / 2 + 0.45, 0, 0]}
                castShadow
                material={mats.chrome}
              >
                <cylinderGeometry args={[0.0005, 0.0005, 0.0058, 8]} />
              </mesh>
              <mesh
                position={[0, -0.0155, 0.0188]}
                rotation={[Math.PI, 0, 0]}
                castShadow
                material={mats.chrome}
              >
                <coneGeometry args={[0.0011, 0.0035, 12]} />
              </mesh>
              {/* Finger lift. */}
              <mesh
                position={[-0.0078, 0.0035, 0.003]}
                rotation={[0.45, 0, 0.85]}
                castShadow
                material={mats.chrome}
              >
                <cylinderGeometry args={[0.0007, 0.0007, 0.013, 10]} />
              </mesh>
              <mesh position={[-0.0127, 0.0074, 0.0049]} material={mats.chrome}>
                <sphereGeometry args={[0.0011, 12, 10]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>

      {/* Speed buttons + power LED, front-left of the plinth. */}
      <group ref={btn33Ref} position={[-0.172, 0.0565, 0.138]}>
        <mesh geometry={geo.btnCap} position={[0, -0.003, 0]} castShadow material={mats.button} />
        <mesh position={[0, 0.0034, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.btn33}>
          <circleGeometry args={[0.0031, 32]} />
        </mesh>
      </group>
      <group position={[-0.15, 0.0565, 0.138]}>
        <mesh geometry={geo.btnCap} position={[0, -0.003, 0]} castShadow material={mats.button} />
        <mesh position={[0, 0.0034, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.btn45}>
          <circleGeometry args={[0.0031, 32]} />
        </mesh>
      </group>
      <mesh position={[-0.188, 0.0566, 0.152]} material={mats.led}>
        <cylinderGeometry args={[0.0019, 0.0019, 0.0045, 16]} />
      </mesh>
      <mesh
        position={[-0.188, 0.0578, 0.152]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={mats.chrome}
      >
        <torusGeometry args={[0.0023, 0.0007, 10, 32]} />
      </mesh>
    </group>
  );
}
