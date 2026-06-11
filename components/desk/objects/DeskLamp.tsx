"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { makeCanvasTexture, plasticMaterial } from "@/lib/three/materials";
import { useDeskTheme } from "../DeskThemeContext";

// IKEA Forså proportions, meters. Reach is along +x; layout.ts yaws the
// whole lamp toward the desk center.
const BASE_R = 0.072;
const BASE_TOP = 0.0345;
const HINGE_Y = 0.105;
const LOWER_TILT = 0.32;
const LOWER_LEN = 0.26;
const ELBOW_X = Math.sin(LOWER_TILT) * LOWER_LEN;
const ELBOW_Y = HINGE_Y + Math.cos(LOWER_TILT) * LOWER_LEN;
const HEAD_X = 0.29;
const HEAD_Y = 0.465;
const UPPER_LEN = Math.hypot(HEAD_X - ELBOW_X, HEAD_Y - ELBOW_Y);
const UPPER_TILT = Math.atan2(HEAD_X - ELBOW_X, HEAD_Y - ELBOW_Y);
const STRUT_Z = 0.011;
const STRUT_LEN = LOWER_LEN + 0.024;
const PIN_LO = 0.052;
const PIN_HI = 0.198;

function pushPt(out: THREE.Vector2[], x: number, y: number) {
  const last = out[out.length - 1];
  if (last && Math.abs(last.x - x) < 1e-6 && Math.abs(last.y - y) < 1e-6) {
    return;
  }
  out.push(new THREE.Vector2(x, y));
}

function pushArc(
  out: THREE.Vector2[],
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  n: number
) {
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pushPt(out, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
}

function smooth(
  ctrl: Array<[number, number]>,
  samples: number
): THREE.Vector2[] {
  const curve = new THREE.CatmullRomCurve3(
    ctrl.map(([x, y]) => new THREE.Vector3(x, y, 0))
  );
  return curve
    .getPoints(samples)
    .map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y));
}

// Pill-section joint knuckle: chamfered drum lathed along +y, 0..len.
function knuckleGeometry(r: number, len: number): THREE.LatheGeometry {
  const f = Math.min(0.0018, r * 0.22);
  const pts: THREE.Vector2[] = [];
  pushPt(pts, r * 0.3, 0);
  pushPt(pts, r - f, 0);
  pushArc(pts, r - f, f, f, -Math.PI / 2, 0, 5);
  pushPt(pts, r, len - f);
  pushArc(pts, r - f, len - f, f, 0, Math.PI / 2, 5);
  pushPt(pts, r * 0.3, len);
  return new THREE.LatheGeometry(pts, 40);
}

export default function DeskLamp() {
  const { mixRef, toggleTheme } = useDeskTheme();
  const spotRef = useRef<THREE.SpotLight>(null);
  const headRef = useRef<THREE.Group>(null);
  const nudgeRef = useRef(0);

  const maps = useMemo(() => {
    // Fine axial ridges; wraps the knurled wheel rims via lathe UVs.
    const knurl = makeCanvasTexture(
      512,
      64,
      (ctx, w, h) => {
        ctx.fillStyle = "#9a9a9a";
        ctx.fillRect(0, 0, w, h);
        const n = 96;
        for (let i = 0; i < n; i++) {
          const x = (i / n) * w;
          const g = ctx.createLinearGradient(x, 0, x + w / n, 0);
          g.addColorStop(0, "#3c3c3c");
          g.addColorStop(0.5, "#e9e9e9");
          g.addColorStop(1, "#3c3c3c");
          ctx.fillStyle = g;
          ctx.fillRect(x, 0, w / n + 1, h);
        }
      },
      { srgb: false, repeat: [2, 1], anisotropy: 8 }
    );

    // Roughness map for chrome: faint polish streaks + handling smudges.
    const chromeRough = makeCanvasTexture(
      512,
      512,
      (ctx, w, h) => {
        ctx.fillStyle = "#1c1c1c";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 260; i++) {
          ctx.strokeStyle = Math.random() > 0.5 ? "#2c2c2c" : "#151515";
          ctx.globalAlpha = 0.2 + Math.random() * 0.35;
          ctx.lineWidth = 0.5 + Math.random() * 1.6;
          const x = Math.random() * w;
          const y = Math.random() * h;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(
            x + (Math.random() - 0.5) * 60,
            y + 30 + Math.random() * 130
          );
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        for (let i = 0; i < 14; i++) {
          const x = Math.random() * w;
          const y = Math.random() * h;
          const r = 12 + Math.random() * 30;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, "rgba(74, 74, 74, 0.4)");
          g.addColorStop(1, "rgba(28, 28, 28, 0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
      },
      { srgb: false, anisotropy: 8 }
    );

    // Diagonal crosshatch bump for the fabric-braided cord.
    const braid = makeCanvasTexture(
      128,
      128,
      (ctx, w, h) => {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, w, h);
        ctx.lineWidth = 3.5;
        for (let k = -1; k <= 9; k++) {
          ctx.strokeStyle = "#b2b2b2";
          ctx.beginPath();
          ctx.moveTo(k * 16, 0);
          ctx.lineTo(k * 16 + h, h);
          ctx.stroke();
          ctx.strokeStyle = "#4e4e4e";
          ctx.beginPath();
          ctx.moveTo(k * 16 + 8, 0);
          ctx.lineTo(k * 16 + 8 - h, h);
          ctx.stroke();
        }
      },
      { srgb: false, repeat: [40, 2], anisotropy: 8 }
    );

    return { knurl, chromeRough, braid };
  }, []);

  const chrome = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f4f4f1",
        metalness: 1,
        roughness: 1,
        roughnessMap: maps.chromeRough,
        envMapIntensity: 1.1
      }),
    [maps]
  );

  const domeChrome = useMemo(() => {
    const m = chrome.clone();
    m.envMapIntensity = 1.25;
    return m;
  }, [chrome]);

  const knurlChrome = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#eceae6",
        metalness: 1,
        roughness: 0.3,
        bumpMap: maps.knurl,
        bumpScale: 0.0005,
        envMapIntensity: 1.05
      }),
    [maps]
  );

  const steel = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c9c5bc",
        metalness: 0.9,
        roughness: 0.38
      }),
    []
  );

  const black = useMemo(() => plasticMaterial("#181613", 0.5), []);

  const cableMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#14120f",
        roughness: 0.62,
        metalness: 0.05,
        bumpMap: maps.braid,
        bumpScale: 0.0004
      }),
    [maps]
  );

  // QA: shell must read unlit when off — mid warm gray, emissive does the work.
  const innerShellMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#8b8071",
        emissive: "#ffdcae",
        emissiveIntensity: 0,
        roughness: 0.5,
        metalness: 0.2,
        side: THREE.BackSide
      }),
    []
  );

  const bulbMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#fff4e0",
        emissive: "#ffd9a8",
        emissiveIntensity: 0,
        roughness: 0.3,
        metalness: 0
      }),
    []
  );

  const spotTarget = useMemo(() => new THREE.Object3D(), []);

  // Stable assembly slack so the lamp reads hand-adjusted, not CAD-perfect.
  const pose = useMemo(() => {
    const rnd = (s: number) => (Math.random() - 0.5) * s;
    const domePitch = 0.45 + rnd(0.03);
    const c = Math.cos(domePitch);
    const s = Math.sin(domePitch);
    // Anchor point on the dome's back surface lands on the head joint.
    const qx = -0.03;
    const qy = 0.057;
    const domeX = -(qx * c - qy * s);
    const domeY = -(qx * s + qy * c);
    const stemLen = Math.hypot(domeX, domeY);
    return {
      baseYaw: rnd(0.05),
      headYaw: -0.16 + rnd(0.04),
      headRoll: rnd(0.02),
      domePitch,
      domeX,
      domeY,
      stemRot: Math.atan2(-domeX, domeY),
      stemPos: [
        (domeX / stemLen) * 0.008,
        (domeY / stemLen) * 0.008,
        0
      ] as [number, number, number],
      setScrewYaw: 0.7 + rnd(0.4),
      strutTwist: rnd(0.015)
    };
  }, []);

  const geo = useMemo(() => {
    // Weighted base: wide disc, rounded shoulders, stepped boss, post collar.
    const base = (() => {
      const p: THREE.Vector2[] = [];
      pushPt(p, 0.0545, 0);
      pushArc(p, 0.0688, 0.003, 0.0032, -Math.PI / 2, 0, 6);
      pushPt(p, BASE_R, 0.0088);
      pushArc(p, 0.0682, 0.0088, 0.0038, 0, Math.PI / 2, 8);
      pushPt(p, 0.056, 0.0126);
      pushArc(p, 0.056, 0.0158, 0.0032, -Math.PI / 2, -Math.PI, 6);
      pushPt(p, 0.0521, 0.025);
      pushArc(p, 0.0466, 0.0252, 0.005, 0.07, Math.PI / 2, 8);
      pushPt(p, 0.0112, 0.0302);
      pushArc(p, 0.0112, 0.0322, 0.002, -Math.PI / 2, -Math.PI, 4);
      pushPt(p, 0.0086, 0.0335);
      pushPt(p, 0.0064, BASE_TOP);
      return new THREE.LatheGeometry(p, 96);
    })();

    // Knurled clamp wheel: filleted rim, soft-domed cap with center nub.
    const wheel = (() => {
      const p: THREE.Vector2[] = [];
      pushPt(p, 0.0026, 0);
      pushPt(p, 0.0074, 0);
      pushArc(p, 0.0074, 0.0012, 0.0012, -Math.PI / 2, 0, 4);
      pushPt(p, 0.0086, 0.0046);
      pushArc(p, 0.007, 0.0046, 0.0016, 0, Math.PI / 2, 6);
      pushPt(p, 0.004, 0.0064);
      pushPt(p, 0.0026, 0.007);
      pushPt(p, 0.001, 0.0074);
      pushPt(p, 0, 0.0074);
      return new THREE.LatheGeometry(p, 48);
    })();

    // Shade: rolled rim lip then a smooth half-teardrop dome.
    const domeOuter = (() => {
      const p: THREE.Vector2[] = [];
      pushPt(p, 0.0607, 0.002);
      pushArc(p, 0.0625, 0.002, 0.0018, Math.PI, Math.PI * 2, 10);
      const body = smooth(
        [
          [0.0643, 0.002],
          [0.0654, 0.0058],
          [0.0646, 0.0112],
          [0.0628, 0.019],
          [0.0596, 0.0272],
          [0.0548, 0.036],
          [0.0482, 0.0448],
          [0.0398, 0.0524],
          [0.03, 0.0582],
          [0.0196, 0.0622],
          [0.0095, 0.0645],
          [0.0022, 0.0654]
        ],
        40
      );
      body.forEach((v) => pushPt(p, v.x, v.y));
      return new THREE.LatheGeometry(p, 96);
    })();

    const domeInner = (() => {
      const p = smooth(
        [
          [0.0607, 0.0022],
          [0.0601, 0.009],
          [0.0582, 0.018],
          [0.0549, 0.0268],
          [0.05, 0.0352],
          [0.0434, 0.0432],
          [0.035, 0.05],
          [0.0252, 0.0552],
          [0.015, 0.0588],
          [0.0052, 0.0608],
          [0.0008, 0.0613]
        ],
        36
      );
      return new THREE.LatheGeometry(p, 96);
    })();

    const capNut = (() => {
      const p: THREE.Vector2[] = [];
      pushPt(p, 0.0024, 0);
      pushPt(p, 0.004, 0);
      pushArc(p, 0.004, 0.001, 0.001, -Math.PI / 2, 0, 4);
      pushPt(p, 0.005, 0.0028);
      pushArc(p, 0, 0.0028, 0.005, 0, Math.PI / 2, 8);
      return new THREE.LatheGeometry(p, 32);
    })();

    // The Forså signature: a stretched coil between hooked anchor pins,
    // built as one wire — lower hook, helix, upper hook.
    const spring = (() => {
      const pts: THREE.Vector3[] = [];
      const coilR = 0.006;
      const loopR = 0.0048;
      for (let i = 0; i <= 10; i++) {
        const a = THREE.MathUtils.degToRad(120 + 226 * (i / 10));
        pts.push(
          new THREE.Vector3(
            Math.cos(a) * loopR,
            PIN_LO + Math.sin(a) * loopR,
            0
          )
        );
      }
      pts.push(new THREE.Vector3(0.0054, PIN_LO + 0.0078, 0.0016));
      const c0 = 0.0615;
      const c1 = 0.1875;
      const turns = 9;
      const n = turns * 18;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = t * turns * Math.PI * 2;
        pts.push(
          new THREE.Vector3(
            Math.cos(a) * coilR,
            c0 + (c1 - c0) * t,
            Math.sin(a) * coilR
          )
        );
      }
      pts.push(new THREE.Vector3(0.0054, PIN_HI - 0.0078, 0.0016));
      for (let i = 0; i <= 10; i++) {
        const a = THREE.MathUtils.degToRad(-64 + 226 * (i / 10));
        pts.push(
          new THREE.Vector3(
            Math.cos(a) * loopR,
            PIN_HI + Math.sin(a) * loopR,
            0
          )
        );
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      return {
        geometry: new THREE.TubeGeometry(curve, 480, 0.00165, 8, false),
        start: pts[0].clone(),
        end: pts[pts.length - 1].clone()
      };
    })();

    // Cord drapes off the base rear and curls toward the desk front edge.
    const cable = (() => {
      const pts = [
        new THREE.Vector3(-0.066, 0.005, 0),
        new THREE.Vector3(-0.085, 0.003, 0.02),
        new THREE.Vector3(-0.08, 0.0022, 0.075),
        new THREE.Vector3(-0.048, 0.0022, 0.13),
        new THREE.Vector3(-0.005, 0.0022, 0.168),
        new THREE.Vector3(0.03, 0.0024, 0.178)
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      const end = pts[pts.length - 1];
      const dir = end.clone().sub(pts[pts.length - 2]).setY(0).normalize();
      const plugPos = end.clone().add(dir.clone().multiplyScalar(0.014));
      plugPos.y = 0.0066;
      return {
        geometry: new THREE.TubeGeometry(curve, 96, 0.0021, 10, false),
        plugPos,
        plugYaw: Math.atan2(-dir.z, dir.x)
      };
    })();

    return {
      base,
      wheel,
      domeOuter,
      domeInner,
      capNut,
      spring,
      cable,
      knuckleHinge: knuckleGeometry(0.0105, 0.018),
      knuckleElbow: knuckleGeometry(0.0115, 0.018),
      knuckleHead: knuckleGeometry(0.0068, 0.0145)
    };
  }, []);

  useFrame((_, delta) => {
    const mix = mixRef.current;
    if (spotRef.current) {
      spotRef.current.intensity = THREE.MathUtils.lerp(0, 7, mix);
    }
    bulbMat.emissiveIntensity = THREE.MathUtils.lerp(0, 3, mix);
    innerShellMat.emissiveIntensity = THREE.MathUtils.lerp(0, 1.4, mix);

    nudgeRef.current = THREE.MathUtils.damp(nudgeRef.current, 0, 5, delta);
    if (headRef.current) {
      headRef.current.rotation.z = -0.06 * nudgeRef.current;
    }
  });

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
      <mesh geometry={geo.base} material={chrome} castShadow receiveShadow />

      {/* Knurled set-screw on the boss flank. */}
      <group position={[0, 0.0205, 0]} rotation={[0, pose.setScrewYaw, 0]}>
        <mesh
          position={[0, 0, 0.0535]}
          rotation={[Math.PI / 2, 0, 0]}
          material={steel}
          castShadow
        >
          <cylinderGeometry args={[0.0032, 0.0032, 0.0105, 20]} />
        </mesh>
        <mesh
          geometry={geo.wheel}
          position={[0, 0, 0.0575]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[0.66, 0.8, 0.66]}
          material={knurlChrome}
          castShadow
        />
      </group>

      <mesh
        position={[0, (BASE_TOP + HINGE_Y) / 2 - 0.001, 0]}
        material={chrome}
        castShadow
      >
        <cylinderGeometry
          args={[0.006, 0.0066, HINGE_Y - BASE_TOP + 0.006, 24]}
        />
      </mesh>

      {/* Lower arm: twin struts straddle the hinge knuckle; spring between. */}
      <group position={[0, HINGE_Y, 0]} rotation={[0, 0, -LOWER_TILT]}>
        <mesh
          geometry={geo.knuckleHinge}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, -0.009]}
          material={black}
          castShadow
        />
        <mesh rotation={[Math.PI / 2, 0, 0]} material={steel} castShadow>
          <cylinderGeometry args={[0.003, 0.003, 0.04, 16]} />
        </mesh>
        <mesh
          geometry={geo.wheel}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, 0.0131]}
          material={knurlChrome}
          castShadow
        />
        <mesh
          geometry={geo.wheel}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, -0.0131]}
          material={knurlChrome}
          castShadow
        />

        {[-STRUT_Z, STRUT_Z].map((z, i) => (
          <RoundedBox
            key={z}
            args={[0.009, STRUT_LEN, 0.0034]}
            radius={0.0013}
            smoothness={3}
            position={[0, LOWER_LEN / 2, z]}
            rotation={[0, (i === 0 ? 1 : -1) * pose.strutTwist, 0]}
            material={chrome}
            castShadow
          />
        ))}

        <mesh geometry={geo.spring.geometry} material={steel} castShadow />
        {[geo.spring.start, geo.spring.end].map((p, i) => (
          <mesh key={i} position={p} material={steel}>
            <sphereGeometry args={[0.00168, 10, 8]} />
          </mesh>
        ))}
        {[PIN_LO, PIN_HI].map((y) => (
          <group key={y} position={[0, y, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={steel} castShadow>
              <cylinderGeometry args={[0.0026, 0.0026, 0.0264, 12]} />
            </mesh>
            {[-0.0139, 0.0139].map((z) => (
              <mesh
                key={z}
                position={[0, 0, z]}
                rotation={[Math.PI / 2, 0, 0]}
                material={steel}
                castShadow
              >
                <cylinderGeometry args={[0.0036, 0.0036, 0.0016, 12]} />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* Elbow joint + tapered upper arm. */}
      <group position={[ELBOW_X, ELBOW_Y, 0]}>
        <group rotation={[0, 0, -UPPER_TILT]}>
          <mesh
            position={[0, UPPER_LEN / 2 - 0.002, 0]}
            material={chrome}
            castShadow
          >
            <cylinderGeometry args={[0.0046, 0.0058, UPPER_LEN + 0.006, 24]} />
          </mesh>
        </group>
        <mesh
          geometry={geo.knuckleElbow}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, -0.009]}
          material={black}
          castShadow
        />
        <mesh rotation={[Math.PI / 2, 0, 0]} material={steel} castShadow>
          <cylinderGeometry args={[0.0032, 0.0032, 0.044, 16]} />
        </mesh>
        <mesh
          geometry={geo.wheel}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, 0.0131]}
          scale={[1.1, 1.05, 1.1]}
          material={knurlChrome}
          castShadow
        />
        <mesh
          geometry={geo.wheel}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, -0.0131]}
          scale={[1.1, 1.05, 1.1]}
          material={knurlChrome}
          castShadow
        />
      </group>

      {/* Head: pivot knuckle at the dome's back, chrome shade, bulb inside. */}
      <group
        position={[HEAD_X, HEAD_Y, 0]}
        rotation={[0, pose.headYaw, pose.headRoll]}
      >
        <group ref={headRef}>
          <mesh
            geometry={geo.knuckleHead}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, -0.00725]}
            material={black}
            castShadow
          />
          <mesh
            geometry={geo.wheel}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, 0.0078]}
            scale={[0.74, 0.85, 0.74]}
            material={knurlChrome}
            castShadow
          />
          <mesh
            geometry={geo.wheel}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, -0.0074]}
            scale={[0.5, 0.5, 0.5]}
            material={knurlChrome}
            castShadow
          />
          <mesh
            position={pose.stemPos}
            rotation={[0, 0, pose.stemRot]}
            material={black}
            castShadow
          >
            <cylinderGeometry args={[0.005, 0.005, 0.02, 16]} />
          </mesh>

          <group
            position={[pose.domeX, pose.domeY, 0]}
            rotation={[0, 0, pose.domePitch]}
          >
            <mesh geometry={geo.domeOuter} material={domeChrome} castShadow />
            <mesh geometry={geo.domeInner} material={innerShellMat} />
            <mesh
              geometry={geo.capNut}
              position={[0, 0.064, 0]}
              material={chrome}
              castShadow
            />

            <mesh position={[0, 0.0175, 0]} material={bulbMat}>
              <sphereGeometry args={[0.0142, 32, 24]} />
            </mesh>
            <mesh position={[0, 0.029, 0]} material={bulbMat}>
              <cylinderGeometry args={[0.0068, 0.0096, 0.0095, 20]} />
            </mesh>
            <mesh position={[0, 0.0398, 0]} material={steel}>
              <cylinderGeometry args={[0.0088, 0.0088, 0.0105, 20]} />
            </mesh>
            {[0.0368, 0.0396, 0.0424].map((y) => (
              <mesh
                key={y}
                position={[0, y, 0]}
                rotation={[Math.PI / 2, 0, 0]}
                material={steel}
              >
                <torusGeometry args={[0.0089, 0.0007, 6, 24]} />
              </mesh>
            ))}

            <spotLight
              ref={spotRef}
              position={[0, -0.008, 0]}
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

      <mesh geometry={geo.cable.geometry} material={cableMat} castShadow />
      <mesh
        position={[-0.0745, 0.0055, 0.0005]}
        rotation={[0, 0, 1.67]}
        material={black}
        castShadow
      >
        <cylinderGeometry args={[0.0026, 0.004, 0.0125, 12]} />
      </mesh>

      {/* Molded plug lying flat at the cord's end. */}
      <group position={geo.cable.plugPos} rotation={[0, geo.cable.plugYaw, 0]}>
        <RoundedBox
          args={[0.03, 0.0125, 0.02]}
          radius={0.004}
          smoothness={4}
          material={black}
          castShadow
        />
        {[-0.0095, 0.0095].map((z) => (
          <mesh
            key={z}
            position={[0.0195, 0, z]}
            rotation={[0, 0, Math.PI / 2]}
            material={steel}
            castShadow
          >
            <cylinderGeometry args={[0.0019, 0.0019, 0.011, 12]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
