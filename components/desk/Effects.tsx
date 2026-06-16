"use client";

// The cinematic post stack — the last thing light does before it reaches you.
//
// Order is deliberate:
//   1. N8AO     — screen-space contact shadow. Seats books on shelves, keys in
//                 the deck, the platter on its plinth. Runs on the raw render.
//   2. SMAA     — edge cleanup before grain or bloom smear aliasing around.
//   3. Bloom    — only true emitters (brightness > 1: lamp filament, screen)
//                 cross the threshold. Values are the established baseline.
//   4. Noise    — film grain. SCREEN blending naturally starves the highlights
//                 (cream paper stays clean) and lets grain live in the shadows.
//   5. Vignette — the darkened edge that makes the lamp pool feel like a pool.
//
// Depth of field is gone (it cost seven near-fullscreen passes and softened
// the very detail the scene exists to show). If it ever returns, remember:
// the DepthOfField `target` prop poisons the whole composer in this
// postprocessing build — damp a world-space focal point and write
// cocMaterial.worldFocusDistance by hand (see CLAUDE.md gotchas).
//
// All tuning knobs are exported consts so the orchestrator (or a future pass)
// can grade the image without spelunking in JSX.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Bloom,
  EffectComposer,
  N8AO,
  Noise,
  SMAA,
  Vignette
} from "@react-three/postprocessing";
import * as THREE from "three";
import { useDeskTheme } from "./DeskThemeContext";

// ——— Ambient occlusion (scene is meters; objects are centimeter-scale) ———
export const AO_RADIUS = 0.07; // ~7cm occlusion reach — book gaps, key wells
export const AO_DISTANCE_FALLOFF = 0.7;
// AO breathes with the lamp: full grounding when lit, eased off in the dark
// so the embers mood doesn't crush to mud.
export const AO_INTENSITY_LIGHT = 2.6;
export const AO_INTENSITY_DARK = 1.6;
// Warm black. Pure black AO reads sooty against this palette; this keeps the
// contact shadows in the same family as the walnut and the night room.
export const AO_COLOR = "#140c06";

// ——— Film grain ———
export const GRAIN_OPACITY = 0.03;

// ——— Bloom + vignette (established baseline, unchanged) ———
export const BLOOM_INTENSITY = 0.5;
export const BLOOM_THRESHOLD = 1;
export const BLOOM_LEVELS = 7;
export const VIGNETTE_OFFSET = 0.26;
export const VIGNETTE_DARKNESS = 0.52;

// n8ao ships without usable type exports through @react-three/postprocessing;
// we only touch the runtime `configuration` proxy, so type it structurally.
type N8AOPassHandle = {
  configuration: { intensity: number };
};

export default function DeskEffects() {
  const { mixRef } = useDeskTheme();
  const aoRef = useRef<N8AOPassHandle>(null);

  useFrame(() => {
    const ao = aoRef.current;
    if (ao) {
      const intensity = THREE.MathUtils.lerp(
        AO_INTENSITY_DARK,
        AO_INTENSITY_LIGHT,
        mixRef.current
      );
      // The configuration object is a reactive proxy — only write on change.
      if (Math.abs(ao.configuration.intensity - intensity) > 1e-3) {
        ao.configuration.intensity = intensity;
      }
    }
  });

  // The element is hoisted to a STABLE identity: @react-three/postprocessing
  // keeps the raw `children` array in its layout-effect deps, so without
  // this every DeskHero state change (including the focus click itself)
  // tore down and rebuilt every pass — full shader re-assembly synchronously
  // in the commit, right as the camera flight starts (and the removed
  // passes leaked, since removePass doesn't dispose). Everything dynamic
  // (focus target, AO intensity) flows through refs in useFrame above, so
  // nothing in this JSX ever needs a re-render.
  const composer = useMemo(
    () => (
      <EffectComposer multisampling={0}>
        <N8AO
          ref={aoRef}
          quality="medium"
          halfRes
          depthAwareUpsampling
          aoRadius={AO_RADIUS}
          distanceFalloff={AO_DISTANCE_FALLOFF}
          intensity={AO_INTENSITY_LIGHT}
          color={AO_COLOR}
        />
        <SMAA />
        <Bloom
          mipmapBlur
          intensity={BLOOM_INTENSITY}
          luminanceThreshold={BLOOM_THRESHOLD}
          levels={BLOOM_LEVELS}
        />
        <Noise opacity={GRAIN_OPACITY} />
        <Vignette
          eskil={false}
          offset={VIGNETTE_OFFSET}
          darkness={VIGNETTE_DARKNESS}
        />
      </EffectComposer>
    ),
    []
  );

  return composer;
}
