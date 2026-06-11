"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useDeskTheme } from "../DeskThemeContext";

// Volumetric cone of lamplight with dust motes, for the Forså desk lamp.
// Mounts inside <Placed name="lamp"> next to <DeskLamp /> — everything here
// is in lamp-local space (the scene's placement group handles position/yaw).
//
// The beam is two nested open-cone shells with a custom additive shader:
// no hard silhouette (view-angle fresnel melts the wall when the camera
// grazes it), a length fade so the baked desk pool takes over near the
// surface, and three octaves of drifting value noise so the air feels
// alive. Peak radiance stays below 1.0 — the bloom threshold — because the
// beam is soft air, not a glowing solid; the white-hot core belongs to the
// bulb in DeskLamp. A handful of "hero" motes may kiss 1.0 for an
// occasional twinkle.

// ——— Tuning knobs (orchestrator: adjust these after visual QA) ———
// Outer shell peak radiance. Worst-case stack (outer + core, front + back
// faces, noise crest) is ~(BEAM+CORE)*2*1.2 — keep that sum under ~0.9 so
// the beam never trips the bloom threshold of 1.
export const BEAM_INTENSITY = 0.22;
// Inner bright-core shell (55% radius), gives the beam interior depth.
export const BEAM_CORE_INTENSITY = 0.13;
// Cone aperture at the dome mouth. The shade's inner rim radius is 0.0607;
// stay inside it so the cone emerges from the shade, not through it.
export const BEAM_TOP_RADIUS = 0.04;
// Where the light lands on the desk. The spotlight (angle 0.62, ~0.46 m
// drop) pools at ~0.33 m; the visible bright core reads nearer 0.30.
export const BEAM_POOL_RADIUS = 0.3;
export const BEAM_COLOR = "#ffd9a4";
export const MOTE_COUNT = 150;
export const MOTE_INTENSITY = 1.0;
// Mote sprite size in px at 1 m, before DPR. Sub-millimeter feel.
export const MOTE_SIZE = 5.0;
export const MOTE_COLOR = "#ffe7c6";

// Nominal dome-mouth (spot emitter) position in lamp-local space, reproduced
// from DeskLamp.tsx's head chain: head at [0.29, 0.465], head yaw −0.16,
// dome pitch 0.45 with anchor offset (qx −0.03, qy 0.057), spot 8 mm down
// the dome axis. DeskLamp adds ±0.02 rad of random assembly slack we can't
// observe from here; over 0.46 m that is ~9 mm of drift against a 300 mm
// pool — the beam is far too soft to betray it. What must line up exactly
// does: the pool center is the spotlight's literal target.
const HEAD_POS = new THREE.Vector3(0.3446, 0.4195, 0.0088);
// DeskLamp's spotTarget primitive sits at lamp-local [0.5, 0, 0.12]
// (layout.ts yaws this onto the turntable).
const TARGET_POS = new THREE.Vector3(0.5, 0, 0.12);
// Start the cone tucked up inside the shade so its top rim is never seen.
const HEAD_RECESS = 0.01;
// Stop just above the desk so dissolving fragments never sit coplanar
// with the wood.
const DESK_CLEARANCE = 0.004;

// Deterministic RNG so the dust field is identical every mount.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NO_RAYCAST = () => null;

const BEAM_VERT = /* glsl */ `
  uniform float uHeight;
  varying vec3 vWorldPos;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vT; // 1 at the lamp head, 0 at the desk pool

  void main() {
    vT = position.y / uHeight + 0.5;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mvPos = viewMatrix * worldPos;
    vViewPos = mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const BEAM_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uMix;
  uniform float uIntensity;
  uniform vec3 uColor;
  varying vec3 vWorldPos;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vT;

  float hash3(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash3(i);
    float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
      mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
      u.z
    );
  }

  void main() {
    // Brighter at the head, dissolving to nothing where the baked desk
    // pool takes over. The short smoothstep hides the recessed top rim.
    float down = 1.0 - vT;
    float axial = pow(clamp(vT, 0.0, 1.0), 1.35);
    axial *= smoothstep(0.0, 0.045, down);

    // View-angle fade: the cone wall melts when the camera grazes it, so
    // the shell has no silhouette — this IS the radial softness.
    float ndv = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
    float grazing = smoothstep(0.02, 0.5, ndv);

    // Three octaves of drifting value noise, stretched vertically so the
    // air reads as faint shafts. Barely perceptible — not fog soup.
    vec3 p = vWorldPos * vec3(16.0, 6.0, 16.0)
      + vec3(0.0, -uTime * 0.10, uTime * 0.02);
    float n = vnoise(p) * 0.55
      + vnoise(p * 2.6 + vec3(uTime * 0.06, 0.0, -uTime * 0.04)) * 0.30
      + vnoise(p * 5.1 + vec3(-uTime * 0.03, uTime * 0.05, 0.0)) * 0.15;
    float vol = 1.0 + (n - 0.5) * 0.4;

    float radiance = uIntensity * uMix * axial * grazing * vol;
    if (radiance < 0.001) discard;
    gl_FragColor = vec4(uColor * radiance, 1.0);
  }
`;

const MOTE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uMix;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform vec3 uStart;
  uniform vec3 uAxis;
  uniform vec3 uSide;
  uniform vec3 uUp;
  uniform float uLength;
  uniform float uTopR;
  uniform float uPoolR;
  attribute vec4 aSeed; // x: radial, y: angle, z: phase, w: everything else
  varying float vBright;

  void main() {
    float misc = aSeed.w;

    // Slow rise toward the lamp head (t: 0 = head, 1 = pool; decreasing),
    // wrapping around inside the cone. 25–45 s per traverse.
    float speed = 0.010 + 0.022 * fract(misc * 7.31);
    float t = fract(aSeed.z - uTime * speed);

    // Lazy swirl: per-mote direction and rate, plus a sinusoidal sway.
    float dir = fract(misc * 13.7) > 0.5 ? 1.0 : -1.0;
    float swirl = uTime * (0.04 + 0.09 * fract(misc * 3.7)) * dir;
    float ang = aSeed.y * 6.2831853 + swirl
      + 0.4 * sin(uTime * 0.23 + aSeed.z * 6.2831853);
    float rFrac = aSeed.x * (0.86 + 0.10 * sin(uTime * 0.17 + misc * 6.2831853));
    float radius = mix(uTopR, uPoolR, t) * rFrac;

    vec3 p = uStart + uAxis * (t * uLength)
      + (uSide * cos(ang) + uUp * sin(ang)) * radius;

    vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float sizeJitter = 0.7 + 0.8 * fract(misc * 5.13);
    gl_PointSize = min(
      uSize * uPixelRatio * sizeJitter / max(-mvPos.z, 0.05),
      14.0 * uPixelRatio
    );

    // Motes only sparkle where the light is: near the axis, away from the
    // wrap seams at either end of the cone.
    float axisGlow = 1.0 - smoothstep(0.1, 1.0, rFrac);
    float endFade = smoothstep(0.0, 0.10, t) * (1.0 - smoothstep(0.80, 1.0, t));
    float tw = 0.45 + 0.75 * (0.5 + 0.5 * sin(
      uTime * (0.9 + fract(misc * 9.7) * 0.9) + misc * 80.0));

    // ~4 hero motes may just kiss radiance 1.0 at their twinkle crest for
    // an occasional bloom glint; the rest stay well below threshold.
    float hero = step(0.975, misc);
    vBright = uMix * endFade
      * mix((0.16 + 0.42 * axisGlow) * (0.6 + 0.4 * tw), 0.95 * tw, hero);
  }
`;

const MOTE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vBright;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float falloff = 1.0 - smoothstep(0.0, 0.25, r2);
    falloff *= falloff;
    float radiance = vBright * uIntensity * falloff;
    if (radiance < 0.002) discard;
    gl_FragColor = vec4(uColor * radiance, 1.0);
  }
`;

export default function LampBeam() {
  const { mixRef } = useDeskTheme();
  const groupRef = useRef<THREE.Group>(null);

  const beam = useMemo(() => {
    const axis = TARGET_POS.clone().sub(HEAD_POS);
    const dist = axis.length();
    axis.normalize();
    const length = dist + HEAD_RECESS - DESK_CLEARANCE;
    const start = HEAD_POS.clone().addScaledVector(axis, -HEAD_RECESS);
    const mid = start.clone().addScaledVector(axis, length / 2);
    // Cylinder +y (the small radius) points back up at the lamp head.
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      axis.clone().negate()
    );
    const geometry = new THREE.CylinderGeometry(
      BEAM_TOP_RADIUS,
      BEAM_POOL_RADIUS,
      length,
      72,
      1,
      true
    );
    // Hex colors are sRGB; the shader writes straight into the linear HDR
    // buffer, so convert once here or the final encode washes the warmth.
    const color = new THREE.Color(BEAM_COLOR).convertSRGBToLinear();
    const makeMaterial = (intensity: number) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uMix: { value: 0 },
          uIntensity: { value: intensity },
          uColor: { value: color },
          uHeight: { value: length }
        },
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
    return {
      geometry,
      mid,
      quaternion,
      length,
      axis,
      start,
      outerMat: makeMaterial(BEAM_INTENSITY),
      coreMat: makeMaterial(BEAM_CORE_INTENSITY)
    };
  }, []);

  const motes = useMemo(() => {
    // Orthonormal frame across the beam for the vertex-shader cone math.
    const side = new THREE.Vector3().crossVectors(
      beam.axis,
      new THREE.Vector3(0, 1, 0)
    );
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const up = new THREE.Vector3().crossVectors(side, beam.axis).normalize();

    const rand = mulberry32(0x4f525341); // "ORSA"
    const positions = new Float32Array(MOTE_COUNT * 3); // computed in-shader
    const seeds = new Float32Array(MOTE_COUNT * 4);
    for (let i = 0; i < MOTE_COUNT; i++) {
      seeds[i * 4 + 0] = Math.pow(rand(), 0.8); // bias toward the bright axis
      seeds[i * 4 + 1] = rand();
      seeds[i * 4 + 2] = rand();
      seeds[i * 4 + 3] = rand();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    // Positions live in the shader, so hand three a real bounding sphere.
    geometry.boundingSphere = new THREE.Sphere(beam.mid.clone(), beam.length);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMix: { value: 0 },
        uPixelRatio: { value: 1 },
        uSize: { value: MOTE_SIZE },
        uIntensity: { value: MOTE_INTENSITY },
        uColor: { value: new THREE.Color(MOTE_COLOR).convertSRGBToLinear() },
        // Keep the dust tucked inside the visible beam.
        uStart: { value: beam.start.clone().addScaledVector(beam.axis, 0.03) },
        uAxis: { value: beam.axis.clone() },
        uSide: { value: side },
        uUp: { value: up },
        uLength: { value: beam.length - 0.05 },
        uTopR: { value: BEAM_TOP_RADIUS * 0.9 },
        uPoolR: { value: BEAM_POOL_RADIUS * 0.92 }
      },
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    });
    return { geometry, material };
  }, [beam]);

  useFrame((state) => {
    const mix = mixRef.current;
    // ^1.6 easing keeps the beam fully gone in dark mode — no night ghost.
    const eased = Math.pow(Math.max(mix, 0), 1.6);
    const t = state.clock.getElapsedTime();
    beam.outerMat.uniforms.uTime.value = t;
    beam.coreMat.uniforms.uTime.value = t;
    motes.material.uniforms.uTime.value = t;
    beam.outerMat.uniforms.uMix.value = eased;
    beam.coreMat.uniforms.uMix.value = eased;
    motes.material.uniforms.uMix.value = eased;
    motes.material.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    if (groupRef.current) {
      groupRef.current.visible = eased > 0.004;
    }
  });

  // raycast={NO_RAYCAST} everywhere: the beam crosses the turntable's click
  // zone and sits over the lamp (the theme toggle) — light must never
  // intercept a pointer.
  return (
    <group ref={groupRef}>
      <mesh
        geometry={beam.geometry}
        material={beam.outerMat}
        position={beam.mid}
        quaternion={beam.quaternion}
        raycast={NO_RAYCAST}
        renderOrder={10}
        frustumCulled={false}
      />
      <mesh
        geometry={beam.geometry}
        material={beam.coreMat}
        position={beam.mid}
        quaternion={beam.quaternion}
        scale={[0.55, 1, 0.55]}
        raycast={NO_RAYCAST}
        renderOrder={10}
        frustumCulled={false}
      />
      <points
        geometry={motes.geometry}
        material={motes.material}
        raycast={NO_RAYCAST}
        renderOrder={11}
        frustumCulled={false}
      />
    </group>
  );
}
