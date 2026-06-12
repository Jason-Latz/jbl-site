"use client";

// HEAD Radical Pro, hung flat on the wall to the right of the window.
//
// Colorway researched from the current (2023+) Radical Pro line: a neon
// ORANGE hoop with NAVY / obsidian accents through the throat and shaft and
// white branding; natural warm-white string bed, black grip. Sources:
//   https://www.tennis-warehouse.com/Head_Radical_Pro_2023/descpageRCHEAD-HRPR.html
//   https://www.head.com/en_US/radical-pro-2023-235103.html
//   https://www.tennisnerd.net/gear/racquets/head-radical-racquet-review-pro-and-mp-auxetic-2-0/45446
//
// Geometry conventions: the racket lies in the XY plane with its face normal
// pointing +z (into the room). Origin is the racket's center; the head is up
// (+y), the grip hangs down (-y). The frame plane sits at z≈0 so the back of
// the tube nearly touches the wall, and a short wooden peg pokes into -z to
// hang it. The integrator positions the whole thing at the wall.

import { useMemo } from "react";
import * as THREE from "three";
import { mergeBufferGeometries } from "three-stdlib";
import { makeCanvasTexture } from "@/lib/three/materials";

// Head dimensions (98 sq in ≈ 0.24 x 0.32 m). Tube centerline radii; the
// 11 mm tube radius pushes the outer silhouette to ~0.26 x 0.34 m.
const HOOP_CX = 0;
const HOOP_CY = 0.18;
const HOOP_RX = 0.118;
const HOOP_RY = 0.152;
const TUBE_R = 0.011;

const SHAFT_TOP_Y = 0.0; // where the throat arms spring from the shaft
const GRIP_TOP_Y = -0.125;
const BUTT_Y = -0.3425; // total length ≈ 0.685 m

// A capsule-free cylinder between two points, rotation+position baked into
// the geometry so it can be merged.
function strut(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  radialSeg = 10
): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, radialSeg, 1);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  geo.applyMatrix4(
    new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1))
  );
  return geo;
}

// Point on the hoop centerline at angle θ (0 = +x, CCW).
function hoopPoint(theta: number, z = 0): THREE.Vector3 {
  return new THREE.Vector3(
    HOOP_CX + HOOP_RX * Math.cos(theta),
    HOOP_CY + HOOP_RY * Math.sin(theta),
    z
  );
}

export default function TennisRacket() {
  const built = useMemo(() => {
    // ——— Hoop: an elliptical tube ———
    const N = 128;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      pts.push(hoopPoint((i / N) * Math.PI * 2));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
    const hoopGeo = new THREE.TubeGeometry(curve, 180, TUBE_R, 12, true);

    // ——— Throat arms: from the shaft top out to the lower hoop ———
    const shaftTop = new THREE.Vector3(0, SHAFT_TOP_Y, 0);
    const armR = hoopPoint(-Math.PI / 3); // lower-right of the hoop
    const armL = hoopPoint((-2 * Math.PI) / 3); // lower-left
    const throatGeo = mergeBufferGeometries([
      strut(shaftTop, armR, 0.0095),
      strut(shaftTop, armL, 0.0095)
    ])!;

    // ——— Shaft (octagonal feel) ———
    const shaftGeo = new THREE.CylinderGeometry(
      0.0108,
      0.0125,
      SHAFT_TOP_Y - GRIP_TOP_Y,
      8
    );
    shaftGeo.translate(0, (SHAFT_TOP_Y + GRIP_TOP_Y) / 2, 0);

    // ——— Strings: mains + crosses clipped to the inner ellipse ———
    const inRx = HOOP_RX - 0.015;
    const inRy = HOOP_RY - 0.015;
    const stringGeos: THREE.BufferGeometry[] = [];
    const sT = 0.0014; // string thickness
    const mains = 14;
    for (let i = 1; i < mains; i++) {
      const x = -inRx + (i / mains) * 2 * inRx;
      const frac = 1 - (x / inRx) ** 2;
      if (frac <= 0.02) continue;
      const half = inRy * Math.sqrt(frac);
      const g = new THREE.BoxGeometry(sT, half * 2, sT);
      g.translate(x, HOOP_CY, 0.0015);
      stringGeos.push(g);
    }
    const crosses = 18;
    for (let j = 1; j < crosses; j++) {
      const y = -inRy + (j / crosses) * 2 * inRy;
      const frac = 1 - (y / inRy) ** 2;
      if (frac <= 0.02) continue;
      const half = inRx * Math.sqrt(frac);
      const g = new THREE.BoxGeometry(half * 2, sT, sT);
      g.translate(HOOP_CX, HOOP_CY + y, -0.0015);
      stringGeos.push(g);
    }
    const stringsGeo = mergeBufferGeometries(stringGeos)!;

    // ——— Grip ———
    const gripGeo = new THREE.CylinderGeometry(0.0135, 0.0142, GRIP_TOP_Y - BUTT_Y, 8);
    gripGeo.translate(0, (GRIP_TOP_Y + BUTT_Y) / 2, 0);
    const buttGeo = new THREE.CylinderGeometry(0.0162, 0.0152, 0.009, 8);
    buttGeo.translate(0, BUTT_Y + 0.0045, 0);

    // ——— Peg (wood dowel into the wall, through the throat opening) ———
    const pegGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.05, 12);
    pegGeo.rotateX(Math.PI / 2);
    pegGeo.translate(0, -0.03, -0.012);

    // ——— Dampener ———
    const dampGeo = new THREE.BoxGeometry(0.014, 0.01, 0.004);
    dampGeo.translate(0, HOOP_CY - inRy + 0.006, 0);

    // ——— Textures ———
    const gripTex = makeCanvasTexture(
      64,
      512,
      (ctx, w, h) => {
        ctx.fillStyle = "#1c1c20";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 2;
        for (let y = -w; y < h; y += 14) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y + w);
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        for (let y = -w; y < h; y += 14) {
          ctx.beginPath();
          ctx.moveTo(0, y + 6);
          ctx.lineTo(w, y + 6 + w);
          ctx.stroke();
        }
      },
      { repeat: [1, 1] }
    );

    const shaftTex = makeCanvasTexture(512, 64, (ctx, w, h) => {
      ctx.fillStyle = "#1a2540"; // navy
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#f3f1ea";
      ctx.font = "bold 30px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.letterSpacing = "4px";
      ctx.fillText("RADICAL", w / 2, h / 2 + 2);
    });
    shaftTex.center.set(0.5, 0.5);
    shaftTex.rotation = Math.PI / 2;

    const logoTex = makeCanvasTexture(256, 96, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#f3f1ea";
      ctx.font = "bold 64px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.letterSpacing = "2px";
      ctx.fillText("HEAD", w / 2, h / 2 + 2);
    });

    return {
      hoopGeo,
      throatGeo,
      shaftGeo,
      stringsGeo,
      gripGeo,
      buttGeo,
      pegGeo,
      dampGeo,
      gripTex,
      shaftTex,
      logoTex
    };
  }, []);

  const mats = useMemo(() => {
    const orange = new THREE.MeshStandardMaterial({
      color: "#e8602a",
      roughness: 0.34,
      metalness: 0.25
    });
    const navy = new THREE.MeshStandardMaterial({
      color: "#1a2540",
      roughness: 0.4,
      metalness: 0.25
    });
    const navyShaft = new THREE.MeshStandardMaterial({
      map: built.shaftTex,
      roughness: 0.4,
      metalness: 0.25
    });
    const grip = new THREE.MeshStandardMaterial({
      map: built.gripTex,
      roughness: 0.82,
      metalness: 0.0
    });
    const butt = new THREE.MeshStandardMaterial({
      color: "#101013",
      roughness: 0.6
    });
    const string = new THREE.MeshStandardMaterial({
      color: "#ece6d4",
      roughness: 0.55,
      metalness: 0.0
    });
    const peg = new THREE.MeshStandardMaterial({
      color: "#5d3f28",
      roughness: 0.62
    });
    const damp = new THREE.MeshStandardMaterial({
      color: "#15151a",
      roughness: 0.5
    });
    const logo = new THREE.MeshStandardMaterial({
      map: built.logoTex,
      transparent: true,
      roughness: 0.4,
      metalness: 0.2
    });
    return { orange, navy, navyShaft, grip, butt, string, peg, damp, logo };
  }, [built]);

  return (
    <group name="tennisRacket">
      <mesh name="racketFrame" geometry={built.hoopGeo} material={mats.orange} castShadow />
      <mesh geometry={built.throatGeo} material={mats.navy} castShadow />
      <mesh geometry={built.shaftGeo} material={mats.navyShaft} castShadow />
      <mesh name="racketStrings" geometry={built.stringsGeo} material={mats.string} />
      <mesh name="racketGrip" geometry={built.gripGeo} material={mats.grip} castShadow />
      <mesh geometry={built.buttGeo} material={mats.butt} castShadow />
      <mesh geometry={built.dampGeo} material={mats.damp} />
      <mesh name="racketPeg" geometry={built.pegGeo} material={mats.peg} castShadow />
      {/* HEAD wordmark on the inner throat bridge of the hoop */}
      <mesh position={[0, HOOP_CY - HOOP_RY + 0.022, TUBE_R + 0.0005]} material={mats.logo}>
        <planeGeometry args={[0.05, 0.019]} />
      </mesh>
    </group>
  );
}
