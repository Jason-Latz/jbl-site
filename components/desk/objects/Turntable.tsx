"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import {
  PALETTE,
  makeCanvasTexture,
  woodMaterial,
  chromeMaterial,
  brushedMetalMaterial,
  plasticMaterial,
  paperMaterial,
  feltMaterial
} from "@/lib/three/materials";
import { useDeskTheme } from "../DeskThemeContext";

type TurntableProps = {
  playing: boolean;
  armDown: boolean;
  onNeedleClick?: () => void;
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
  [-0.165, 0.006, -0.125],
  [0.165, 0.006, -0.125],
  [-0.165, 0.006, 0.125],
  [0.165, 0.006, 0.125]
];

export default function Turntable({
  playing,
  armDown,
  onNeedleClick
}: TurntableProps) {
  const { mixRef } = useDeskTheme();

  const spinRef = useRef<THREE.Group>(null);
  const yawRef = useRef<THREE.Group>(null);
  const pitchRef = useRef<THREE.Group>(null);
  const btn33Ref = useRef<THREE.Mesh>(null);
  const velocityRef = useRef(0);

  const mats = useMemo(() => {
    const grooveMap = makeCanvasTexture(
      1024,
      1024,
      (ctx, w, h) => {
        ctx.fillStyle = "#c8c8c8";
        ctx.fillRect(0, 0, w, h);
        const cx = w / 2;
        const cy = h / 2;
        // Program area rings; rim lead-in (>490px) and label area
        // (<206px) stay smooth.
        for (let i = 0; i < 84; i++) {
          const r = 206 + (488 - 206) * (i / 83) + (Math.random() - 0.5) * 2;
          const g = 95 + Math.floor(Math.random() * 125);
          ctx.strokeStyle = `rgb(${g},${g},${g})`;
          ctx.globalAlpha = 0.55 + Math.random() * 0.45;
          ctx.lineWidth = 1.2 + Math.random() * 2.2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        for (const t of [0.22, 0.46, 0.71]) {
          ctx.strokeStyle = "#d4d4d4";
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(cx, cy, 206 + (488 - 206) * t, 0, Math.PI * 2);
          ctx.stroke();
        }
      },
      { srgb: false, anisotropy: 8 }
    );

    const labelMap = makeCanvasTexture(
      512,
      512,
      (ctx, w, h) => {
        ctx.fillStyle = PALETTE.accentCoral;
        ctx.fillRect(0, 0, w, h);
        const c = w / 2;
        ctx.strokeStyle = "#923c1d";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(c, c, 224, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c, c, 170, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#1a1410";
        ctx.beginPath();
        ctx.arc(c, c, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.inkDark;
        ctx.font = "italic 48px Georgia";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("blonded", c, c - 72);
      },
      { anisotropy: 8 }
    );

    const vinyl = plasticMaterial("#0c0b0a", 0.42);
    vinyl.roughnessMap = grooveMap;

    const label = paperMaterial("#ffffff");
    label.map = labelMap;
    label.roughness = 0.62;

    const led = plasticMaterial("#2a0a04", 0.5);
    led.emissive = new THREE.Color("#ff6a2e");
    led.emissiveIntensity = 1.8;

    return {
      wood: woodMaterial({ base: "#54381f", streak: "#3f2a17", roughness: 0.5 }),
      charcoal: plasticMaterial("#24211c", 0.6),
      foot: plasticMaterial("#15130f", 0.75),
      platter: brushedMetalMaterial(),
      mat: feltMaterial("#1a1916"),
      chrome: chromeMaterial(),
      vinyl,
      label,
      led,
      armMetal: brushedMetalMaterial("#9b978e"),
      armDark: plasticMaterial("#1d1c1a", 0.5),
      counterweight: brushedMetalMaterial("#4a4843"),
      button: brushedMetalMaterial("#8e8b84")
    };
  }, []);

  const seed = useMemo(
    () => ({
      vinylSpin: Math.random() * Math.PI * 2,
      matSpin: Math.random() * Math.PI * 2
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
        <mesh key={index} position={position} castShadow material={mats.foot}>
          <cylinderGeometry args={[0.016, 0.018, 0.012, 24]} />
        </mesh>
      ))}

      <mesh position={[0, 0.027, 0]} castShadow receiveShadow material={mats.wood}>
        <boxGeometry args={[0.42, 0.03, 0.34]} />
      </mesh>
      <mesh
        position={[0, 0.049, 0]}
        castShadow
        receiveShadow
        material={mats.charcoal}
      >
        <boxGeometry args={[0.426, 0.014, 0.346]} />
      </mesh>

      <group ref={spinRef} position={[SPINDLE_X, PLINTH_TOP, SPINDLE_Z]}>
        <mesh position={[0, 0.0125, 0]} castShadow receiveShadow material={mats.platter}>
          <cylinderGeometry args={[0.146, 0.146, 0.022, 128]} />
        </mesh>
        <mesh
          position={[0, 0.0255, 0]}
          rotation={[0, seed.matSpin, 0]}
          receiveShadow
          material={mats.mat}
        >
          <cylinderGeometry args={[0.143, 0.143, 0.003, 96]} />
        </mesh>
        <group rotation={[0, seed.vinylSpin, 0]}>
          <mesh position={[0, 0.0281, 0]} castShadow receiveShadow material={mats.vinyl}>
            <cylinderGeometry args={[0.15, 0.15, 0.0022, 160]} />
          </mesh>
          <mesh position={[0, 0.0296, 0]} receiveShadow material={mats.label}>
            <cylinderGeometry args={[0.05, 0.05, 0.0008, 64]} />
          </mesh>
        </group>
        <mesh position={[0, 0.0295, 0]} castShadow material={mats.chrome}>
          <cylinderGeometry args={[0.0035, 0.0035, 0.016, 20]} />
        </mesh>
      </group>

      <group position={[ARM_PIVOT_X, PLINTH_TOP, ARM_PIVOT_Z]}>
        <mesh position={[0, 0.005, 0]} castShadow material={mats.armDark}>
          <cylinderGeometry args={[0.0135, 0.0145, 0.01, 32]} />
        </mesh>
        <mesh position={[0, 0.028, 0]} castShadow material={mats.armMetal}>
          <cylinderGeometry args={[0.0085, 0.0085, 0.036, 24]} />
        </mesh>
        <mesh position={[0, 0.0505, 0]} castShadow material={mats.armDark}>
          <cylinderGeometry args={[0.0095, 0.0095, 0.009, 24]} />
        </mesh>
        <mesh position={[0, BEARING_Y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow material={mats.chrome}>
          <torusGeometry args={[0.0105, 0.0022, 10, 48]} />
        </mesh>

        {/* Cue lever */}
        <group position={[0.024, 0, 0.01]}>
          <mesh position={[0, 0.002, 0]} castShadow material={mats.armDark}>
            <boxGeometry args={[0.012, 0.004, 0.008]} />
          </mesh>
          <mesh position={[0, 0.009, 0]} castShadow material={mats.armMetal}>
            <cylinderGeometry args={[0.0016, 0.0016, 0.01, 10]} />
          </mesh>
          <mesh position={[0.0025, 0.0145, 0]} rotation={[0, 0, 0.32]} castShadow material={mats.armDark}>
            <boxGeometry args={[0.01, 0.0018, 0.0035]} />
          </mesh>
        </group>

        {/* Arm rest clip, aligned with the parked tube direction */}
        <group position={[-0.0155, 0, 0.1542]} rotation={[0, YAW_PARK, 0]}>
          <mesh position={[0, 0.024, 0]} castShadow material={mats.armDark}>
            <cylinderGeometry args={[0.0024, 0.003, 0.048, 12]} />
          </mesh>
          <mesh position={[0, 0.0475, 0]} castShadow material={mats.armDark}>
            <boxGeometry args={[0.009, 0.003, 0.006]} />
          </mesh>
          <mesh position={[-0.0037, 0.053, 0]} castShadow material={mats.armDark}>
            <boxGeometry args={[0.0012, 0.009, 0.006]} />
          </mesh>
          <mesh position={[0.0037, 0.053, 0]} castShadow material={mats.armDark}>
            <boxGeometry args={[0.0012, 0.009, 0.006]} />
          </mesh>
        </group>

        <group ref={yawRef} position={[0, BEARING_Y, 0]} rotation={[0, YAW_PARK, 0]}>
          <group ref={pitchRef} rotation={[PITCH_UP, 0, 0]}>
            <mesh position={[0, 0, 0.115]} rotation={[Math.PI / 2, 0, 0]} castShadow material={mats.armMetal}>
              <cylinderGeometry args={[0.004, 0.004, 0.21, 16]} />
            </mesh>
            <mesh position={[0, 0, -0.025]} rotation={[Math.PI / 2, 0, 0]} castShadow material={mats.armMetal}>
              <cylinderGeometry args={[0.003, 0.003, 0.05, 12]} />
            </mesh>
            <mesh
              position={[0, -0.002, -0.034]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
              material={mats.counterweight}
            >
              <cylinderGeometry args={[0.012, 0.012, 0.02, 28]} />
            </mesh>

            {/* Offset headshell angled toward the spindle */}
            <group position={[0, -0.0035, 0.218]} rotation={[0, -0.35, 0]}>
              <mesh position={[0, 0, 0.008]} castShadow material={mats.armDark}>
                <boxGeometry args={[0.013, 0.007, 0.027]} />
              </mesh>
              <mesh position={[0, -0.006, 0.012]} castShadow material={mats.armDark}>
                <boxGeometry args={[0.01, 0.0055, 0.015]} />
              </mesh>
              <mesh position={[0, -0.0105, 0.017]} rotation={[Math.PI, 0, 0]} castShadow material={mats.chrome}>
                <coneGeometry args={[0.0012, 0.0035, 8]} />
              </mesh>
              <mesh position={[-0.0075, 0.001, 0.018]} rotation={[0, 0.5, 0]} castShadow material={mats.chrome}>
                <boxGeometry args={[0.0012, 0.0012, 0.01]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>

      {/* Speed buttons + power LED, front-left of the plinth */}
      <mesh ref={btn33Ref} position={[-0.172, 0.0565, 0.138]} castShadow material={mats.button}>
        <cylinderGeometry args={[0.0055, 0.0055, 0.005, 24]} />
      </mesh>
      <mesh position={[-0.15, 0.0565, 0.138]} castShadow material={mats.button}>
        <cylinderGeometry args={[0.0055, 0.0055, 0.005, 24]} />
      </mesh>
      <mesh position={[-0.188, 0.0566, 0.152]} material={mats.led}>
        <cylinderGeometry args={[0.002, 0.002, 0.004, 12]} />
      </mesh>
    </group>
  );
}
