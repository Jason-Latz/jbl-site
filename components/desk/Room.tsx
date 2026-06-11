"use client";

import { useMemo } from "react";
import {
  PALETTE,
  plasticMaterial,
  woodGrainTexture
} from "@/lib/three/materials";
import * as THREE from "three";
import { FLOOR_Y } from "./layout";

// The room around the desk: plank floor, back wall, baseboard. Kept simple —
// the camera never strays far, so this is set dressing for the desk.
export default function Room() {
  const floorMaterial = useMemo(() => {
    const texture = woodGrainTexture(
      PALETTE.woodFloor,
      PALETTE.woodFloorStreak,
      1024,
      1024
    );
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.5, 2.5);
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.7,
      metalness: 0.02
    });
  }, []);

  const wallMaterial = useMemo(() => {
    const material = plasticMaterial(PALETTE.wallCream, 0.95);
    material.metalness = 0;
    return material;
  }, []);

  const baseboardMaterial = useMemo(() => plasticMaterial("#d6c6aa", 0.8), []);

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_Y, 0.6]}
        receiveShadow
        material={floorMaterial}
      >
        <planeGeometry args={[7, 4.6]} />
      </mesh>
      <mesh position={[0, FLOOR_Y + 1.6, -0.62]} receiveShadow material={wallMaterial}>
        <planeGeometry args={[7, 3.2]} />
      </mesh>
      <mesh
        position={[0, FLOOR_Y + 0.045, -0.605]}
        receiveShadow
        material={baseboardMaterial}
      >
        <boxGeometry args={[7, 0.09, 0.018]} />
      </mesh>
    </group>
  );
}
