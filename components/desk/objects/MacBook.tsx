"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import {
  PALETTE,
  brushedMetalMaterial,
  makeCanvasTexture,
  plasticMaterial
} from "@/lib/three/materials";
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

const FEET: [number, number, number][] = [
  [-0.136, FOOT_H / 2, -0.092],
  [0.136, FOOT_H / 2, -0.092],
  [-0.136, FOOT_H / 2, 0.092],
  [0.136, FOOT_H / 2, 0.092]
];

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

function drawSunburstSticker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  rotationDeg: number,
  rayCount: number,
  shape: "circle" | "squircle"
): void {
  const r = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotationDeg * Math.PI) / 180);

  const trace = (radius: number) => {
    if (shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
    } else {
      roundedRectPath(ctx, -radius, -radius, radius * 2, radius * 2, radius * 0.42);
    }
  };

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2.5;
  trace(r);
  ctx.fillStyle = "#f0eee5";
  ctx.fill();
  ctx.restore();

  trace(r - 1);
  ctx.strokeStyle = "#b3ad9d";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  trace(r + 1.2);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // hand-drawn sunburst: tapered petal rays with per-ray jitter
  const inner = r * 0.1;
  const outer = r * 0.64;
  for (let i = 0; i < rayCount; i++) {
    ctx.save();
    ctx.rotate((i / rayCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.09);
    const len = outer * (0.9 + Math.random() * 0.18);
    const wBase = r * (0.075 + Math.random() * 0.03);
    ctx.beginPath();
    ctx.moveTo(inner, -wBase);
    ctx.quadraticCurveTo(len * 0.55, -wBase * 1.12, len, 0);
    ctx.quadraticCurveTo(len * 0.55, wBase * 1.12, inner, wBase);
    ctx.closePath();
    ctx.fillStyle = PALETTE.claudeOrange;
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.075, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.claudeOrange;
  ctx.fill();

  ctx.restore();
}

// 14" space-gray MacBook, open ~110deg. Screen faces -z; the lid exterior
// (Claude stickers) faces +z toward the resting camera.
export default function MacBook() {
  const { mixRef } = useDeskTheme();
  const glowRef = useRef<THREE.PointLight>(null);

  const baseMetal = useMemo(() => brushedMetalMaterial("#8e9196"), []);
  const lidEdgeMetal = useMemo(() => brushedMetalMaterial("#8e9196"), []);
  const darkPlastic = useMemo(() => plasticMaterial("#222327", 0.5), []);
  const bezelGlass = useMemo(() => plasticMaterial("#0b0b0c", 0.2), []);

  const lidBackMaterial = useMemo(() => {
    const texture = makeCanvasTexture(1024, 768, (ctx, w, h) => {
      ctx.fillStyle = "#94979c";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 520; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const len = 50 + Math.random() * 320;
        ctx.strokeStyle = Math.random() > 0.5 ? "#a4a7ad" : "#85888e";
        ctx.globalAlpha = 0.02 + Math.random() * 0.045;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      drawSunburstSticker(ctx, 340, 320, 170, -14, 11, "circle");
      drawSunburstSticker(ctx, 660, 470, 135, 9, 10, "squircle");
      drawSunburstSticker(ctx, 590, 200, 110, 28, 9, "circle");
    });
    return new THREE.MeshStandardMaterial({
      map: texture,
      metalness: 0.35,
      roughness: 0.45
    });
  }, []);

  const lidMaterials = useMemo(
    () => [
      lidEdgeMetal,
      lidEdgeMetal,
      lidEdgeMetal,
      lidEdgeMetal,
      lidBackMaterial,
      bezelGlass
    ],
    [lidEdgeMetal, lidBackMaterial, bezelGlass]
  );

  const screenMaterial = useMemo(() => {
    // u-mirrored (repeat -1) so the rotated display plane reads unmirrored
    const texture = makeCanvasTexture(
      1024,
      640,
      (ctx, w, h) => {
        ctx.fillStyle = "#1e1e23";
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "#26262d";
        ctx.fillRect(0, 0, w, 30);
        ["#e0635c", "#dba03f", "#65b65a"].forEach((color, i) => {
          ctx.beginPath();
          ctx.arc(22 + i * 20, 15, 6, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });
        ctx.fillStyle = "#0d0d11";
        roundedRectPath(ctx, w / 2 - 78, -8, 156, 34, 9);
        ctx.fill();

        ctx.fillStyle = "#1a1a1f";
        ctx.fillRect(0, 30, 58, h - 30);
        ctx.fillStyle = "#3c3c45";
        for (let y = 52; y < h - 30; y += 21) {
          ctx.fillRect(30, y - 3, 16, 5);
        }

        const colors = ["#a884c4", "#7d9bd1", "#a3bd7e", "#d4b072", PALETTE.claudeOrange];
        let indent = 0;
        for (let y = 52; y < h - 34; y += 21) {
          if (Math.random() < 0.12) {
            if (Math.random() < 0.5) indent = Math.max(0, indent - 1);
            continue;
          }
          if (Math.random() < 0.3) {
            indent = Math.max(0, Math.min(4, indent + (Math.random() < 0.5 ? 1 : -1)));
          }
          let x = 80 + indent * 34;
          const segments = 1 + Math.floor(Math.random() * 3);
          ctx.globalAlpha = 0.92;
          for (let s = 0; s < segments; s++) {
            const len = 36 + Math.random() * 150;
            if (x + len > w - 30) break;
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            roundedRectPath(ctx, x, y - 5, len, 11, 5);
            ctx.fill();
            x += len + 14 + Math.random() * 22;
          }
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = "#26262d";
        ctx.fillRect(0, h - 24, w, 24);
        ctx.fillStyle = PALETTE.claudeOrange;
        ctx.beginPath();
        ctx.arc(24, h - 12, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#4d4d57";
        roundedRectPath(ctx, 44, h - 16, 90, 8, 4);
        ctx.fill();
      },
      { repeat: [-1, 1] }
    );
    return new THREE.MeshStandardMaterial({
      color: "#000000",
      emissive: "#ffffff",
      emissiveMap: texture,
      emissiveIntensity: 1.5,
      roughness: 0.35,
      metalness: 0
    });
  }, []);

  const keyboardMaterial = useMemo(() => {
    const texture = makeCanvasTexture(768, 300, (ctx, w, h) => {
      ctx.fillStyle = "#3a3c40";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 7;
      ctx.strokeRect(2, 2, w - 4, h - 4);

      const m = 16;
      const gap = 6;
      const cols = 14;
      const rows = 6;
      const keyW = (w - m * 2 - gap * (cols - 1)) / cols;
      const keyH = (h - m * 2 - gap * (rows - 1)) / rows;
      const key = (x: number, y: number, kw: number, kh: number) => {
        ctx.fillStyle = "#1c1c1e";
        roundedRectPath(ctx, x, y, kw, kh, 4.5);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x + 2, y + 1.5, kw - 4, 1.5);
      };

      // canvas top maps to the deck's front edge, so the spacebar row draws first
      let x = m;
      [1, 1, 1, 1.25, 5.1, 1.25, 1, 1, 1].forEach((units) => {
        const kw = units * keyW + (units - 1) * gap;
        key(x, m, kw, keyH);
        x += kw + gap;
      });
      for (let row = 1; row < rows; row++) {
        const y = m + row * (keyH + gap);
        const kh = row === rows - 1 ? keyH * 0.62 : keyH;
        for (let c = 0; c < cols; c++) {
          key(m + c * (keyW + gap), y + (keyH - kh), keyW, kh);
        }
      }
    });
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.75,
      metalness: 0.1
    });
  }, []);

  const trackpadMaterial = useMemo(() => {
    const texture = makeCanvasTexture(256, 168, (ctx, w, h) => {
      ctx.fillStyle = "#76787e";
      ctx.fillRect(0, 0, w, h);
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, "rgba(255,255,255,0.07)");
      gradient.addColorStop(1, "rgba(0,0,0,0.05)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(24,24,27,0.6)";
      ctx.lineWidth = 3;
      roundedRectPath(ctx, 2, 2, w - 4, h - 4, 8);
      ctx.stroke();
    });
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.32,
      metalness: 0.5
    });
  }, []);

  // rotation.x = 0 would be a 90deg pose; jitter keeps the pose human
  const lidTilt = useMemo(
    () => THREE.MathUtils.degToRad(110 + (Math.random() - 0.5) * 3) - Math.PI / 2,
    []
  );

  useFrame(() => {
    const mix = mixRef.current;
    screenMaterial.emissiveIntensity = THREE.MathUtils.lerp(1.5, 0.35, mix);
    if (glowRef.current) {
      glowRef.current.intensity = THREE.MathUtils.lerp(0.16, 0, mix);
    }
  });

  return (
    <group>
      {FEET.map((position, index) => (
        <mesh key={index} position={position} castShadow material={darkPlastic}>
          <cylinderGeometry args={[0.0045, 0.0045, FOOT_H, 12]} />
        </mesh>
      ))}
      <RoundedBox
        args={[BASE_W, BASE_T, BASE_D]}
        radius={0.0035}
        smoothness={4}
        position={[0, FOOT_H + BASE_T / 2, 0]}
        castShadow
        receiveShadow
        material={baseMetal}
      />
      <mesh
        position={[0, BASE_TOP + 0.0003, 0.042]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        material={keyboardMaterial}
      >
        <planeGeometry args={[0.272, 0.105]} />
      </mesh>
      <mesh
        position={[0, BASE_TOP + 0.0003, -0.062]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={trackpadMaterial}
      >
        <planeGeometry args={[0.105, 0.068]} />
      </mesh>
      <mesh
        position={[0, HINGE_Y, HINGE_Z]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        material={darkPlastic}
      >
        <cylinderGeometry args={[0.0042, 0.0042, 0.26, 18]} />
      </mesh>
      <group position={[0, HINGE_Y, HINGE_Z]} rotation={[lidTilt, 0, 0]}>
        <mesh position={[0, LID_H / 2 - 0.002, 0]} castShadow material={lidMaterials}>
          <boxGeometry args={[LID_W, LID_H, LID_T]} />
        </mesh>
        <mesh
          position={[0, LID_H / 2 - 0.002, -LID_T / 2 - 0.0004]}
          rotation={[0, Math.PI, 0]}
          material={screenMaterial}
        >
          <planeGeometry args={[0.292, 0.186]} />
        </mesh>
        <pointLight
          ref={glowRef}
          position={[0, 0.115, -0.05]}
          color="#bcd6ff"
          intensity={0.3}
          distance={0.75}
          decay={2}
        />
      </group>
    </group>
  );
}
