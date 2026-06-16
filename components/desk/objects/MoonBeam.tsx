"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Volumetric shaft of MOONLIGHT — the dark-theme analogue of LampBeam.
//
// Jason's words: "It's like a stream going down through the window and along
// the desk." Where the lamp beam is a tight, warm spotlight cone, this is a
// broad, COOL, misty god-ray: moonlight pouring through the window opening,
// slanting from high-and-back down to the desk where it pools.
//
// Same edgeless trick as LampBeam — there are NO surfaces. An oversized,
// invisible bounding cone runs a fragment shader that, per pixel, finds the
// viewing ray's closest approach to the beam AXIS and shades a gaussian
// density falloff around it. The visible shaft emerges purely from that
// falloff: light fades in every direction with no boundary anywhere. Additive
// blending, drifting value-noise so the air shifts, and a sparse cool
// dust-mote cloud.
//
// Key departures from LampBeam:
//   • Cool moonlight blue (#a9c4f2), sRGB->linear in-shader.
//   • WIDER radius + LOWER gaussian falloff -> a gentle diffuse wash, not a
//     hard cone. A broad cone approximates the rectangular window shaft.
//   • Lower peak radiance — stays well under the 1.0 bloom threshold so it
//     glows softly and never blows out.
//   • Fewer, dimmer, slower motes — moonlight dust is faint.
//
// Unlike LampBeam (which lives in lamp-LOCAL space inside a placement group),
// MoonBeam lives directly in WORLD space. The `start`/`end` props are
// world-space positions and the shader's world-space ray math uses them as
// given — no parent transform.

// ——— Tuning knobs (orchestrator: adjust after visual QA) ———
// Peak radiance scale of the gaussian density. Deliberately well under the
// 1.0 bloom threshold — moonlight is a soft wash, not a hot spotlight. Pulled
// down from 0.85: Jason flagged the dark theme as "too much" moonlight, so the
// shaft now reads as a subtle stream, not a flood. Then 0.5 -> 0.38 so dark
// mode is unmistakably dimmer than light mode (Jason wanted a clearer gap).
// Then 0.38 -> 0.18: Jason wanted the night "quite a lot" darker — the shaft is
// now a faint moonlit hint, not a stream you read by.
export const MOON_INTENSITY = 0.18;
// Gaussian sharpness: density = exp(-FALLOFF * (d/R)^2). Between the lamp's
// tight 1.8 and a pure haze — enough definition to read as a STREAM through
// the window, not just ambient fog. Nudged up from 1.35 to tighten the tails
// so the shaft streams rather than washes across the desk.
export const MOON_FALLOFF = 1.55;
// Shaft radii — broad, since moonlight floods a window opening rather than
// stabbing through a lamp shade. Defaults; overridable via props.
export const MOON_TOP_RADIUS = 0.42;
export const MOON_POOL_RADIUS = 0.55;
// Cool moonlight blue. Converted sRGB->linear before it hits the HDR buffer.
export const MOON_COLOR = "#a9c4f2";
// Sparse, faint dust — fewer than the lamp's 150.
export const MOON_MOTE_COUNT = 60;
// Pulled down from 0.45 — faint glints, not a sparkle field. Held at 0.28
// (Jason: "keep the motes up") even as the fill around them came down.
export const MOON_MOTE_INTENSITY = 0.28;
// Mote sprite size in px at 1 m, before DPR.
export const MOON_MOTE_SIZE = 4.0;
export const MOON_MOTE_COLOR = "#c6d8f6";

// Gate intensity on the dark theme. The scene sets this to the INVERSE theme
// mix each frame (0 = day/off, 1 = night/full), mirroring lampGlowRef.
export const moonGlowRef = { current: 0 };

const NO_RAYCAST = () => null;

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
  uniform vec3 uStartW;  // shaft origin (window opening), world space
  uniform vec3 uDirW;    // unit axis window -> desk pool, world space
  uniform float uLen;
  uniform float uR0;     // shaft radius at the window
  uniform float uR1;     // shaft radius at the desk pool
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
    // Closest approach between the viewing ray and the shaft axis. The
    // bounding mesh only decides WHICH pixels run this shader — the look comes
    // entirely from the falloff below, so no geometric edge can ever show.
    vec3 v = normalize(vWorld - cameraPosition);
    vec3 w0 = cameraPosition - uStartW;
    float b = dot(v, uDirW);
    float dov = dot(w0, v);
    float dou = dot(w0, uDirW);
    float denom = max(1.0 - b * b, 4e-3);
    float s = clamp((dou - b * dov) / denom, 0.0, uLen);
    vec3 pAxis = uStartW + uDirW * s;
    float t = max(dot(pAxis - cameraPosition, v), 0.0);
    vec3 pRay = cameraPosition + v * t;
    float d = length(pRay - pAxis);

    float sn = s / uLen;
    float R = mix(uR0, uR1, sn);

    // Gaussian radial density — soft moonlight that fades in every direction
    // with no boundary. The low uFalloff gives broad, misty tails.
    float radial = exp(-uFalloff * (d * d) / (R * R));

    // Rays sighting down the shaft cross more lit air than rays cutting across
    // it. Gentler than the lamp's path term — a broad shaft shouldn't streak.
    float path = min((0.5 + 0.5 * R / uR1) * inversesqrt(denom), 1.5);

    // Axial envelope: brightest as it enters from the window, carrying down to
    // the desk before the pool's own light takes over. Softer ramps than the
    // lamp so the whole shaft reads evenly lit, like a window cast.
    float axial = smoothstep(0.0, 0.14, sn)
      * (1.0 - smoothstep(0.78, 1.18, sn))
      * mix(1.12, 0.9, sn);

    // Three octaves of slow drifting value noise — gives the shaft faint
    // internal striations (the "stream" texture) without becoming fog soup.
    // Slower drift than the lamp; moonlit air barely moves.
    vec3 np = pRay * vec3(5.0, 3.2, 5.0)
      + vec3(0.0, -uTime * 0.05, uTime * 0.012);
    float n = vnoise(np) * 0.55
      + vnoise(np * 2.4 + vec3(uTime * 0.03, 0.0, -uTime * 0.02)) * 0.30
      + vnoise(np * 4.6 + vec3(-uTime * 0.015, uTime * 0.025, 0.0)) * 0.15;
    float vol = 1.0 + (n - 0.5) * 0.45;

    float radiance = uIntensity * uGlow * radial * path * axial * vol;
    if (radiance < 0.0012) discard;
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

    // Slow drift down the shaft toward the desk (t: 0 = window, 1 = pool),
    // wrapping. Slower than the lamp's motes — moonlit dust hangs in the air.
    float speed = 0.006 + 0.012 * fract(misc * 7.31);
    float t = fract(aSeed.z + uTime * speed);

    // Lazy sway, no tight swirl — broad shaft, gentle air.
    float dir = fract(misc * 13.7) > 0.5 ? 1.0 : -1.0;
    float swirl = uTime * (0.015 + 0.04 * fract(misc * 3.7)) * dir;
    float ang = aSeed.y * 6.2831853 + swirl
      + 0.5 * sin(uTime * 0.13 + aSeed.z * 6.2831853);
    float rFrac = aSeed.x * (0.9 + 0.1 * sin(uTime * 0.09 + misc * 6.2831853));
    float radius = mix(uTopR, uPoolR, t) * rFrac;

    vec3 p = uStart + uAxis * (t * uLength)
      + (uSide * cos(ang) + uUp * sin(ang)) * radius;

    vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float sizeJitter = 0.7 + 0.7 * fract(misc * 5.13);
    gl_PointSize = min(
      uSize * uPixelRatio * sizeJitter / max(-mvPos.z, 0.05),
      11.0 * uPixelRatio
    );

    // Motes glint where the light is: away from the shaft's far edge, away
    // from the wrap seams at either end. Dimmer + gentler than the lamp.
    float axisGlow = 1.0 - smoothstep(0.2, 1.0, rFrac);
    float endFade = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.82, 1.0, t));
    float tw = 0.5 + 0.6 * (0.5 + 0.5 * sin(
      uTime * (0.5 + fract(misc * 9.7) * 0.7) + misc * 80.0));

    vBright = uMix * endFade
      * (0.12 + 0.30 * axisGlow) * (0.55 + 0.45 * tw);
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
    if (radiance < 0.0015) discard;
    gl_FragColor = vec4(uColor * radiance, 1.0);
  }
`;

type MoonBeamProps = {
  /** World-space point where the shaft enters the room (the window opening). */
  start: [number, number, number];
  /** World-space point where the shaft lands on the desk. */
  end: [number, number, number];
  /** Shaft radius at the window mouth (meters). */
  topRadius?: number;
  /** Shaft radius at the desk pool (meters). */
  poolRadius?: number;
  /** Moonlight color (sRGB hex); converted to linear in-shader. */
  color?: string;
};

export default function MoonBeam({
  start,
  end,
  topRadius = MOON_TOP_RADIUS,
  poolRadius = MOON_POOL_RADIUS,
  color = MOON_COLOR
}: MoonBeamProps) {
  const groupRef = useRef<THREE.Group>(null);

  const beam = useMemo(() => {
    const startV = new THREE.Vector3(...start);
    const endV = new THREE.Vector3(...end);
    const axis = endV.clone().sub(startV);
    const length = Math.max(axis.length(), 1e-4);
    axis.normalize();
    const mid = startV.clone().addScaledVector(axis, length / 2);
    // Cylinder +y (the small radius) points back up toward the window.
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      axis.clone().negate()
    );
    // BOUNDING volume, never visible itself: oversized so the gaussian tails
    // die out well inside it (broad falloff -> generous multipliers). Closed
    // caps so every entering ray finds a front face. FrontSide only: with
    // additive blending DoubleSide would double-shade and show seams.
    const geometry = new THREE.CylinderGeometry(
      topRadius * 2.4,
      poolRadius * 1.7,
      length * 1.08,
      48,
      1,
      false
    );
    // Hex is sRGB; the shader writes straight into the linear HDR buffer, so
    // convert once here or the final encode washes the cool tone.
    const linearColor = new THREE.Color(color).convertSRGBToLinear();
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uGlow: { value: 0 },
        uIntensity: { value: MOON_INTENSITY },
        uFalloff: { value: MOON_FALLOFF },
        uColor: { value: linearColor },
        uStartW: { value: startV.clone() },
        uDirW: { value: axis.clone() },
        uLen: { value: length },
        uR0: { value: topRadius },
        uR1: { value: poolRadius }
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
      material,
      mid,
      quaternion,
      length,
      axis,
      start: startV,
      end: endV
    };
  }, [start, end, topRadius, poolRadius, color]);

  const motes = useMemo(() => {
    // Orthonormal frame across the shaft for the vertex-shader cone math.
    const side = new THREE.Vector3().crossVectors(
      beam.axis,
      new THREE.Vector3(0, 1, 0)
    );
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const up = new THREE.Vector3().crossVectors(side, beam.axis).normalize();

    const rand = mulberry32(0x4d4f4f4e); // "MOON"
    const positions = new Float32Array(MOON_MOTE_COUNT * 3); // computed in-shader
    const seeds = new Float32Array(MOON_MOTE_COUNT * 4);
    for (let i = 0; i < MOON_MOTE_COUNT; i++) {
      seeds[i * 4 + 0] = Math.pow(rand(), 0.7); // bias toward the bright axis
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
        uSize: { value: MOON_MOTE_SIZE },
        uIntensity: { value: MOON_MOTE_INTENSITY },
        uColor: {
          value: new THREE.Color(MOON_MOTE_COLOR).convertSRGBToLinear()
        },
        // Keep the dust tucked just inside the visible shaft.
        uStart: { value: beam.start.clone().addScaledVector(beam.axis, 0.04) },
        uAxis: { value: beam.axis.clone() },
        uSide: { value: side },
        uUp: { value: up },
        uLength: { value: Math.max(beam.length - 0.06, 1e-3) },
        uTopR: { value: topRadius * 0.9 },
        uPoolR: { value: poolRadius * 0.92 }
      },
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    });
    return { geometry, material };
  }, [beam, topRadius, poolRadius]);

  useFrame((state) => {
    // moonGlowRef is the INVERSE theme mix (set by the scene every frame), so
    // the shaft is full at night and gone by day. ^1.6 easing keeps it fully
    // dark in day mode — no daylight ghost (mirrors LampBeam's easing).
    const eased = Math.pow(Math.max(moonGlowRef.current, 0), 1.6);
    const t = state.clock.getElapsedTime();
    beam.material.uniforms.uTime.value = t;
    beam.material.uniforms.uGlow.value = eased;
    motes.material.uniforms.uTime.value = t;
    motes.material.uniforms.uMix.value = eased;
    motes.material.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    const group = groupRef.current;
    if (group) group.visible = eased > 0.004;
  });

  // raycast={NO_RAYCAST} everywhere: the shaft crosses the desk's click zones —
  // moonlight must never intercept a pointer.
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
