"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { lampGlowRef } from "./DeskLamp";

// Volumetric cone of lamplight with dust motes, for the Forså desk lamp.
// Mounts inside <Placed name="lamp"> next to <DeskLamp /> — everything here
// is in lamp-local space (the scene's placement group handles position/yaw).
//
// The beam has NO surfaces. Jason's note — "the boundaries of the light
// look linear… a clear delineation of where the light is and isn't. looks
// very 2d" — is exactly what shading a cone SHELL produces: any surface has
// a silhouette, and a silhouette is an edge. Instead, an oversized bounding
// cone (its shape never visible) runs a fragment shader that computes, per
// pixel, the viewing ray's closest approach to the beam AXIS and shades a
// gaussian density falloff around it. The visible beam emerges purely from
// that falloff — light fades in every direction with no boundary anywhere,
// brightens when a ray travels a longer chord through the cone, and drifts
// with three octaves of value noise. Peak radiance stays below 1.0 (the
// bloom threshold); the white-hot core belongs to the bulb in DeskLamp.

// ——— Tuning knobs (orchestrator: adjust these after visual QA) ———
// Peak radiance scale of the gaussian density (single evaluation per pixel
// now — no shell stacking). Typical views land ~0.5-0.7 of this.
export const BEAM_INTENSITY = 1.0;
// Gaussian sharpness: density = exp(-FALLOFF * (d/R)^2). Lower = mistier
// and wider tails; higher = tighter, more defined core (never an edge).
export const BEAM_FALLOFF = 1.8;
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
  varying vec3 vWorld;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorld = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const BEAM_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uIntensity;
  uniform float uFalloff;
  uniform vec3 uColor;
  uniform vec3 uStartW;  // beam origin (lamp head), world space
  uniform vec3 uDirW;    // unit axis head -> pool, world space
  uniform float uLen;
  uniform float uR0;     // beam radius at the head
  uniform float uR1;     // beam radius at the pool
  varying vec3 vWorld;

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
    // Closest approach between the viewing ray and the beam axis. The
    // bounding mesh only decides WHICH pixels run this shader — the look
    // comes entirely from the falloff functions below, so no geometric
    // edge can ever show.
    vec3 v = normalize(vWorld - cameraPosition);
    vec3 w0 = cameraPosition - uStartW;
    float b = dot(v, uDirW);
    float dov = dot(w0, v);
    float dou = dot(w0, uDirW);
    float denom = max(1.0 - b * b, 4e-3);
    // Closest-approach parameter along the beam axis. The old hard clamp at
    // uLen FROZE pAxis at the pool's far point, which broke the radial-falloff
    // slope along the line s_unclamped = uLen — read as a hard diagonal crease
    // where the pool met the desk. Letting s run past uLen keeps pAxis (and so
    // d, and the gaussian) tracking smoothly straight through, so the pool
    // melts outward with no crease. The axial envelope below fades the beam
    // out by sn ~1.15 and the desk occludes anything lower, so the extra
    // reach never shows as light through the wood.
    float s = clamp((dou - b * dov) / denom, 0.0, uLen * 1.6);
    vec3 pAxis = uStartW + uDirW * s;
    float t = max(dot(pAxis - cameraPosition, v), 0.0);
    vec3 pRay = cameraPosition + v * t;
    float d = length(pRay - pAxis);

    float sn = s / uLen;
    float R = mix(uR0, uR1, sn);

    // Gaussian radial density — light that fades in every direction,
    // never stops. Clamped-s ends fade the same way (d grows past the
    // caps), so even the cone's ends are boundary-free.
    float radial = exp(-uFalloff * (d * d) / (R * R));

    // Rays sighting down the cone cross more lit air than rays cutting
    // across it; thinner sections near the head carry shorter chords.
    float path = min((0.35 + 0.65 * R / uR1) * inversesqrt(denom), 1.8);

    // Axial envelope: born just inside the shade, brighter near the
    // source (real beams are), carrying almost to the desk before the
    // pool's own light takes over.
    float axial = smoothstep(0.0, 0.10, sn)
      * (1.0 - smoothstep(0.75, 1.15, sn))
      * mix(1.25, 0.85, sn);

    // Three octaves of drifting value noise sampled at the lit point so
    // the air shifts in 3D — faint shafts, not fog soup.
    vec3 np = pRay * vec3(9.0, 5.0, 9.0)
      + vec3(0.0, -uTime * 0.10, uTime * 0.02);
    float n = vnoise(np) * 0.55
      + vnoise(np * 2.6 + vec3(uTime * 0.06, 0.0, -uTime * 0.04)) * 0.30
      + vnoise(np * 5.1 + vec3(-uTime * 0.03, uTime * 0.05, 0.0)) * 0.15;
    float vol = 1.0 + (n - 0.5) * 0.5;

    float radiance = uIntensity * uGlow * radial * path * axial * vol;
    if (radiance < 0.0015) discard;
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
    // BOUNDING volume, never visible itself: oversized so the gaussian
    // tails (exp(-FALLOFF * (d/R)^2) ~ 0.002 at d = 1.7R) die out well
    // inside it. Closed caps so every ray entering the volume finds a
    // front face — an open mouth would punch a see-through hole at
    // down-the-cone view angles. FrontSide only: with additive blending,
    // DoubleSide would double-shade wherever no occluder culls the back
    // face and show object-shaped seams where one does.
    const geometry = new THREE.CylinderGeometry(
      BEAM_TOP_RADIUS * 2.6,
      BEAM_POOL_RADIUS * 1.8,
      length * 1.06,
      48,
      1,
      false
    );
    // Hex colors are sRGB; the shader writes straight into the linear HDR
    // buffer, so convert once here or the final encode washes the warmth.
    const color = new THREE.Color(BEAM_COLOR).convertSRGBToLinear();
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uGlow: { value: 0 },
        uIntensity: { value: BEAM_INTENSITY },
        uFalloff: { value: BEAM_FALLOFF },
        uColor: { value: color },
        uStartW: { value: new THREE.Vector3() },
        uDirW: { value: new THREE.Vector3(0, -1, 0) },
        uLen: { value: length },
        uR0: { value: BEAM_TOP_RADIUS },
        uR1: { value: BEAM_POOL_RADIUS }
      },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide
    });
    return {
      geometry,
      mid,
      quaternion,
      length,
      axis,
      start,
      end: start.clone().addScaledVector(axis, length),
      material
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

  // Scratch vectors for the per-frame local -> world axis transform.
  const scratch = useMemo(
    () => ({ start: new THREE.Vector3(), end: new THREE.Vector3() }),
    []
  );

  useFrame((state) => {
    // lampGlowRef is theme mix x filament warm-up (written by DeskLamp every
    // frame), so the beam stumbles alight in sympathy with the bulb.
    // ^1.6 easing keeps the beam fully gone in dark mode — no night ghost.
    const eased = Math.pow(Math.max(lampGlowRef.current, 0), 1.6);
    const t = state.clock.getElapsedTime();
    beam.material.uniforms.uTime.value = t;
    beam.material.uniforms.uGlow.value = eased;
    motes.material.uniforms.uTime.value = t;
    motes.material.uniforms.uMix.value = eased;
    motes.material.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    const group = groupRef.current;
    if (group) {
      group.visible = eased > 0.004;
      // The fragment math runs in world space (cameraPosition is world):
      // push the lamp-local axis through the placement transform each
      // frame. The lamp is static, but this is two matrix multiplies.
      scratch.start.copy(beam.start).applyMatrix4(group.matrixWorld);
      scratch.end.copy(beam.end).applyMatrix4(group.matrixWorld);
      (beam.material.uniforms.uStartW.value as THREE.Vector3).copy(
        scratch.start
      );
      (beam.material.uniforms.uDirW.value as THREE.Vector3)
        .copy(scratch.end)
        .sub(scratch.start)
        .normalize();
      beam.material.uniforms.uLen.value = scratch.end.distanceTo(
        scratch.start
      );
    }
  });

  // raycast={NO_RAYCAST} everywhere: the beam crosses the turntable's click
  // zone and sits over the lamp (the theme toggle) — light must never
  // intercept a pointer.
  return (
    <group ref={groupRef}>
      <mesh
        geometry={beam.geometry}
        material={beam.material}
        position={beam.mid}
        quaternion={beam.quaternion}
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
