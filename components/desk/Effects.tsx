"use client";

// The cinematic post stack — the last thing light does before it reaches you.
//
// Order is deliberate:
//   1. N8AO     — screen-space contact shadow. Seats books on shelves, keys in
//                 the deck, the platter on its plinth. Runs on the raw render.
//   2. SMAA     — edge cleanup before any blur smears aliasing around.
//   3. DoF      — the film look. The focal plane lives on the turntable (the
//                 hero) at rest and glides to whichever object the visitor
//                 leans into; the desk stays crisp, the room falls away.
//   4. Bloom    — only true emitters (brightness > 1: lamp filament, screen)
//                 cross the threshold. Values are the established baseline.
//   5. Noise    — film grain. SCREEN blending naturally starves the highlights
//                 (cream paper stays clean) and lets grain live in the shadows.
//   6. Vignette — the darkened edge that makes the lamp pool feel like a pool.
//
// All tuning knobs are exported consts so the orchestrator (or a future pass)
// can grade the image without spelunking in JSX.

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  N8AO,
  Noise,
  SMAA,
  Vignette
} from "@react-three/postprocessing";
import type { DepthOfFieldEffect } from "postprocessing";
import * as THREE from "three";
import { useDeskTheme } from "./DeskThemeContext";
import { FOCUS_VIEWS, PLACEMENT, type FocusId } from "./layout";

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

// ——— Depth of field ———
// The hero focal point: the turntable platter (placement x/z, platter height).
const TURNTABLE = PLACEMENT.turntable.position;
export const DOF_HERO_TARGET: [number, number, number] = [
  TURNTABLE[0],
  0.04,
  TURNTABLE[2]
];
// In-focus band in world meters, centered on the focal point. At rest the
// whole desk (±~0.5m of depth) sits inside it and only the room blurs; in a
// close-up the band tightens so the chosen object separates from the desk.
export const DOF_RANGE_REST = 1.15;
export const DOF_RANGE_FOCUS = 0.38;
export const DOF_BOKEH_REST = 2.2;
export const DOF_BOKEH_FOCUS = 3.0;
// Exponential damping rates (1/s). Refocus pulls settle in ~1s — matched to
// the 1.25s camera flights so focus lands just as the dolly does.
export const DOF_REFOCUS_LAMBDA = 4.2;
export const DOF_SHAPE_LAMBDA = 3.2;

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

export default function DeskEffects({ focus }: { focus: FocusId | null }) {
  const { mixRef } = useDeskTheme();
  const aoRef = useRef<N8AOPassHandle>(null);
  const dofRef = useRef<DepthOfFieldEffect>(null);
  // 0 = rest framing (deep focus), 1 = close-up (shallow). Seeded from the
  // mount-time focus so deep links open already graded for the close-up.
  const focusAmount = useRef(focus ? 1 : 0);

  // Shared with the DoF effect once at mount (the wrapper copies it in);
  // afterwards the effect's own target vector is damped every frame.
  const [focusPoint] = useState(
    () =>
      new THREE.Vector3(
        ...(focus ? FOCUS_VIEWS[focus].target : DOF_HERO_TARGET)
      )
  );
  const destination = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }, delta) => {
    const view = focus ? FOCUS_VIEWS[focus] : null;
    destination.set(...(view ? view.target : DOF_HERO_TARGET));

    // Frame-rate-independent glide of the focal POINT between views. The
    // effect's `target` prop is deliberately unused: in this postprocessing
    // version it leaves the CoC pass with poisoned uniforms (the whole
    // composer silently outputs nothing), so we damp our own world-space
    // point and feed the CoC material its camera distance directly.
    focusPoint.lerp(destination, 1 - Math.exp(-DOF_REFOCUS_LAMBDA * delta));

    const dof = dofRef.current;
    if (dof) {
      focusAmount.current = THREE.MathUtils.damp(
        focusAmount.current,
        focus ? 1 : 0,
        DOF_SHAPE_LAMBDA,
        delta
      );
      dof.cocMaterial.worldFocusDistance =
        camera.position.distanceTo(focusPoint);
      dof.cocMaterial.worldFocusRange = THREE.MathUtils.lerp(
        DOF_RANGE_REST,
        DOF_RANGE_FOCUS,
        focusAmount.current
      );
      dof.bokehScale = THREE.MathUtils.lerp(
        DOF_BOKEH_REST,
        DOF_BOKEH_FOCUS,
        focusAmount.current
      );
    }

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
        {/* resolutionScale 0.5: this postprocessing build defaults the
            bokeh chain to FULL canvas resolution (the docstring lies) —
            seven near-fullscreen passes for what is ultimately a blur. */}
        <DepthOfField
          ref={dofRef}
          resolutionScale={0.5}
          worldFocusDistance={1.4}
          worldFocusRange={DOF_RANGE_REST}
          bokehScale={DOF_BOKEH_REST}
        />
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
