"use client";

import { useMemo } from "react";
import { woodMaterial } from "@/lib/three/materials";
import { DESK } from "./layout";

const LEG_RADIUS = 0.027;
const LEG_INSET = 0.1;

// The desk itself: solid wood slab, four turned legs, back apron.
// Top surface sits exactly at y=0 per scene convention.
export default function Desk() {
  const wood = useMemo(() => woodMaterial(), []);
  const legWood = useMemo(
    () => woodMaterial({ base: "#634428", streak: "#503722", roughness: 0.6 }),
    []
  );

  const legX = DESK.width / 2 - LEG_INSET;
  const legZ = DESK.depth / 2 - LEG_INSET;
  const legHeight = DESK.height - DESK.thickness;
  const legY = -DESK.thickness - legHeight / 2;

  const legPositions: [number, number, number][] = [
    [-legX, legY, -legZ],
    [legX, legY, -legZ],
    [-legX, legY, legZ],
    [legX, legY, legZ]
  ];

  return (
    <group>
      <mesh
        position={[0, -DESK.thickness / 2, 0]}
        castShadow
        receiveShadow
        material={wood}
      >
        <boxGeometry args={[DESK.width, DESK.thickness, DESK.depth]} />
      </mesh>
      {legPositions.map((position, index) => (
        <mesh
          key={index}
          position={position}
          castShadow
          material={legWood}
        >
          <cylinderGeometry args={[LEG_RADIUS, LEG_RADIUS * 0.82, legHeight, 14]} />
        </mesh>
      ))}
      <mesh
        position={[0, -DESK.thickness - 0.05, -DESK.depth / 2 + 0.05]}
        castShadow
        material={legWood}
      >
        <boxGeometry args={[DESK.width - LEG_INSET * 2.6, 0.09, 0.025]} />
      </mesh>
    </group>
  );
}
