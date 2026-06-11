"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { chromeMaterial, plasticMaterial } from "@/lib/three/materials";
import { useDeskTheme } from "../DeskThemeContext";

// IKEA Forså proportions, meters. Reach is along +x; layout.ts yaws the
// whole lamp toward the desk center.
const BASE_R = 0.072;
const BASE_H = 0.012;
const TIER_R = 0.047;
const TIER_H = 0.016;
const BASE_TOP = BASE_H + TIER_H;
const HINGE_Y = 0.105;
const LOWER_TILT = 0.32;
const LOWER_LEN = 0.26;
const ELBOW_X = Math.sin(LOWER_TILT) * LOWER_LEN;
const ELBOW_Y = HINGE_Y + Math.cos(LOWER_TILT) * LOWER_LEN;
const HEAD_X = 0.3;
const HEAD_Y = 0.47;
const UPPER_LEN = Math.hypot(HEAD_X - ELBOW_X, HEAD_Y - ELBOW_Y);
const UPPER_TILT = Math.atan2(HEAD_X - ELBOW_X, HEAD_Y - ELBOW_Y);
const DOME_R = 0.062;
const STRUT_Z = 0.0105;
const SPRING_LO = 0.048;
const SPRING_HI = 0.198;

export default function DeskLamp() {
  const { mixRef, toggleTheme } = useDeskTheme();
  const spotRef = useRef<THREE.SpotLight>(null);
  const headRef = useRef<THREE.Group>(null);
  const nudgeRef = useRef(0);

  const chrome = useMemo(() => chromeMaterial(), []);
  const black = useMemo(() => plasticMaterial("#15140f", 0.5), []);
  const cableMat = useMemo(() => plasticMaterial("#100f0c", 0.42), []);

  const innerDomeMat = useMemo(() => {
    const mat = plasticMaterial("#f4ede0", 0.9);
    mat.side = THREE.BackSide;
    mat.emissive = new THREE.Color("#ffd9a8");
    mat.emissiveIntensity = 0;
    return mat;
  }, []);

  const bulbMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#fff8ea",
        emissive: "#ffd9a8",
        emissiveIntensity: 0,
        roughness: 0.4,
        metalness: 0
      }),
    []
  );

  const spotTarget = useMemo(() => new THREE.Object3D(), []);

  // Stable assembly slack so the lamp reads hand-adjusted, not CAD-perfect.
  const pose = useMemo(() => {
    const domePitch = 0.56 + (Math.random() - 0.5) * 0.03;
    return {
      baseYaw: (Math.random() - 0.5) * 0.05,
      headYaw: -0.16 + (Math.random() - 0.5) * 0.04,
      headRoll: (Math.random() - 0.5) * 0.025,
      domePitch,
      // Dome center offset so its pole lands exactly on the head joint.
      domeCx: Math.sin(domePitch) * DOME_R,
      domeCy: -Math.cos(domePitch) * DOME_R
    };
  }, []);

  const springGeo = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const turns = 6.5;
    const coilR = 0.0072;
    const steps = 150;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = t * turns * Math.PI * 2;
      points.push(
        new THREE.Vector3(
          Math.cos(a) * coilR,
          SPRING_LO + (SPRING_HI - SPRING_LO) * t,
          Math.sin(a) * coilR
        )
      );
    }
    return new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      64,
      0.0016,
      6,
      false
    );
  }, []);

  const cable = useMemo(() => {
    const points = [
      new THREE.Vector3(-0.04, 0.016, 0),
      new THREE.Vector3(-0.075, 0.005, -0.012),
      new THREE.Vector3(-0.115, 0.0024, 0.01),
      new THREE.Vector3(-0.15, 0.0024, 0.05),
      new THREE.Vector3(-0.175, 0.0024, 0.02)
    ];
    const geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      48,
      0.0021,
      8,
      false
    );
    return { geometry, end: points[points.length - 1] };
  }, []);

  useFrame((_, delta) => {
    const mix = mixRef.current;
    if (spotRef.current) {
      spotRef.current.intensity = THREE.MathUtils.lerp(0, 7, mix);
    }
    bulbMat.emissiveIntensity = THREE.MathUtils.lerp(0, 2.4, mix);
    innerDomeMat.emissiveIntensity = THREE.MathUtils.lerp(0, 0.6, mix);

    nudgeRef.current = THREE.MathUtils.damp(nudgeRef.current, 0, 5, delta);
    if (headRef.current) {
      headRef.current.rotation.z = -0.06 * nudgeRef.current;
    }
  });

  const postHeight = HINGE_Y - BASE_TOP + 0.004;

  return (
    <group
      rotation={[0, pose.baseYaw, 0]}
      onClick={(e) => {
        e.stopPropagation();
        nudgeRef.current = 1;
        toggleTheme();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <mesh position={[0, BASE_H / 2, 0]} castShadow material={chrome}>
        <cylinderGeometry args={[BASE_R * 0.96, BASE_R, BASE_H, 48]} />
      </mesh>
      <mesh
        position={[0, BASE_H + TIER_H / 2, 0]}
        castShadow
        receiveShadow
        material={chrome}
      >
        <cylinderGeometry args={[TIER_R * 0.94, TIER_R, TIER_H, 40]} />
      </mesh>
      <mesh
        position={[0, BASE_TOP + postHeight / 2 - 0.002, 0]}
        castShadow
        material={chrome}
      >
        <cylinderGeometry args={[0.0058, 0.0058, postHeight, 16]} />
      </mesh>

      <group position={[0, HINGE_Y, 0]} rotation={[0, 0, -LOWER_TILT]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow material={black}>
          <cylinderGeometry args={[0.0095, 0.0095, 0.027, 20]} />
        </mesh>
        <mesh
          position={[0, 0, 0.0185]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          material={black}
        >
          <cylinderGeometry args={[0.0058, 0.0058, 0.012, 14]} />
        </mesh>
        {[-STRUT_Z, STRUT_Z].map((z) => (
          <mesh
            key={z}
            position={[0, LOWER_LEN / 2, z]}
            castShadow
            material={chrome}
          >
            <boxGeometry args={[0.009, LOWER_LEN + 0.006, 0.0032]} />
          </mesh>
        ))}
        <mesh geometry={springGeo} castShadow material={chrome} />
        {[SPRING_LO, SPRING_HI].map((y) => (
          <mesh
            key={y}
            position={[0, y, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
            material={chrome}
          >
            <cylinderGeometry args={[0.0022, 0.0022, 0.024, 10]} />
          </mesh>
        ))}
      </group>

      <group position={[ELBOW_X, ELBOW_Y, 0]}>
        <group rotation={[0, 0, -UPPER_TILT]}>
          <mesh position={[0, UPPER_LEN / 2, 0]} castShadow material={chrome}>
            <cylinderGeometry args={[0.0052, 0.0052, UPPER_LEN + 0.008, 14]} />
          </mesh>
        </group>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow material={black}>
          <cylinderGeometry args={[0.0115, 0.0115, 0.029, 22]} />
        </mesh>
        <mesh
          position={[0, 0, 0.0205]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          material={black}
        >
          <cylinderGeometry args={[0.0065, 0.0065, 0.013, 14]} />
        </mesh>
      </group>

      <group
        position={[HEAD_X, HEAD_Y, 0]}
        rotation={[0, pose.headYaw, pose.headRoll]}
      >
        <group ref={headRef}>
          <mesh castShadow material={black}>
            <sphereGeometry args={[0.0095, 18, 14]} />
          </mesh>
          <group
            position={[pose.domeCx, pose.domeCy, 0]}
            rotation={[0, 0, pose.domePitch]}
          >
            <mesh castShadow material={chrome}>
              <sphereGeometry
                args={[DOME_R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]}
              />
            </mesh>
            <mesh material={innerDomeMat}>
              <sphereGeometry
                args={[DOME_R - 0.0035, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2]}
              />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={chrome}>
              <torusGeometry args={[DOME_R - 0.0017, 0.0023, 10, 48]} />
            </mesh>
            <mesh position={[0, 0.03, 0]} material={black}>
              <cylinderGeometry args={[0.009, 0.0105, 0.026, 16]} />
            </mesh>
            <mesh position={[0, -0.009, 0]} material={bulbMat}>
              <cylinderGeometry args={[0.0205, 0.0205, 0.007, 24]} />
            </mesh>
            <spotLight
              ref={spotRef}
              position={[0, -0.016, 0]}
              target={spotTarget}
              color="#ffd9a8"
              intensity={0}
              angle={0.62}
              penumbra={0.55}
              decay={2}
              distance={3.5}
              castShadow
              shadow-mapSize={[1024, 1024]}
              shadow-bias={-0.0003}
              shadow-camera-near={0.08}
              shadow-camera-far={3.2}
            />
          </group>
        </group>
      </group>

      {/* Light pool lands ~0.5 m ahead of the base, where the turntable sits. */}
      <primitive object={spotTarget} position={[0.5, 0, 0.12]} />

      <mesh geometry={cable.geometry} castShadow material={cableMat} />
      <mesh position={cable.end} material={cableMat}>
        <sphereGeometry args={[0.0021, 8, 6]} />
      </mesh>
    </group>
  );
}
