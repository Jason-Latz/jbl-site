"use client";

import { useMemo } from "react";
import * as THREE from "three";
import {
  PALETTE,
  brushedMetalMaterial,
  chromeMaterial,
  makeCanvasTexture,
  paperMaterial,
  plasticMaterial
} from "@/lib/three/materials";

const PAD_W = 0.148;
const PAD_D = 0.21;
const LOWER_H = 0.005;
const UPPER_H = 0.002;
const STACK_H = LOWER_H + UPPER_H;

const LOOP_COUNT = 14;
const LOOP_R = 0.0045;
const LOOP_TUBE = 0.0009;
const LOOP_SPAN = PAD_W - 0.013;
const LOOP_XS = Array.from(
  { length: LOOP_COUNT },
  (_, i) => -LOOP_SPAN / 2 + (LOOP_SPAN / (LOOP_COUNT - 1)) * i
);

const PEN_LEN = 0.14;
const PEN_R = 0.0055;
const PEN_TIP_LEN = 0.016;
const PEN_BODY_LEN = PEN_LEN - PEN_TIP_LEN - PEN_R;

// Spiral-bound A5 notepad lying flat, pen resting alongside.
// The future guestbook — top sheet promises notes from visitors.
export default function Notepad() {
  const stackPaper = useMemo(() => paperMaterial(), []);
  const edgePaper = useMemo(() => paperMaterial("#e7dfcd"), []);
  const darkMetal = useMemo(() => brushedMetalMaterial("#3c3a36"), []);
  const penBody = useMemo(() => plasticMaterial(PALETTE.inkDark, 0.35), []);
  const chrome = useMemo(() => chromeMaterial(), []);
  const loopGeometry = useMemo(
    () => new THREE.TorusGeometry(LOOP_R, LOOP_TUBE, 6, 18),
    []
  );

  // Each coil leans the same general way (it is one continuous spiral)
  // with a touch of per-loop variance.
  const loopJitter = useMemo(() => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    return LOOP_XS.map(() => ({
      cant: 0.11 + (rand() - 0.5) * 0.07,
      z: (rand() - 0.5) * 0.0004
    }));
  }, []);

  const sheetMaterial = useMemo(() => {
    const material = paperMaterial("#f7f1e3");
    material.map = makeCanvasTexture(640, 905, (ctx, w, h) => {
      ctx.fillStyle = "#f7f1e3";
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = "#e8e0cd";
        ctx.globalAlpha = 0.1 + Math.random() * 0.12;
        const r = 8 + Math.random() * 26;
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.strokeStyle = "#cdbfa4";
      ctx.lineWidth = 1.6;
      for (let y = 116; y < h - 14; y += 36) {
        ctx.beginPath();
        ctx.moveTo(26, y);
        ctx.lineTo(w - 26, y);
        ctx.stroke();
      }

      ctx.strokeStyle = "#c98b7e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(86, 96);
      ctx.lineTo(86, h - 10);
      ctx.stroke();

      // Punch holes lining up with the spiral coils above.
      for (const loopX of LOOP_XS) {
        const x = ((loopX + PAD_W / 2) / PAD_W) * w;
        ctx.fillStyle = "#d9cfb8";
        ctx.beginPath();
        ctx.arc(x, 18, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#b6a98c";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      ctx.fillStyle = "#3a342a";
      ctx.font = "italic 38px Georgia";
      const scribbles: [string, number, number, number][] = [
        ["leave a note", 112, 289, -0.02],
        ["(soon — the pad goes live", 104, 361, 0.012],
        ["for every visitor)", 128, 433, -0.015]
      ];
      for (const [text, x, y, tilt] of scribbles) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tilt);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      ctx.strokeStyle = "#c98b7e";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      const cx = 556;
      const cy = 812;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.22;
        const inner = 5 + Math.sin(i * 7) * 1.5;
        const outer = 19 + Math.sin(i * 3.3) * 3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.stroke();
      }
    });
    return material;
  }, []);

  return (
    <group>
      <mesh
        position={[0, LOWER_H / 2, 0]}
        castShadow
        receiveShadow
        material={edgePaper}
      >
        <boxGeometry args={[PAD_W - 0.002, LOWER_H, PAD_D - 0.002]} />
      </mesh>
      <mesh
        position={[0, LOWER_H + UPPER_H / 2, 0]}
        castShadow
        receiveShadow
        material={stackPaper}
      >
        <boxGeometry args={[PAD_W, UPPER_H, PAD_D]} />
      </mesh>
      <mesh
        position={[0, STACK_H + 0.0003, 0]}
        rotation={[-Math.PI / 2, 0, 0.007]}
        receiveShadow
        material={sheetMaterial}
      >
        <planeGeometry args={[PAD_W, PAD_D]} />
      </mesh>

      {LOOP_XS.map((x, i) => (
        <mesh
          key={i}
          geometry={loopGeometry}
          material={darkMetal}
          position={[x, LOOP_R, -PAD_D / 2 + 0.0005 + loopJitter[i].z]}
          rotation={[0, Math.PI / 2 + loopJitter[i].cant, 0]}
          castShadow
        />
      ))}

      <group position={[0.112, PEN_R, 0.03]} rotation={[0, 1.13, 0]}>
        <mesh
          position={[-(PEN_LEN / 2 - PEN_R), 0, 0]}
          castShadow
          material={penBody}
        >
          <sphereGeometry args={[PEN_R, 18, 14]} />
        </mesh>
        <mesh
          position={[-(PEN_LEN / 2 - PEN_R) + PEN_BODY_LEN / 2, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
          castShadow
          material={penBody}
        >
          <cylinderGeometry args={[PEN_R, PEN_R, PEN_BODY_LEN, 20]} />
        </mesh>
        <mesh
          position={[PEN_LEN / 2 - PEN_TIP_LEN - 0.002, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
          castShadow
          material={chrome}
        >
          <cylinderGeometry args={[PEN_R + 0.0002, PEN_R + 0.0002, 0.004, 20]} />
        </mesh>
        <mesh
          position={[PEN_LEN / 2 - PEN_TIP_LEN / 2, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
          castShadow
          material={chrome}
        >
          <coneGeometry args={[PEN_R, PEN_TIP_LEN, 18]} />
        </mesh>
        <mesh
          position={[-0.045, PEN_R + 0.0003, 0]}
          castShadow
          material={chrome}
        >
          <boxGeometry args={[0.032, 0.001, 0.0026]} />
        </mesh>
      </group>
    </group>
  );
}
